export function buildReviewAuditSummary({ facts = {}, findings = [], qualityGate = {}, qualityItems = [] } = {}) {
  const list = (key) => Array.isArray(facts[key]) ? facts[key].length : 0
  const verified = findings.filter((item) => item.verificationStatus === 'verified').length
  const partial = findings.filter((item) => item.verificationStatus === 'partial').length
  const conflicts = Array.isArray(facts.conflicts) ? facts.conflicts.length : 0
  const warnings = Array.isArray(facts.qualityWarnings) ? facts.qualityWarnings.length : 0
  return {
    status: qualityGate.blocked ? (qualityGate.label || '需人工复核') : '可查看辅助评分',
    facts: {
      clauses: list('clauses'),
      amounts: list('amounts'),
      dates: list('dates'),
      terms: list('terms'),
      references: list('references'),
      definitions: list('definitions'),
      attachments: list('attachments'),
      tables: list('tables'),
    },
    evidence: { verified, partial },
    quality: { signals: qualityItems.length, conflicts, warnings },
    nextAction: qualityGate.blocked
      ? '先回看原文、附件或签署版本，再判断风险分。'
      : '风险分仅作辅助参考，仍应核对关键金额、期限和解除条款。',
  }
}
