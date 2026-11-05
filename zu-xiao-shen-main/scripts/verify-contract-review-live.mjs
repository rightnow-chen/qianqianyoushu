// Explicit live diagnostic: sends only the selected test contract to the configured provider.
// Reports final answers, never API credentials or the model's private reasoning text.
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { analyzeContract, cleanContractTextForReview, getRiskSummary, mergeFindings } from '../src/features/contractReview.js'
import { buildRagSearchQuery, createAiReviewPrompt, parseAiReviewResponse } from '../src/features/aiAssistant.js'
import { redactSensitiveText } from '../src/utils/privacy.js'
import { searchKnowledge } from '../server/rag-engine.mjs'
import { buildChatRequest } from '../server/ai-chat-request.mjs'
import { providerPresets } from '../src/constants/aiConfig.js'

dotenv.config({ quiet: true })
const input = process.argv[2] || '../output/contract-review-advanced-kit-20261009/01_隐蔽组合型_正文.md'
const replayPath = process.argv[3] === '--replay' ? process.argv[4] : null
const source = redactSensitiveText(cleanContractTextForReview(fs.readFileSync(input, 'utf8')))
const profile = { contractType: 'lease', partyRole: 'partyB', reviewDepth: 'strict' }
const local = analyzeContract(source, profile)
const knowledge = searchKnowledge(buildRagSearchQuery({ prompt: '租房合同审查 押金 维修 涨租 解除 违约 入户 管辖', activeTab: 'contract', reviewText: source, findings: local }), 6)
const model = providerPresets.DeepSeek.defaultModel
const body = buildChatRequest({ task: 'contract-review', maxTokens: 6000, messages: [
  { role: 'system', content: '你是严谨的租房合同解读助手，擅长识别押金、涨租、维修、入户、解除、违约金和管辖风险。必须只返回合法 JSON，且证据必须来自原文。' },
  { role: 'user', content: createAiReviewPrompt(source, profile, knowledge) },
] }, { provider: 'DeepSeek', model })
const base = (process.env.AI_PROXY_BASE_URL || providerPresets.DeepSeek.baseUrl).trim().replace(/\/$/, '')
const endpoint = base.endsWith('/chat/completions') ? base
  : /^https:\/\/api\.deepseek\.com$/i.test(base) || base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
const key = process.env.DEEPSEEK_API_KEY || process.env.AI_PROXY_API_KEY
if (!key && !replayPath) throw new Error('未配置审查服务凭据')
const start = Date.now()
const report = { file: path.basename(input), mode: replayPath ? 'saved-response-replay' : 'live', sourceChars: source.length, promptChars: body.messages[1].content.length, requestedModel: model, maxTokens: body.max_tokens, localCount: local.length }
try {
  let data
  if (replayPath) {
    const saved = JSON.parse(fs.readFileSync(replayPath, 'utf8'))
    data = { model: saved.model, usage: saved.usage, choices: [{ finish_reason: saved.finishReason, message: { content: saved.rawAnswer } }] }
  } else {
    const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(55000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) })
    data = await response.json()
    report.httpStatus = response.status
    if (!response.ok) throw Object.assign(new Error('模型服务请求失败'), { code: data.error?.code || 'upstream-error' })
  }
  report.model = data.model
  report.finishReason = data.choices?.[0]?.finish_reason
  report.usage = data.usage
  report.rawAnswer = data.choices?.[0]?.message?.content || ''
  const { findings, qualityReport } = parseAiReviewResponse(data, source)
  report.quality = qualityReport
  report.findings = findings.map(({ title, level, evidence, explain, suggestion }) => ({ title, level, evidence, explain, suggestion }))
  const summary = getRiskSummary(mergeFindings(findings, local), qualityReport)
  report.result = { count: findings.length, label: summary.label, score: summary.score }
  if (qualityReport.status !== 'complete') process.exitCode = 1
} catch (error) {
  report.error = { code: error.code || error.cause?.code || error.name, message: error.code?.startsWith('review-') ? error.message : '审查请求未完成' }
  process.exitCode = 1
}
report.elapsedMs = Date.now() - start
const outputDir = path.resolve('generated-reports/review-reliability')
fs.mkdirSync(outputDir, { recursive: true })
const output = path.join(outputDir, `${path.basename(input).replace(/\.[^.]+$/, '')}${replayPath ? '-replayed' : ''}.json`)
fs.writeFileSync(output, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ...report, rawAnswer: undefined, output }, null, 2))
