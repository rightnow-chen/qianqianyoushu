/* 合同文件数据构建器：供批注版合同预览使用。 */

const LEVEL_ORDER = { high: 0, medium: 1, low: 2 }

export const STATUS_LABELS = {
  pending: '待谈',
  negotiating: '谈中',
  resolved: '已谈妥',
}

export function sortFindingsByPriority(items) {
  return items
    .slice()
    .sort((a, b) =>
      (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9)
      || String(a.priority || '').localeCompare(String(b.priority || '')),
    )
}

/* 把 findings 拆成「待谈 / 已谈妥」两组，供要点卡与复制文本共用 */
export function splitNegotiationItems(findings, acceptedIds, negotiationStates) {
  const todo = []
  const done = []

  findings.forEach((finding) => {
    const state = negotiationStates?.[finding.id] || {}
    const status = state.status || 'pending'
    const item = {
      id: finding.id,
      title: finding.title,
      level: finding.level,
      levelText: finding.levelText || finding.level || '',
      status,
      suggestion: finding.suggestion || finding.replacement || '',
      talk: finding.negotiation || '',
      compromise: state.compromise || '',
      reaction: state.reaction || null,
      accepted: Boolean(acceptedIds?.has(finding.id)),
    }
    if (item.accepted || status === 'resolved') done.push(item)
    else todo.push(item)
  })

  return { todo: sortFindingsByPriority(todo), done }
}
