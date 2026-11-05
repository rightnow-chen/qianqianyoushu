// 签约决策判定逻辑（纯函数，不走 AI）
// 对应 PRD「八 输出结构」的签约判断三级结论 + 条件匹配

import { TRUST_LEVELS, TRUST_ORDER } from './decisionInput.js'

// 通勤匹配：房源通勤时间 vs 用户最大通勤
export function calcCommuteFit({ maxCommuteMinutes, listingCommuteMinutes }) {
  const max = toPositiveNumber(maxCommuteMinutes)
  const actual = toPositiveNumber(listingCommuteMinutes)

  if (max == null) {
    return { ok: false, fail: false, detail: '未填写通勤要求' }
  }
  if (actual == null) {
    return { ok: false, fail: false, detail: '房源通勤时间未知' }
  }
  if (actual <= max) {
    return { ok: true, fail: false, detail: `${actual} 分钟 ≤ 上限 ${max} 分钟` }
  }
  return { ok: false, fail: true, detail: `${actual} 分钟 超出上限 ${max} 分钟` }
}

// 底线匹配：房源描述是否覆盖用户不可妥协条件（基于关键词简单匹配）
export function calcMustHaveFit({ mustHaves, listingText }) {
  if (!mustHaves || mustHaves.length === 0) {
    return { ok: true, fail: false, detail: '未设置不可妥协条件' }
  }
  const text = (listingText || '').replace(/\s+/g, '')
  const matched = mustHaves.filter((item) => text.includes(item.replace(/\s+/g, '')))
  const missing = mustHaves.filter((item) => !text.includes(item.replace(/\s+/g, '')))

  if (missing.length === 0) {
    return { ok: true, fail: false, detail: `已覆盖全部 ${mustHaves.length} 项` }
  }
  if (matched.length === 0) {
    return { ok: false, fail: true, detail: `${missing.length} 项未确认（如 ${missing[0]}）` }
  }
  return { ok: false, fail: false, detail: `${matched.length}/${mustHaves.length} 项已覆盖，${missing.length} 项待确认` }
}

// 关键信息是否缺失（押金/中介费/通勤任一未知）
export function calcHasMissingInfo({ listing }) {
  const deposit = toPositiveNumber(listing.depositAmount)
  const agency = toPositiveNumber(listing.agencyFee)
  const commute = toPositiveNumber(listing.commuteMinutes)
  return deposit == null || agency == null || commute == null
}

// 生成“签之前要问清楚”的问题：把合同风险 + 缺失信息转成可直接发给房东的问题
// 每条 { why, ask }：why = 为什么问（给用户自己看），ask = 怎么问（可复制发给房东）
export function buildConfirmationQuestions({ findings, listing }) {
  const questions = []

  // 1. 缺失的关键信息 → 变成追问
  if (toPositiveNumber(listing.depositAmount) == null) {
    questions.push({
      id: 'missing-deposit',
      source: 'missing',
      why: '押金金额未知，无法准确估算首次付款和退租风险。',
      ask: '请问押金具体是多少？押一付一还是押二付一？退租时在什么情况下会扣押金？',
    })
  }
  if (toPositiveNumber(listing.agencyFee) == null) {
    questions.push({
      id: 'missing-agency',
      source: 'missing',
      why: '中介费未知，会影响总签约成本。',
      ask: '请问中介费是多少？由谁承担？是签约时一次性支付还是可以分期？',
    })
  }
  if (toPositiveNumber(listing.commuteMinutes) == null) {
    questions.push({
      id: 'missing-commute',
      source: 'missing',
      why: '通勤时间未知，无法判断是否满足你的通勤底线。',
      ask: '请问从这套房到你公司的通勤大概多久？高峰期和平时分别多久？',
    })
  }

  // 2. 合同高风险 → 每条生成一个核实问题（复用 finding 的 negotiation 话术）
  const highFindings = (findings || []).filter((finding) => finding.level === 'high')
  highFindings.forEach((finding) => {
    questions.push({
      id: `risk-${finding.id}`,
      source: 'risk',
      why: finding.explain || finding.suggestion || finding.title,
      ask: finding.negotiation || `关于「${finding.title}」这一条，想和您确认一下具体怎么执行？`,
    })
  })

  return questions
}

// 把问题清单拼成可复制的纯文本
export function formatQuestionsForCopy(questions, { listingName }) {
  const header = listingName && listingName !== '待评估房源'
    ? `【${listingName}】签之前要问清楚`
    : '【签之前要问清楚】'
  const body = questions.map((q, index) => `${index + 1}. ${q.ask}`).join('\n')
  const footer = '\n\n以上问题麻烦房东/中介帮忙确认，谢谢。'
  return `${header}\n\n${body}${footer}`
}

// 信息可信度聚合：统计有值字段的三级来源分布
// 返回 [{ key, label, tone, count, items }]，items 为字段中文名
export function calcTrustSummary({ listing, sources }) {
  // 字段 → 中文名映射
  const FIELD_LABELS = {
    monthlyRent: '月租',
    depositAmount: '押金',
    prepaidMonths: '预付月数',
    agencyFee: '中介费',
    monthlyFixedFees: '月固定费用',
    utilitiesEstimate: '水电估算',
    commuteMinutes: '通勤时间',
    availableDate: '可入住日期',
  }

  const groups = { contract: [], verbal: [], guess: [] }

  Object.keys(FIELD_LABELS).forEach((field) => {
    const value = listing[field]
    if (value == null || value === '') return // 无值字段不参与统计
    const source = sources?.[field] || 'guess'
    groups[source] = groups[source] || []
    groups[source].push(FIELD_LABELS[field])
  })

  return TRUST_ORDER.map((key) => ({
    key,
    label: TRUST_LEVELS[key].label,
    tone: TRUST_LEVELS[key].tone,
    count: groups[key].length,
    items: groups[key],
  }))
}

// 签约判断（优先级：超预算 > 合同高风险 > 信息缺失 > 可继续沟通）
export function resolveDecision({ budgetConflict, highCount, hasMissingInfo, needsFilled, listingFilled }) {
  if (!needsFilled || !listingFilled) {
    return {
      key: 'incomplete',
      tone: 'neutral',
      title: '先填写需求与房源',
      subtitle: '填好「租房需求」和「房源信息」后，才能给出靠谱的签约判断。',
    }
  }

  if (budgetConflict.status === 'over') {
    return {
      key: 'pause',
      tone: 'danger',
      title: '建议暂缓签约',
      subtitle: budgetConflict.message,
    }
  }

  if (highCount >= 1) {
    return {
      key: 'confirm',
      tone: 'warning',
      title: '确认关键问题后再决定',
      subtitle: `合同中有 ${highCount} 处高风险条款，建议先与房东核实并争取修改，再决定是否签约。`,
    }
  }

  if (hasMissingInfo) {
    return {
      key: 'more-info',
      tone: 'warning',
      title: '待补充信息',
      subtitle: '押金、中介费或通勤时间等关键信息还未知，补齐后再给最终判断。',
    }
  }

  return {
    key: 'go',
    tone: 'safe',
    title: '可以继续沟通',
    subtitle: '预算、通勤和合同均无硬伤，可以进入与房东的下一步沟通。',
  }
}

function toPositiveNumber(value) {
  if (value == null || value === '') return null
  const num = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(num) && num > 0 ? num : null
}
