// 引擎 → 产品模型的唯一桥。左边是 `analyzeContract` 的输出（高/中/低 + 证据 + 法条），
// 右边是界面认的九件套（必须改/建议确认/仅提醒 + 金额 + 原句 + 建议 + 为什么 + 话术 + 回法 + 法条）。
//
// 三条纪律：
// 1. 语义只在输出层换算，规则库内部保持 high/medium/low，不改引擎（避免改一处崩一片）。
// 2. 金额一律走 amountKey，由 amountEngine 从月租/押金/租期算，这里绝不出现硬编码数字。
// 3. 引擎给不出的东西（话术、回法、金额）显式降级，不编造：缺就标 null，界面据此少显示一块。

import { levelFromSeverity } from './riskModel.js'
import { amountForRisk, formatMoney } from './amountEngine.js'
import { scriptFor } from './scriptTemplates.js'

// 九类条款的识别规则。用「命中关键词数量」打分，而不是先命中就先赢——
// 否则「租客养宠物就扣押金」会被算成押金问题，用户看到的分类就漂了。
// 同分时按数组顺序取靠前的，所以越靠前的类别越具体。
const CAT_RULES = [
  { cat: '押金', keys: ['deposit', 'cleaning', 'deduction', '押金', '保证金'] },
  { cat: '提前退租', keys: ['termination', 'early-exit', 'lockout', 'abandoned', 'holdover', 'overdue', 'penalty-stacking'] },
  { cat: '维修责任', keys: ['maintenance', 'repair', 'warranty', 'restoration'] },
  { cat: '水电费用', keys: ['utility', 'water', 'electric', 'common-area', 'agency-fee', 'rental-tax'] },
  { cat: '租金调整', keys: ['rent', 'renewal', 'prepay', 'late-fee'] },
  { cat: '居住安宁', keys: ['entry', 'inspection', 'reserved-space', 'safety'] },
  { cat: '转租', keys: ['sublet', 'share', 'roommate', 'co-tenant', '转租'] },
  { cat: '宠物', keys: ['pet', '宠物'] },
  { cat: '附件', keys: ['deliverable', 'appliance', 'device', 'inventory', '附件', '设施'] },
]

// 只有能算成钱的规则才挂金额键；挂不上的写「机制」，不硬凑数字（PRD FR-06）。
// 这里按规则 id 判断而不是按类别，因为同一类里「扣款」能定价、「退还慢」不能定价。
const AMOUNT_BY_ID = [
  { re: /deposit.*(deduction|cleaning|forfeit|depreciation)|cleaning|deduction/, key: 'depositDeduct' },
  { re: /early-exit|termination|lockout|holdover/, key: 'termination' },
  { re: /maintenance|repair|warranty|restoration/, key: 'repair' },
  { re: /utility|water|electric|common-area/, key: 'utility' },
  { re: /renewal|rent-up|hike/, key: 'rentHike' },
]

// 话术按「这条到底在争什么」选模板，不按类别选。
// 「逾期违约金 5%/日」归在租金类，但话术不能说成「续租涨租」，否则用户照着念会跑偏。
const TEMPLATE_BY_ID = [
  { re: /late-fee|penalty|default|breach|overdue/, key: '违约金' },
  { re: /oral|interpretation|jurisdiction|lien|waiver/, key: '其他' },
]

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

/** 「第4条」「第十二条」→ 数字；认不出就 null，不猜。 */
export function parseArticle(clause) {
  if (!clause) return null
  const digits = String(clause).match(/\d+/)
  if (digits) return Number(digits[0])
  const cn = String(clause).match(/第([一二三四五六七八九十]+)条/)
  if (!cn) return null
  const raw = cn[1]
  if (raw.length === 1) return CN_NUM[raw] || null
  if (raw.startsWith('十')) return 10 + (CN_NUM[raw[1]] || 0)
  if (raw.endsWith('十')) return (CN_NUM[raw[0]] || 0) * 10
  return (CN_NUM[raw[0]] || 0) * 10 + (CN_NUM[raw[1]] || 0)
}

