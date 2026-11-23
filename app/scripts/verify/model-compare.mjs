// 模型对照实验：同一份合同、同一 prompt、同一 RAG 上下文，只换 model，
// 比较条数/核验通过率/耗时/成本，用数据决定审查用哪个模型。不改线上行为。
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { analyzeContract, cleanContractTextForReview, getRiskSummary, mergeFindings } from '../../src/features/contractReview.js'
import { buildRagSearchQuery, createAiReviewPrompt, parseAiReviewResponse } from '../../src/features/aiAssistant.js'
import { redactSensitiveText } from '../../src/utils/privacy.js'
import { searchKnowledge } from '../../server/rag-engine.mjs'
import { buildChatRequest } from '../../server/ai-chat-request.mjs'
import { providerPresets } from '../../src/constants/aiConfig.js'

dotenv.config({ quiet: true })

const MODELS = process.argv.slice(2)
if (!MODELS.length) MODELS.push('deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner')

const input = '../deliverables/test-kits/contract-review-advanced-kit-20261009/01_隐蔽组合型_正文.md'
const source = redactSensitiveText(cleanContractTextForReview(fs.readFileSync(input, 'utf8')))
const profile = { contractType: 'lease', partyRole: 'partyB', reviewDepth: 'strict' }

const local = analyzeContract(source, profile)
const knowledge = searchKnowledge(
  buildRagSearchQuery({
    prompt: '租房合同审查 押金 维修 涨租 解除 违约 入户 管辖',
    activeTab: 'contract',
    reviewText: source,
    findings: local,
  }),
  6,
)

const base = (process.env.AI_PROXY_BASE_URL || providerPresets.DeepSeek.baseUrl).trim().replace(/\/$/, '')
const endpoint = base.endsWith('/chat/completions') ? base : `${base}/v1/chat/completions`.replace('/v1/v1/', '/v1/')
const key = process.env.DEEPSEEK_API_KEY || process.env.AI_PROXY_API_KEY
if (!key) throw new Error('未配置审查服务凭据')

const prompt = createAiReviewPrompt(source, profile, knowledge)
console.log(`合同 ${source.length} 字 | 本地规则 ${local.length} 条 | prompt ${prompt.length} 字`)
console.log(`RAG 片段 ${knowledge.length} 条 | 端点 ${endpoint}`)
console.log('')

const rows = []

for (const model of MODELS) {
  const body = buildChatRequest(
    {
      task: 'contract-review',
      maxTokens: 6000,
      messages: [
        {
          role: 'system',
          content: '你是严谨的租房合同解读助手，擅长识别押金、涨租、维修、入户、解除、违约金和管辖风险。必须只返回合法 JSON，且证据必须来自原文。',
        },
        { role: 'user', content: prompt },
      ],
    },
    { provider: 'DeepSeek', model },
  )
  // reasoner 不接受 temperature，避免上游 4xx 干扰对照
  if (/reasoner/i.test(model)) delete body.temperature

  const started = Date.now()
  const row = { model, ok: false }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(180_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    })
    row.httpStatus = response.status
    const data = await response.json()
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${data?.error?.message || 'upstream error'}`)
    row.elapsedMs = Date.now() - started
    row.returnedModel = data.model
    row.finishReason = data.choices?.[0]?.finish_reason
    row.promptTokens = data.usage?.prompt_tokens
    row.completionTokens = data.usage?.completion_tokens
    row.reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens

    const { findings, qualityReport } = parseAiReviewResponse(data, source)
    row.ok = true
    row.aiCount = findings.length
    row.quality = {
      status: qualityReport.status,
      rawCount: qualityReport.rawCount,
      verified: qualityReport.verifiedRawCount,
      accepted: qualityReport.acceptedCount,
      rejected: qualityReport.rejectedCount,
    }
    row.titles = findings.map((item) => `${item.level}: ${item.title}`)
    const merged = mergeFindings(findings, local)
    const summary = getRiskSummary(merged, qualityReport)
    row.merged = { count: merged.length, label: summary.label, score: summary.score }
  } catch (error) {
    row.elapsedMs = Date.now() - started
    row.error = error?.code || error?.name
    row.message = String(error?.message || '').slice(0, 200)
  }
  rows.push(row)
  console.log(`=== ${model} ===`)
  console.log(JSON.stringify(row, null, 2))
  console.log('')
}

const outputDir = path.resolve('generated-reports/model-compare')
fs.mkdirSync(outputDir, { recursive: true })
const output = path.join(outputDir, `compare-${Date.now()}.json`)
fs.writeFileSync(output, JSON.stringify({ source: path.basename(input), sourceChars: source.length, localCount: local.length, rows }, null, 2))
console.log('已写入', output)
