// 合同审查效果评测：重复抽样 + 通用大模型基线对照。
//
// 回答两个问题：
// 1. 功能效果：产品链路（标准卡+RAG+两阶段约束）vs 同模型裸 prompt，对标准答案 A1-A14 的召回。
// 2. 输出稳定性：同一份合同跑 N 次，风险条数、分档分布、每个标准点的命中与分档是否漂移。
//
// 判分是机器初筛（关键词锚点），不是法律正确性认证。原始回答只落盘统计，不保存推理文本。
// 用法：node scripts/verify/eval-quality.mjs [次数，默认5]
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { buildRagSearchQuery, createAiReviewPrompt, parseAiReviewResponse } from '../../src/features/aiAssistant.js'
import { cleanContractTextForReview } from '../../src/features/contractReview.js'
import { confidenceLabel } from '../../src/features/riskMapper.js'
import { levelFromSeverity } from '../../src/features/riskModel.js'
import { redactSensitiveText } from '../../src/utils/privacy.js'
import { searchKnowledge } from '../../server/rag-engine.mjs'
import { buildChatRequest } from '../../server/ai-chat-request.mjs'
import { providerPresets } from '../../src/constants/aiConfig.js'

dotenv.config({ quiet: true })
const runs = Math.max(1, Math.min(10, Number(process.argv[2]) || 5))
const golden = JSON.parse(fs.readFileSync(path.resolve('scripts/verify/golden-set-01.json'), 'utf8'))
const source = redactSensitiveText(cleanContractTextForReview(
  fs.readFileSync(path.resolve(golden.source), 'utf8'),
))
const profile = { contractType: 'lease', partyRole: 'partyB', reviewDepth: 'strict' }
const model = providerPresets.DeepSeek.defaultModel
const key = process.env.DEEPSEEK_API_KEY || process.env.AI_PROXY_API_KEY
if (!key) throw new Error('未配置审查服务凭据（DEEPSEEK_API_KEY）')

const base = (process.env.AI_PROXY_BASE_URL || providerPresets.DeepSeek.baseUrl).trim().replace(/\/$/, '')
const endpoint = base.endsWith('/chat/completions') ? base
  : /^https:\/\/api\.deepseek\.com$/i.test(base) || base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

const SYSTEM = '你是严谨的租房合同解读助手，擅长识别押金、涨租、维修、入户、解除、违约金和管辖风险。必须只返回合法 JSON，且证据必须来自原文。'
const BASELINE_SYSTEM = '你是一个通用 AI 助手。'
const BASELINE_USER = `请阅读以下房屋租赁合同，列出所有对承租人不利或需要注意的风险点。\n用 JSON 返回：{"risks":[{"title":"...","level":"high 或 medium 或 low","explain":"...","evidence":"原文片段"}]}\n只返回 JSON。\n\n合同正文：\n${source}`

const knowledge = searchKnowledge(buildRagSearchQuery({
  prompt: '租房合同审查 押金 维修 涨租 解除 违约 入户 管辖',
  activeTab: 'contract', reviewText: source, findings: [],
}), 6)
let productPrompt = createAiReviewPrompt(source, profile, knowledge)
// 对照实验变体：只改措辞，不改产品代码。EVAL_PROMPT_VARIANT=fixed 时启用。
// 假设 A：原提示词「每个标准卡必须明确输出命中/未命中/待核对」被模型当成输出配额，
//         而 JSON 格式里根本没有写这个判断的字段 → 每卡凑一条，卡外风险不报。
// 假设 B：level 只写了「high 或 medium 或 low」，没有任何判定标准 → 同一条风险分档漂移。
const variant = process.env.EVAL_PROMPT_VARIANT === 'fixed' ? 'fixed' : 'current'
if (variant === 'fixed') {
  const before = productPrompt
  productPrompt = productPrompt
    .replace(
      '每个标准卡必须明确输出命中、未命中或待核对，不能因为信息缺失就自动判定为高风险。',
      '标准卡只是检查维度清单，不是输出配额：某张卡没有具体不利机制就不要为它输出风险；同一张卡下有多个独立不利机制时应分别输出；卡片清单以外的风险只要满足上面的条件也要输出。',
    )
    .replace(
      '"level": "high 或 medium 或 low"',
      '"level": "high 或 medium 或 low；high=签字后直接造成金钱损失、押金没收、单方涨价、无条件换锁、个人信息外泄或丧失法定权利；medium=条件或程序明显不利但需结合实际执行判断；low=正常条款中值得留意之处"',
    )
  if (productPrompt === before) throw new Error('变体替换未生效：prompt 措辞已变化，请更新实验脚本')
}

