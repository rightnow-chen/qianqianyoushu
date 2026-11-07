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
export function levelFromSeverity(severity, confidence) {
  if (severity === 'high') return confidence === 'inferred' ? 'check' : 'must'
  if (severity === 'medium') return 'check'
  return 'note'
}

export function levelLabel(level) {
  return LEVELS[level]?.label || '仅提醒'
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
