export function getNegotiationProgress({ total = 0, resolvedCount = 0, acceptedCount = 0 } = {}) {
  return {
    resolved: `已谈妥 ${resolvedCount}/${total}`,
    accepted: `已落稿 ${acceptedCount}/${total}`,
  }
}

export function getNegotiationRoleCopy(role = 'negotiation') {
  if (role === 'ai') {
    return {
      title: '租房小助手',
      description: '帮你理解当前进度，判断下一步该先做什么。',
    }
  }

  return {
    title: '谈判军师',
    description: '只处理当前条款、房东回应和可以直接发出去的话术。',
  }
}
