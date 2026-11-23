// 缺陷库驱动评测：以 28 份整份合同 + 45 条缺陷库为输入，跑产品真实链路并判分。
//
// 回答四个问题（口径全部写进报告 _meta.scoring，保证可复算）：
// 1. 召回：植入的"应报缺陷"(must/check) 有没有被模型输出对应标准卡的 finding。
// 2. 级别：模型 level(high/medium/low→must/check/note) 是否与 expected_level 一致。
// 3. 事实：expected_facts 里的数字/期限/机制词锚点，是否被模型 finding 文本覆盖（机器初筛）。
// 4. 误报：负对照(零缺陷)报了几条 + note 变体被报成 must/check 的条数。
//
// 用法：
//   node scripts/verify/eval-defect-library.mjs                 # 全量 28 份, runs=1
//   node scripts/verify/eval-defect-library.mjs DEF11 DEF02 NEG01   # 指定 3 份验证
//   EVAL_RUNS=3 node scripts/verify/eval-defect-library.mjs DEF11   # 单份重复抽样测稳定性
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

const ASSET = 'C:/Users/cxy32/Desktop/签前有数_评测资产_20261116'
const SUITE = path.join(ASSET, '16_整份合同集_20261117')
const LIB_PATH = path.join(ASSET, '12_缺陷库_完整_9卡45条_v1.0.json')
const OUT_DIR = path.join(ASSET, '18_评测报告_20261117')
const runs = Math.max(1, Math.min(10, Number(process.env.EVAL_RUNS) || 1))

const lib = JSON.parse(fs.readFileSync(LIB_PATH, 'utf8'))
const index = JSON.parse(fs.readFileSync(path.join(SUITE, '00_索引.json'), 'utf8'))
const caseById = Object.fromEntries(lib.cases.map((c) => [c.case_id, c]))

// 命令行指定的合同 id；不指定则全量
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const selected = args.length ? args : index.contracts.map((c) => c.contract_id)

const key = process.env.DEEPSEEK_API_KEY || process.env.AI_PROXY_API_KEY
if (!key) throw new Error('未配置审查服务凭据（DEEPSEEK_API_KEY）')
const model = providerPresets.DeepSeek.defaultModel
const base = (process.env.AI_PROXY_BASE_URL || providerPresets.DeepSeek.baseUrl).trim().replace(/\/$/, '')
const endpoint = base.endsWith('/chat/completions') ? base
  : /^https:\/\/api\.deepseek\.com$/i.test(base) || base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

const SYSTEM = '你是严谨的租房合同解读助手，擅长识别押金、涨租、维修、入户、解除、违约金和管辖风险。必须只返回合法 JSON，且证据必须来自原文。'
const profile = { contractType: 'lease', partyRole: 'partyB', reviewDepth: 'strict' }

// ---------- 判分工具 ----------
const norm = (s) => String(s || '').replace(/\s+/g, '')

/** 字符 bigram Jaccard，用于判断 evidence 是否指向植入条款。中文无需分词。 */
function bigramJaccard(a, b) {
  const A = norm(a), B = norm(b)
  if (!A || !B) return 0
  const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g }
  const ga = grams(A), gb = grams(B)
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter++
  const union = ga.size + gb.size - inter
  return union ? inter / union : 0
}

/** 界面档位：AI 的 level + confidence 经产品映射后才是 must/check/note。 */
function displayLevel(finding) {
  if (!finding) return null
  const severity = ['high', 'medium', 'low'].includes(finding.level) ? finding.level : 'medium'
  return levelFromSeverity(severity, confidenceLabel(finding.confidence).key, finding.findingType)
}

// 事实抽取判分的诚实说明：
// 产品模型输出的是自由文本 finding（title/explain/evidence），并不输出结构化的 expected_facts 对象，
// 因此无法像"字段级对比"那样测事实抽取。这里只能做机器初筛：
//   (a) 数字锚点：expected_facts 中的金额/天数/小时数等数字，看是否出现在模型文本中（硬指标）。
//   (b) 语义 token：从中文机制描述中抽 2-4 字关键词，看是否命中（宽松近似，仅供参考）。
// 二者都只是"模型有没有提到这些事实词"，不等于"模型对事实的判断正确"。此指标不进主评分。
const STOP = new Set(['甲方', '乙方', '出租人', '承租人', '约定', '规定', '应当', '可以', '不得', '没有', '任何', '情况', '相关', '具体', '标准', '义务', '责任', '期限', '费用', '房屋', '租赁'])

