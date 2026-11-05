const WARNING_LABELS = {
  ocr_suspect: 'OCR 质量',
  table_misaligned: '表格质量',
}

export function getReviewQualityItems(facts = {}) {
  const conflicts = Array.isArray(facts.conflicts) ? facts.conflicts : []
  const warnings = Array.isArray(facts.qualityWarnings) ? facts.qualityWarnings : []
  const conflictItems = conflicts.map((item) => ({
    type: 'conflict',
    label: '事实冲突',
    title: `${item.key}存在多个版本`,
    message: `${item.values.join(' vs ')}；请回看正文、附件和最终签署版本。`,
    severity: 'warning',
  }))
  const warningItems = warnings.map((item) => ({
    type: item.type,
    label: WARNING_LABELS[item.type] || '输入质量',
    title: item.type === 'ocr_suspect' ? '文本可能存在识别误差' : '结构化输入需要复核',
    message: item.message,
    severity: 'warning',
  }))
  return [...conflictItems, ...warningItems]
}

export function getReviewQualityGate(facts = {}) {
  const hasConflict = Array.isArray(facts.conflicts) && facts.conflicts.length > 0
  const hasWarning = Array.isArray(facts.qualityWarnings) && facts.qualityWarnings.length > 0
  return {
    blocked: hasConflict || hasWarning,
    label: '需人工复核',
    tone: 'warning',
    advice: '合同中存在事实冲突或输入质量问题，先回看原文、附件或签署版本，再判断风险分。',
  }
}