export function categoryOf(finding) {
  const score = (source) => {
    const text = String(source || '').toLowerCase()
    let best = { cat: '其他', score: 0 }
    for (const rule of CAT_RULES) {
      const hits = rule.keys.filter((key) => text.includes(key.toLowerCase())).length
      if (hits > best.score) best = { cat: rule.cat, score: hits }
    }
    return best
  }
  // 先看规则 id（最可靠），认不出再看标题。标题里常同时出现「押金」「退租」，
  // 直接混在一起算会让分类随机漂移。都认不出就老实归到「其他」，不硬塞进九类里。
  const byId = score(finding.id)
  if (byId.score > 0) return byId.cat
  return score(`${finding.title || ''} ${finding.dimension || ''}`).cat
}

/** 能定价的按 id 挂金额键，定不了价返回 null。 */
export function amountKeyOf(finding) {
  const id = String(finding.id || '')
  const hit = AMOUNT_BY_ID.find((rule) => rule.re.test(id))
  return hit ? hit.key : null
}

/** 话术模板：先按规则家族选，选不到再退回类别。 */
export function templateKeyOf(finding, cat) {
  const id = String(finding.id || '')
  const hit = TEMPLATE_BY_ID.find((rule) => rule.re.test(id))
  return hit ? hit.key : cat
}

/** 数值置信度 → 三档中文口径（PRD FR-10）。 */
export function confidenceLabel(value) {
  const num = typeof value === 'number' ? value : 0.9
  if (num >= 0.85) return { key: 'confirmed', label: '确定' }
  if (num >= 0.7) return { key: 'verify', label: '需确认' }
  return { key: 'inferred', label: 'AI 推断' }
}

/** 条文索引：真合同常用「一、二、三、」而不是「第 X 条」，引擎的 clause 字段会认不出。 */
function buildClauseIndex(text = '') {
  const index = []
  String(text)
    .split(/\r?\n/)
    .forEach((line, i) => {
      const match = line.match(/^\s*(?:第([一二三四五六七八九十百]+)条|([一二三四五六七八九十]+)\s*、)/)
      if (!match) return
      const article = parseArticle(match[1] ? `第${match[1]}条` : `第${match[2]}条`)
      if (article) index.push({ line: i + 1, article })
    })
  return index
}

function locationOf(finding, { lineCount = 0, pages = 0, clauseIndex = [] } = {}) {
  const loc = finding.evidenceLocation || {}
  const line = Number(loc.line) || 1
  let article = parseArticle(loc.clause)
  if (article === null && clauseIndex.length) {
    const before = clauseIndex.filter((item) => item.line <= line)
    if (before.length) article = before[before.length - 1].article
  }
  let page = null
  if (pages > 0 && lineCount > 0) {
    page = Math.min(pages, Math.max(1, Math.ceil((line / lineCount) * pages)))
  }
  return { article, sentence: 1, page, line }
}

/** 建议措辞太长时截一句，别把半句话塞进微信话术。 */
function shortAsk(suggestion) {
  if (!suggestion) return ''
  const first = suggestion.split(/[。；;]/)[0].trim()
  const text = first.length > 30 ? `${first.slice(0, 30)}…` : first
  return `改成「${text}」`
}

/**
 * @param {Array} findings analyzeContract 的输出
 * @param {{contractText?:string, pages?:number, amounts?:object}} options
 * @returns {Array} 九件套风险数组
 */
