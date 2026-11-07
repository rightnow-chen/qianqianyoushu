export function getTopbarCopy(activeTab, { findingsCount = 0, revisionItemsCount = 0, verdictTitle } = {}) {
  return {
    needs: {
      kicker: '辅助工具',
      title: '补充房源与预算',
      subtitle: '补充预算、月租和费用等判断资料，合同已经拿到也可以稍后再填。',
      stage: '房源与预算',
      state: '辅助信息',
      action: '补齐后回到签约判断',
    },
    contract: {
      kicker: '合同审查 · 第 1 步',
      title: '先把合同看清楚',
      subtitle: '导入或粘贴合同，先看清风险和证据，再决定要不要谈。',
      stage: '审合同',
      state: `${findingsCount} 个风险点`,
      action: revisionItemsCount ? `${revisionItemsCount} 条已采纳建议` : '审查后可进入谈判台处理条款',
    },
    verdict: {
      kicker: '签约决策 · 第 2 步',
      title: '这套房，现在适合签吗？',
      subtitle: '结合预算、费用和合同风险，先给初步判断；谈判落稿后回来复核。',
      stage: '签约判断',
      state: verdictTitle || `${findingsCount} 个风险点`,
      action: '费用测算与待处理事项',
    },
    negotiation: {
      kicker: '合同审查 · 第 2 步',
      title: '把没谈清楚的事逐条处理',
      subtitle: '处理合同审查发现的问题，谈妥后写进合同，再返回审合同复查。',
      stage: '谈判台',
      state: `${findingsCount} 个风险点`,
      action: '当前条款话术 + 谈判进度记录',
    },
    ai: {
      kicker: '辅助工具',
      title: '租房小助手',
      subtitle: '结合合同原文、风险和谈判进度，解释条款并帮助准备下一步沟通。',
      stage: 'AI 助手',
      state: '上下文问答',
      action: '跨模块判断与下一步建议',
    },
  }[activeTab]
}
