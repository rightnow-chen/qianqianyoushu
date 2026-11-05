const QUICK_PROMPTS = {
  needs: [
    { label: '预算和房源匹配吗？', prompt: '按我的预算和需求，这套房匹配吗？' },
    { label: '还缺哪些信息？', prompt: '我还缺哪些关键信息？' },
    { label: '我下一步该做什么？', prompt: '填完这些信息后，我下一步应该先做什么？' },
  ],
  contract: [
    { label: '最需要先处理哪一条？', prompt: '这份合同最需要先处理哪一条？' },
    { label: '哪些风险必须谈？', prompt: '哪些风险必须和房东谈？' },
    { label: '我下一步该做什么？', prompt: '结合当前合同，我下一步应该先做什么？' },
  ],
  negotiation: [
    { label: '房东这样回复怎么接？', prompt: '房东这样回复，我该怎么接？' },
    { label: '这条能写进合同吗？', prompt: '这条谈判结果现在可以写进合同吗？' },
    { label: '还有哪些没谈完？', prompt: '我还有哪些关键问题没谈完？' },
  ],
  verdict: [
    { label: '为什么现在不能签？', prompt: '为什么这套房现在还不能直接签？' },
    { label: '还要问房东什么？', prompt: '签之前我还要问房东什么？' },
    { label: '我下一步该做什么？', prompt: '结合当前签约判断，我下一步应该先做什么？' },
  ],
}

export function getAssistantQuickPrompts(activeTab = 'contract') {
  return QUICK_PROMPTS[activeTab] || QUICK_PROMPTS.contract
}

export function getAssistantStatus({ activeTab = 'contract', highCount = 0, pendingCount = 0, resolvedCount = 0, acceptedCount = 0, contractReviewed = false } = {}) {
  const labels = {
    needs: '房源与预算',
    contract: '审合同',
    negotiation: '谈判台',
    verdict: '签约判断',
  }
  const facts = []

  if (highCount > 0) facts.push(`${highCount} 处高风险待处理`)
  if (activeTab === 'negotiation' && pendingCount > 0) facts.push(`${pendingCount} 条风险待处理`)
  if (resolvedCount > 0) facts.push(`已谈妥 ${resolvedCount} 条`)
  if (contractReviewed || resolvedCount > 0 || acceptedCount > 0) facts.push(`已落稿 ${acceptedCount} 条`)
  if (!facts.length) facts.push(contractReviewed ? '暂无需要优先处理的事项' : '还没有完成合同检查')

  return {
    module: labels[activeTab] || activeTab,
    facts,
  }
}