export function toRiskModel(findings = [], options = {}) {
  const { contractText = '', pages = 0, amounts = null } = options
  const lineCount = contractText ? contractText.split(/\r?\n/).length : 0
  const clauseIndex = buildClauseIndex(contractText)

  const risks = findings.map((finding, index) => {
    const cat = categoryOf(finding)
    const confidence = confidenceLabel(finding.confidence)
    const level = levelFromSeverity(finding.level, confidence.key)
    const location = locationOf(finding, { lineCount, pages, clauseIndex })
    const amountKey = amountKeyOf(finding)
    const suggestion = (finding.replacement || finding.suggestion || '').trim()
    const original = (finding.evidence || finding.replaceFrom || '').trim()

    const risk = {
      id: finding.id || `engine-${index + 1}`,
      level,
      cat,
      severity: finding.level === 'high' ? '高' : finding.level === 'medium' ? '中' : '低',
      title: finding.title ? `${cat}：${finding.title}` : cat,
      amountKey,
      location,
      confidence: confidence.label,
      consequence: (finding.explain || finding.evidence || '').trim(),
      original,
      suggestion,
      why: (finding.explain || '').trim() || '这条写法让责任边界不清，签字后解释权在对方。',
      law: {
        name: finding.legalLaw || null,
        basis: finding.legalBasis || '',
        url: finding.legalUrl || '',
        verified: Boolean(finding.legalLaw),
      },
      // 引擎没有的东西：先留空，下面补话术时一起填
      scripts: null,
      objections: [],
      hasSuggestion: Boolean(suggestion),
      source: 'engine',
      score: finding.score || 0,
    }

    const amount = amounts
      ? amountForRisk(risk, amounts)
      : { text: '—', kind: 'none' }
    const ask = shortAsk(suggestion) || '把标准写清楚'
    risk.scripts = scriptFor(templateKeyOf(finding, cat), {
      article: location.article,
      amountText: amount.kind === 'loss' ? `这笔最多 ¥${formatMoney(amount.value)}` : amount.text,
      ask,
    })
    risk.objections = risk.scripts.objections
    if (amount.kind !== 'none') {
      risk.consequence = `${risk.consequence}${risk.consequence.endsWith('。') ? '' : '。'}这项按合同金额估算约 ${amount.text}。`
    }
    return risk
  })

  return sortRisks(risks)
}

const LEVEL_RANK = { must: 0, check: 1, note: 2 }

/** 默认按严重程度排，同级按原文顺序（PRD T2 排序口径）。 */
export function sortRisks(risks = [], order = 'severity') {
  const list = [...risks]
  if (order === 'source') {
    return list.sort((a, b) => (a.location?.line || 0) - (b.location?.line || 0))
  }
  return list.sort((a, b) => {
    const gap = (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3)
    return gap !== 0 ? gap : (a.location?.line || 0) - (b.location?.line || 0)
  })
}

/**
 * 把 contractFacts 的抽取结果折成确认页需要的三个金额字段。
 * 抽不到就返回 null——确认页让用户自己填，绝不拿默认值顶替（默认值只在演示数据里出现）。
 */
export function metaFromFacts(facts = {}) {
  const amounts = facts.amounts || []
  const pickAmount = (keys) =>
    amounts.find(
      (item) => keys.some((key) => String(item.key || '').includes(key)) && !String(item.raw || '').includes('%'),
    )
  const rent = pickAmount(['月租金', '租金', '房租'])
  const deposit = pickAmount(['押金', '保证金', '定金'])
  const term = (facts.terms || []).find(
    (item) => /个月/.test(String(item.raw || '')) && String(item.key || '').includes('期限'),
  )
  return {
    rent: rent ? rent.value : null,
    deposit: deposit ? deposit.value : null,
    months: term ? term.value : null,
  }
}

/** 降级判断：引擎没给出可用结论时，界面要能说清为什么，而不是显示一张空表。 */
export function describeDegradation(findings = [], risks = []) {
  if (!findings.length) {
    return { level: 'failed', message: '这次没读出有效条款，可能是扫描不清，建议重拍第 1 页或直接粘贴文字。' }
  }
  if (!risks.length) {
    return { level: 'partial', message: '读到了条款但没能定位到具体句子，结果仅供参考，请对照原文核对。' }
  }
  const noSuggestion = risks.filter((risk) => !risk.hasSuggestion).length
  const noAmount = risks.filter((risk) => !risk.amountKey).length
  return {
    level: 'ok',
    noSuggestion,
    noAmount,
    message: noSuggestion
      ? `其中 ${noSuggestion} 条只定位到风险、没生成修改建议，点开可看原句自己改。`
      : '',
  }
}