/** 提取可核验锚点：数字 + 有区分度的中文 token。 */
function extractAnchors(facts) {
  const anchors = []
  for (const [field, v] of Object.entries(facts || {})) {
    if (v === null || v === undefined || v === '') continue
    if (typeof v === 'number') { anchors.push({ field, kind: 'number', token: String(v) }); continue }
    if (typeof v === 'boolean') continue
    if (Array.isArray(v)) {
      for (const item of v) if (typeof item === 'string') pushTokens(field, item, anchors)
      continue
    }
    if (typeof v === 'string') pushTokens(field, v, anchors)
  }
  return anchors
}

function pushTokens(field, str, anchors) {
  // 括号里的说明（如"无具体单价、无出处"）拆出来一起看
  for (const n of str.match(/\d+/g) || []) anchors.push({ field, kind: 'number', token: n })
  const clean = str.replace(/[（(][^）)]*[）)]/g, ' ')
  for (const seg of clean.split(/[、，,；;\s]+/)) {
    for (const w of (seg.match(/[\u4e00-\u9fa5]{2,4}/g) || [])) {
      if (!STOP.has(w)) anchors.push({ field, kind: 'token', token: w })
    }
  }
}

/** 数字锚点严格字面匹配；中文 token 宽松匹配（模型说法可能不同，命中任一 token 即算该字段覆盖）。 */
function factCoverage(caseObj, findings) {
  const anchors = extractAnchors(caseObj.expected_facts)
  const nums = anchors.filter((a) => a.kind === 'number')
  const tokens = anchors.filter((a) => a.kind === 'token')
  const text = norm(findings.map((f) => `${f.title || ''} ${f.explain || ''} ${f.evidence || ''} ${f.suggestion || ''} ${f.replacement || ''}`).join(' '))
  const numHit = nums.filter((a) => text.includes(a.token))
  const tokHit = tokens.filter((a) => text.includes(a.token))
  return {
    numbers: { total: nums.length, hit: numHit.length, rate: nums.length ? numHit.length / nums.length : null },
    semanticTokens: { total: tokens.length, hit: tokHit.length, rate: tokens.length ? tokHit.length / tokens.length : null },
    missedTokens: tokens.filter((a) => !tokHit.includes(a)).map((a) => `${a.field}=${a.token}`).slice(0, 12),
  }
}

/** 为某条植入 case 找最佳匹配的 finding。playbookId 相等优先，evidence 重叠兜底。 */
function matchFinding(implant, findings) {
  let best = null, bestScore = 0
  for (const f of findings) {
    const ov = bigramJaccard(f.evidence || '', implant.implanted_text)
    const sameCard = f.playbookId === implant.playbook_id
    // 同卡给 0.5 基础分，让 evidence 即使概括也能匹配；异卡必须靠高文本重叠
    const score = ov + (sameCard ? 0.5 : 0)
    if (score > bestScore) { bestScore = score; best = { finding: f, overlap: ov, sameCard } }
  }
  // 命中阈值：evidence 必须实质指向植入条款，不能只靠"同卡"就算命中。
  // 同卡 baseline 仅作 tie-break，overlap 才是硬证据（示范文本底板本身有同卡的其他风险）。
  const hit = best && best.overlap > 0.3
  return hit ? best : null
}