async function callModel({ system, user }) {
  const body = buildChatRequest({ task: 'contract-review', temperature: 0, maxTokens: 6000, messages: [
    { role: 'system', content: system }, { role: 'user', content: user },
  ] }, { provider: 'DeepSeek', model })
  // 显式覆盖仅供对照实验用；默认跟随产品链路锁 0。
  if (process.env.EVAL_TEMP !== undefined) body.temperature = Number(process.env.EVAL_TEMP)
  const started = Date.now()
  const response = await fetch(endpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(90000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`模型服务返回 ${response.status}：${data.error?.message || '未知错误'}`)
  return {
    raw: data.choices?.[0]?.message?.content || '',
    data,
    elapsedMs: Date.now() - started,
    completionTokens: data.usage?.completion_tokens || 0,
    finishReason: data.choices?.[0]?.finish_reason,
    returnedModel: data.model,
  }
}

/** 从原始回答宽松解析（基线没有证据校验，便于公平对比 prompt 效果）。 */
function rawFindings(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const data = JSON.parse(cleaned.slice(start, end + 1))
    return Array.isArray(data.risks) ? data.risks : []
  } catch {
    return []
  }
}

function hitIds(findings) {
  const texts = findings.map((f) => `${f.title || ''} ${f.explain || ''} ${f.evidence || ''}`.toLowerCase())
  const hits = {}
  for (const item of golden.items) {
    const anchors = item.anchors.map((a) => a.toLowerCase())
    hits[item.id] = texts.some((t) => anchors.filter((a) => t.includes(a)).length >= 2)
  }
  return hits
}

/** 界面上的档位：AI 的 high/medium/low 经置信度映射后才是用户看到的 must/check/note。 */
function displayLevel(finding) {
  if (!finding) return null
  const severity = ['high', 'medium', 'low'].includes(finding.level) ? finding.level : 'medium'
  return levelFromSeverity(severity, confidenceLabel(finding.confidence).key)
}

function levelOfItem(findings, item) {
  const anchors = item.anchors.map((a) => a.toLowerCase())
  const matched = findings.find((f) => {
    const text = `${f.title || ''} ${f.explain || ''} ${f.evidence || ''}`.toLowerCase()
    return anchors.filter((a) => text.includes(a)).length >= 2
  })
  return displayLevel(matched)
}

function mode(values) {
  const counts = {}
  for (const v of values) if (v) counts[v] = (counts[v] || 0) + 1
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return top ? { value: top[0], count: top[1] } : null
}

const report = {
  case: golden.case,
  sourceChars: source.length,
  promptChars: productPrompt.length,
  requestedModel: model,
  runs,
  product: [],
  baseline: null,
  errors: [],
}

console.log(`开始评测：${golden.case}，产品链路 ${runs} 次 + 基线 1 次，模型 ${model}`)
for (let i = 1; i <= runs; i += 1) {
  try {
    const res = await callModel({ system: SYSTEM, user: productPrompt })
    const findings = rawFindings(res.raw)
    let verifiedCount = null
    let verifiedLevels = null
    try {
      const parsed = parseAiReviewResponse(res.data, source)
      verifiedCount = parsed.findings.length
      verifiedLevels = parsed.findings.map((f) => displayLevel(f))
    } catch {
      // 校验失败本身就是要记录的信号，不中断评测
    }
    const levels = findings.map(displayLevel)
    const row = {
      run: i,
      rawCount: findings.length,
      verifiedCount,
      counts: { must: levels.filter((l) => l === 'must').length, check: levels.filter((l) => l === 'check').length, note: levels.filter((l) => l === 'note').length },
      verifiedCounts: verifiedLevels ? { must: verifiedLevels.filter((l) => l === 'must').length, check: verifiedLevels.filter((l) => l === 'check').length, note: verifiedLevels.filter((l) => l === 'note').length } : null,
      hits: hitIds(findings),
      findings: findings.map((f) => ({ title: f.title || '', level: f.level || '', explain: f.explain || '', evidence: f.evidence || '' })),
      itemLevels: Object.fromEntries(golden.items.map((item) => [item.id, levelOfItem(findings, item)])),
      elapsedMs: res.elapsedMs,
      completionTokens: res.completionTokens,
      finishReason: res.finishReason,
      returnedModel: res.returnedModel,
    }
    report.product.push(row)
    console.log(`  第 ${i} 次：原始 ${row.rawCount} 条 / 校验后 ${verifiedCount} 条，分档 ${row.counts.must}/${row.counts.check}/${row.counts.note}，命中 ${Object.values(row.hits).filter(Boolean).length}/${golden.items.length}，${res.elapsedMs}ms`)
  } catch (error) {
    report.errors.push({ run: i, message: error.message })
    console.log(`  第 ${i} 次失败：${error.message}`)
  }
}

