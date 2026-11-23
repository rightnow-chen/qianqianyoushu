// 风险数据模型：三级分级、九类条款、置信度、金额口径。
// 全产品只认这一套术语，界面与引擎都从这里取，避免「高风险 / 必须改」混用。

export const LEVELS = {
  must: { key: 'must', label: '必须改', short: '必须改' },
  check: { key: 'check', label: '建议确认', short: '建议确认' },
  note: { key: 'note', label: '仅提醒', short: '仅提醒' },
}

export const LEVEL_ORDER = ['must', 'check', 'note']

// 9 类条款：首版规则库的建模范围（PRD FR-04）
export const REVIEW_SCOPE = [
  '押金与退还条件',
  '提前退租与违约金',
  '维修责任划分',
  '租金与涨租机制',
  '水电燃气计价',
  '房屋检查与进入',
  '转租与合租',
  '宠物与使用限制',
  '附件与设施清单',
]

export const CONFIDENCE = {
  confirmed: { key: 'confirmed', label: '确定' },
  verify: { key: 'verify', label: '需确认' },
  inferred: { key: 'inferred', label: 'AI 推断' },
}

export const REVIEW_SCALES = [
  { value: 'strict', label: '严格 · 逐句' },
  { value: 'standard', label: '标准' },
]

// 引擎严重度 → 产品三级。（PRD FR-10：必须改 + 需确认 的组合说明规则不确定，降级为建议确认）
//
// findingType 参与定档（2026-11-17，缺陷库评测驱动）：
// AI 把"有具体不利机制"的风险(explicit_disadvantage/missing_term)的 severity 填成 medium 时，
// 不能让它被映射成 check——用户在签字前需要看到这类风险的真实分量。
// 依据：45 条缺陷库实测里，模型判 high 的 21 条全部是 must；判 medium 且属这两类的，
// A 档(法规明确)3 条期望 must、另 2 条 B 档(产品阈值灰区)期望 check。
// 规则选择抬档：净修 3 条真错，接受 2 条灰区被抬（B 档本不进主评分，且其标注口径本就有争议）。
// needs_review 保持原映射——它表达"待核对"，实测期望 check/note 都有，不能一刀切。
// 第三参数可选：不传时行为与旧版完全一致（规则引擎无 findingType，不受影响）。
export function levelFromSeverity(severity, confidence, findingType) {
  if (severity === 'high') return confidence === 'inferred' ? 'check' : 'must'
  if (severity === 'medium') {
    const confirmedDisadvantage = findingType === 'explicit_disadvantage' || findingType === 'missing_term'
    return confirmedDisadvantage ? 'must' : 'check'
  }
  return 'note'
}

export function levelLabel(level) {
  return LEVELS[level]?.label || '仅提醒'
}

/**
 * 法条显示归一：真实审查与演示数据用了两套 law 结构，界面只认这一处输出。
 *   真实（riskMapper）：{ name, basis, url, verified }
 *   演示（demoCase）  ：{ name, version, scope, url }
 * 早前组件直接读 version/scope，真实合同里这俩字段不存在，渲染成「法律依据 ·· 」。
 *
 * 返回 { headline, detail, url }：
 *   headline —— 法条简称；没有就诚实标「未匹配到具体法条」，绝不编造条号。
 *   detail   —— 依据描述（真实用 basis，演示用 version·scope 兜底）。
 */
export function lawDisplay(law) {
  const source = law || {}
  const name = String(source.name || '').trim()
  const basis = String(source.basis || '').trim()
  const version = String(source.version || '').trim()
  const scope = String(source.scope || '').trim()
  const url = String(source.url || '').trim()

  const meta = [version, scope].filter(Boolean).join(' · ')
  return {
    headline: name || '未匹配到具体法条',
    // 依据描述优先用真实链路的 basis；演示数据没有 basis 时用 version·scope 兜底。
    detail: basis || meta || '',
    url,
  }
}

export function countByLevel(risks = []) {
  return risks.reduce(
    (acc, risk) => {
      const level = LEVELS[risk.level] ? risk.level : 'note'
      acc[level] += 1
      acc.total += 1
      return acc
    },
    { must: 0, check: 0, note: 0, total: 0 },
  )
}

// 风险在合同里的编号（句尾 1–9），由数组顺序决定，改顺序即改编号。
export function markOf(risks, riskId) {
  const index = risks.findIndex((risk) => risk.id === riskId)
  return index === -1 ? null : index + 1
}

// 校验：每条风险必须齐备九件套，缺一项就说明数据没准备好，界面不该上线。
const REQUIRED_FIELDS = [
  'id',
  'level',
  'cat',
  'title',
  'location',
  'confidence',
  'consequence',
  'original',
  'suggestion',
  'why',
  'law',
  'scripts',
]

export function validateRisks(risks = []) {
  const problems = []
  risks.forEach((risk) => {
    REQUIRED_FIELDS.forEach((field) => {
      const value = risk[field]
      if (value === undefined || value === null || value === '') {
        problems.push(`${risk.id || '(无 id)'} 缺少 ${field}`)
      }
    })
    if (risk.scripts && (!risk.scripts.polite || !risk.scripts.firm)) {
      problems.push(`${risk.id} 话术缺礼貌版或协商版`)
    }
  })
  return problems
}