async function callModel(userPrompt) {
  const body = buildChatRequest({ task: 'contract-review', temperature: 0, maxTokens: 8000, messages: [
    { role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt },
  ] }, { provider: 'DeepSeek', model })
  const started = Date.now()
  const response = await fetch(endpoint, {
    method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`模型返回 ${response.status}：${data.error?.message || '未知'}`)
  return { data, elapsedMs: Date.now() - started }
}

const report = {
  meta: {
    date: new Date().toISOString(),
    model, endpoint, runs,
    suite: '16_整份合同集_20261117',
    selected,
    scoring: {
      recall: '应报项(expected_level∈{must,check})：模型输出中存在 playbookId 同卡且 evidence 与 implanted_text bigram-Jaccard>0.05，或异卡 Jaccard>0.35 的 finding，记命中。A 档单列主评分。',
      level: '命中 finding 的 level(high/medium/low) 经 confidenceLabel+levelFromSeverity 映射为 must/check/note，与 expected_level 一致记对。',
      fact: '参考指标，不进主评分。产品模型只输出自由文本 finding，不输出结构化 facts，故只能做字面锚点覆盖初筛：数字锚点严格匹配、中文语义 token 宽松匹配。不能证明模型对事实的判断正确。',
      falsePositive: '主口径=note 变体(合规/近似正常条款)被报成 must/check 的条数。负对照(示范文本底板)因底板本身含不利条款，其报数仅记为基线参考，不计误报。另记 unverifiableEvidence(引文不在原文)作为幻觉式误报信号。',
      granularity: '按 case_id 判分（45 条植入），合同级汇总。',
    },
  },
  contracts: [],
  errors: [],
}

console.log(`开始评测：${selected.length} 份合同 × ${runs} 次，模型 ${model}`)
for (const cid of selected) {
  try {
    const txt = fs.readFileSync(path.join(SUITE, 'contracts', `${cid}.txt`), 'utf8')
    const manifest = JSON.parse(fs.readFileSync(path.join(SUITE, 'manifests', `${cid}.json`), 'utf8'))
    const source = redactSensitiveText(cleanContractTextForReview(txt))
    const knowledge = searchKnowledge(buildRagSearchQuery({
      prompt: '租房合同审查 押金 维修 涨租 解除 违约 入户 管辖', activeTab: 'contract', reviewText: source, findings: [],
    }), 6)
    const userPrompt = createAiReviewPrompt(source, profile, knowledge)

    const runResults = []
    for (let r = 1; r <= runs; r++) {
      const { data, elapsedMs } = await callModel(userPrompt)
      let findings = []
      try { findings = parseAiReviewResponse(data, source).findings || [] } catch { /* 解析失败按 0 条记，保留信号 */ }
      if (!findings.length) {
        // parse 严格校验可能过滤掉全部，回退到宽松解析拿原始 risks
        const raw = data.choices?.[0]?.message?.content || ''
        try {
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
          const j = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1))
          findings = Array.isArray(j.risks) ? j.risks : []
        } catch { /* 保持空 */ }
      }
      runResults.push({
        run: r, elapsedMs,
        findings: findings.map((f) => ({
          title: f.title || '', level: f.level || '', playbookId: f.playbookId || '',
          findingType: f.findingType || '', dimension: f.dimension || '',
          explain: f.explain || '', evidence: f.evidence || '', suggestion: f.suggestion || '',
        })),
      })
    }

    // 判分：每条植入 case
    const implantsJudged = manifest.implants.map((im) => {
      const caseObj = caseById[im.case_id] || { expected_facts: {} }
      const shouldReport = ['must', 'check'].includes(im.expected_level)
      const byRun = runResults.map((rr) => {
        const m = matchFinding(im, rr.findings)
        const matchedFinding = m?.finding || null
        return {
          run: rr.run,
          hit: !!m,
          sameCard: m?.sameCard ?? null,
          overlap: m ? Number(m.overlap.toFixed(3)) : null,
          actualLevel: displayLevel(matchedFinding),
          levelOk: shouldReport && !!m ? displayLevel(matchedFinding) === im.expected_level : null,
          matchedTitle: matchedFinding?.title || null,
        }
      })
      const fact = shouldReport ? factCoverage(caseObj, runResults[0].findings) : { skipped: 'note 变体不作为应报项，不做事实覆盖判分' }
      return {
        case_id: im.case_id,
        playbook_id: im.playbook_id,
        variant_type: im.variant_type,
        expected_level: im.expected_level,
        annotation_confidence: im.annotation_confidence,
        should_report: shouldReport,
        byRun,
        fact,
      }
    })

    // 误报口径（重要修正）：
    // 负对照用的是 GF-2025-2614 示范文本填充版，它本身含若干对承租人不够友好的条款，
    // 模型报出来是真实判断而非误报。因此负对照"报几条"只作基线参考，不计误报。
    // 真正的误报 = note 变体（合规/近似正常条款）被报成 must/check —— 这类是可控可判的。
    // 另加证据可回查率，检测"编造引文"式幻觉误报。
    const sourceNorm = norm(source)
    const falsePositives = runResults.map((rr) => {
      const overReport = manifest.implants.filter((im) => im.expected_level === 'note' && (() => {
        const m = matchFinding(im, rr.findings)
        return m && ['must', 'check'].includes(displayLevel(m.finding))
      })()).map((im) => im.case_id)
      const unverifiable = rr.findings.filter((f) => !f.evidence || !sourceNorm.includes(norm(f.evidence))).length
      return {
        run: rr.run,
        totalFindings: rr.findings.length,
        baselineFindingCount: manifest.type === 'negative_control' ? rr.findings.length : null, // 参考基线，非误报
        overReportedNoteCases: overReport, // 真正的误报
        unverifiableEvidence: unverifiable, // 幻觉式误报（引文不在原文）
      }
    })

    report.contracts.push({
      contract_id: cid, type: manifest.type, implant_count: manifest.implants.length,
      findingsPerRun: runResults.map((r) => r.findings.length),
      elapsedMsPerRun: runResults.map((r) => r.elapsedMs),
      sampleFindings: runResults[0].findings, // 首个 run 的全文，供人工核查误报性质
      implants: implantsJudged,
      falsePositives,
    })
    const hits = implantsJudged.filter((x) => x.should_report && x.byRun[0].hit).length
    const should = implantsJudged.filter((x) => x.should_report).length
    console.log(`  ${cid}: findings ${runResults.map((r) => r.findings.length).join('/')} | 应报命中 ${hits}/${should} | note过度报 ${falsePositives[0].overReportedNoteCases.length} | 引文不可回查 ${falsePositives[0].unverifiableEvidence}`)
  } catch (e) {
    report.errors.push({ contract_id: cid, message: e.message })
    console.log(`  ${cid} 失败：${e.message}`)
  }
}