try {
  const res = await callModel({ system: BASELINE_SYSTEM, user: BASELINE_USER })
  const findings = rawFindings(res.raw)
  report.baseline = {
    rawCount: findings.length,
    hits: hitIds(findings),
    findings: findings.map((f) => ({ title: f.title || '', level: f.level || '', explain: f.explain || '', evidence: f.evidence || '' })),
    itemLevels: Object.fromEntries(golden.items.map((item) => [item.id, levelOfItem(findings, item)])),
    elapsedMs: res.elapsedMs,
    completionTokens: res.completionTokens,
    finishReason: res.finishReason,
    returnedModel: res.returnedModel,
  }
  console.log(`  裸模型基线：${findings.length} 条，命中 ${Object.values(report.baseline.hits).filter(Boolean).length}/${golden.items.length}`)
} catch (error) {
  report.errors.push({ run: 'baseline', message: error.message })
}

// ---- 汇总 ----
const rows = report.product
const n = rows.length || 1
const summary = {
  productRawCounts: rows.map((r) => r.rawCount),
  productVerifiedCounts: rows.map((r) => r.verifiedCount),
  rawCountSpread: rows.length ? Math.max(...rows.map((r) => r.rawCount)) - Math.min(...rows.map((r) => r.rawCount)) : null,
  avgRecall: rows.length ? rows.reduce((s, r) => s + Object.values(r.hits).filter(Boolean).length, 0) / (n * golden.items.length) : null,
  baselineRecall: report.baseline ? Object.values(report.baseline.hits).filter(Boolean).length / golden.items.length : null,
  items: golden.items.map((item) => {
    const levels = rows.map((r) => r.itemLevels[item.id])
    const present = levels.filter(Boolean)
    const m = mode(levels)
    return {
      id: item.id,
      label: item.label,
      mustHit: golden.mustHit.includes(item.id),
      hitRate: present.length / n,
      levelMode: m?.value || null,
      levelConsistency: present.length ? m.count / present.length : null,
      levels,
      baselineHit: report.baseline?.hits[item.id] ?? null,
    }
  }),
}
// 只统计「命中过」的项：从未命中的项没有档位可言，算作 0 会把一致性人为压低。
const withLevels = summary.items.filter((it) => it.levelConsistency > 0)
summary.avgLevelConsistency = withLevels.length
  ? withLevels.reduce((s, it) => s + it.levelConsistency, 0) / withLevels.length
  : null
summary.itemsWithLevel = withLevels.length
summary.mustHitCoverage = summary.items.filter((it) => it.mustHit && it.hitRate === 1).length

// 证据是否逐字可回查（忽略空白差异）。裸模型召回高可能是靠编造引文，必须分开看。
const normText = (s) => String(s || '').replace(/\s+/g, '')
const sourceNorm = normText(source)
const evidenceRate = (findings = []) => findings.length
  ? findings.filter((f) => f.evidence && sourceNorm.includes(normText(f.evidence))).length / findings.length
  : null
summary.productEvidenceVerifiedRate = rows.length
  ? rows.reduce((s, r) => s + (evidenceRate(r.findings) || 0), 0) / rows.length
  : null
summary.baselineEvidenceVerifiedRate = report.baseline ? evidenceRate(report.baseline.findings) : null
report.summary = summary

const outDir = path.resolve('generated-reports/eval-quality')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `eval-${Date.now()}.json`)
fs.writeFileSync(outFile, JSON.stringify(report, null, 2))

console.log('\n===== 汇总 =====')
console.log(`产品链路原始条数：${summary.productRawCounts.join(' / ')}（极差 ${summary.rawCountSpread}）`)
console.log(`校验后条数：${summary.productVerifiedCounts.join(' / ')}`)
console.log(`平均召回：${(summary.avgRecall * 100).toFixed(1)}%  |  裸模型基线：${summary.baselineRecall === null ? '失败' : (summary.baselineRecall * 100).toFixed(1) + '%'}`)
console.log(`证据可逐字回查：产品 ${(summary.productEvidenceVerifiedRate * 100).toFixed(0)}%  |  裸模型 ${(summary.baselineEvidenceVerifiedRate * 100).toFixed(0)}%`)
console.log(`必命中项全稳：${summary.mustHitCoverage}/${golden.mustHit.length}  |  命中项分档一致性：${(summary.avgLevelConsistency * 100).toFixed(1)}%（${summary.itemsWithLevel}项）`)
console.log('\n逐项：')
for (const it of summary.items) {
  const flag = it.mustHit ? '*' : ' '
  console.log(` ${flag}${it.id} 命中${(it.hitRate * 100).toFixed(0)}% 档位${(it.levelMode || '-').padEnd(5)} 一致${((it.levelConsistency || 0) * 100).toFixed(0)}% 基线${it.baselineHit ? '中' : '漏'} ${it.label}`)
}
console.log(`\n完整报告：${outFile}`)