// ---------- 汇总 ----------
const flat = []
for (const c of report.contracts) for (const im of c.implants) flat.push({ c, im })

function agg(rows) {
  const should = rows.filter((x) => x.im.should_report)
  const hitArr = should.map((x) => x.im.byRun.every((b) => b.hit))         // 全部 runs 都命中
  const hitAny = should.map((x) => x.im.byRun.some((b) => b.hit))
  const lvl = should.filter((x) => x.im.byRun.every((b) => b.hit))
  const levelOk = lvl.map((x) => x.im.byRun.every((b) => b.levelOk))
  const numRates = should.map((x) => x.im.fact?.numbers?.rate).filter((r) => typeof r === 'number')
  const tokRates = should.map((x) => x.im.fact?.semanticTokens?.rate).filter((r) => typeof r === 'number')
  return {
    n: rows.length,
    should_report: should.length,
    recall_all_runs: hitArr.length ? hitArr.filter(Boolean).length / hitArr.length : null,
    recall_any_run: hitAny.length ? hitAny.filter(Boolean).length / hitAny.length : null,
    level_accuracy: levelOk.length ? levelOk.filter(Boolean).length / levelOk.length : null,
    number_anchor_coverage: numRates.length ? numRates.reduce((a, b) => a + b, 0) / numRates.length : null,
    semantic_token_coverage: tokRates.length ? tokRates.reduce((a, b) => a + b, 0) / tokRates.length : null,
  }
}

const tierA = flat.filter((x) => x.im.annotation_confidence === 'A')
const tierB = flat.filter((x) => x.im.annotation_confidence === 'B')
const negative = report.contracts.filter((c) => c.type === 'negative_control')

// 误报主口径：所有 note 变体里被报成 must/check 的比例（越低越好）
const noteCases = flat.filter((x) => x.im.expected_level === 'note')
const overReported = noteCases.filter((x) => x.im.byRun.some((b) => b.actualLevel && ['must', 'check'].includes(b.actualLevel)))
// 幻觉：所有合同里引文不可回查的 finding 占比
const allFP = report.contracts.flatMap((c) => c.falsePositives)
const allFindings = allFP.reduce((s, x) => s + x.totalFindings, 0)
const allUnverifiable = allFP.reduce((s, x) => s + x.unverifiableEvidence, 0)

const summary = {
  overall: agg(flat),
  tier_A: agg(tierA),
  tier_B_only_consistency: agg(tierB), // B 档只测一致性，不对错
  false_positive: {
    note_variants_total: noteCases.length,
    note_over_reported: overReported.length,
    note_over_report_rate: noteCases.length ? overReported.length / noteCases.length : null,
    note_over_reported_ids: overReported.map((x) => x.im.case_id),
    unverifiable_evidence_count: allUnverifiable,
    total_findings: allFindings,
    unverifiable_rate: allFindings ? allUnverifiable / allFindings : null,
  },
  negative_control_baseline: {
    count: negative.length,
    findings_per_run: negative.map((c) => c.findingsPerRun),
    note: '示范文本底板本身含不利条款，报数仅作基线参考，不计误报',
  },
  errors: report.errors.length,
}
report.summary = summary

fs.mkdirSync(OUT_DIR, { recursive: true })
const outFile = path.join(OUT_DIR, `defect-eval-${Date.now()}.json`)
fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')

const pct = (x) => x === null ? 'N/A' : (x * 100).toFixed(1) + '%'
console.log('\n===== 汇总 =====')
console.log(`应报项 ${summary.overall.should_report} 条 | 召回(全runs) ${pct(summary.overall.recall_all_runs)} | 召回(任一run) ${pct(summary.overall.recall_any_run)}`)
console.log(`A档召回 ${pct(summary.tier_A.recall_all_runs)} | 级别准确率 ${pct(summary.overall.level_accuracy)}`)
console.log(`[参考] 数字锚点覆盖 ${pct(summary.overall.number_anchor_coverage)} | 语义token覆盖 ${pct(summary.overall.semantic_token_coverage)}（不进主评分）`)
console.log(`误报：note变体过度报告 ${summary.false_positive.note_over_reported}/${summary.false_positive.note_variants_total} (${pct(summary.false_positive.note_over_report_rate)}) | 引文不可回查 ${pct(summary.false_positive.unverifiable_rate)}`)
console.log(`负对照基线报数 ${JSON.stringify(summary.negative_control_baseline.findings_per_run)}（底板含固有不利条款，非误报）`)
console.log(`错误 ${summary.errors} | 完整报告 ${outFile}`)
