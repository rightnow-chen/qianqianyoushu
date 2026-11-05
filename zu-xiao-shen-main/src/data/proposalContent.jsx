import {
  Bot,
  FileText,
  Search,
} from 'lucide-react'

export const proposalValueCards = [
  {
    icon: FileText,
    title: '审合同',
    label: '01',
    tab: 'contract',
    text: '导入合同，逐条查看风险和原文证据。',
  },
  {
    icon: Search,
    title: '谈判台',
    label: '02',
    tab: 'negotiation',
    text: '针对合同问题准备话术，记录协商结果。',
  },
  {
    icon: Bot,
    title: '重新审查',
    label: '03',
    tab: 'contract',
    text: '谈妥后写进合同，返回审查核对最新条款。',
  },
]

export const riskGuideSteps = [
  {
    icon: FileText,
    step: '01',
    title: '审合同',
    text: '导入或粘贴合同，系统逐条标出风险并绑定原文证据。',
    output: '先知道合同里哪里有问题',
  },
  {
    icon: Search,
    step: '02',
    title: '谈判台',
    text: '针对合同审查发现的问题，记录房东回应并把谈妥内容写进合同。',
    output: '逐项处理条款问题',
  },
  {
    icon: Bot,
    step: '03',
    title: '重新审查',
    text: '返回审合同，核对最新文本是否落实协商结果。',
    output: '查看修改后仍需处理的问题',
  },
]

export const proposalDemoRoute = [
  {
    step: '01',
    title: '填需求，算成本',
    text: '填月租与预算，看「月供是否超支」，这一步决定要不要继续看下去。',
    action: '去填需求',
    actionType: 'module',
    tab: 'needs',
  },
  {
    step: '02',
    title: '导入合同，审风险',
    text: '粘贴合同或载入演示合同，逐条标出押金、涨租、维修、入户风险并绑定原文。',
    action: '去审合同',
    actionType: 'module',
    tab: 'contract',
  },
  {
    step: '03',
    title: '看签约判断',
    text: '给出「建议签 / 暂缓签」的结论、主要原因、费用账本和需要问清楚的问题。',
    action: '看判断',
    actionType: 'module',
    tab: 'contract',
  },
  {
    step: '04',
    title: '带着话术去谈',
    text: '在谈判台拿到逐条追问话术，记录房东回应，把谈妥内容写回合同。',
    action: '进谈判台',
    actionType: 'module',
    tab: 'negotiation',
  },
  {
    step: '05',
    title: '复查最新合同',
    text: '回审合同页核对修改后的条款是否落实，确认风险真的消除。',
    action: '去复查',
    actionType: 'module',
    tab: 'contract',
  },
  {
    step: '06',
    title: '导出，拿去用',
    text: '下载审查报告或修订版合同 DOCX，签前留档、发给房东都用得上。',
    action: '去导出',
    actionType: 'module',
    tab: 'contract',
  },
]

export const proposalQuickRoute = [
  {
    title: '看一个真实案例',
    text: '不用注册、不用输入，直接载入演示合同看结论。',
    actionType: 'demoReview',
  },
  {
    title: '翻到结算结论',
    text: '看「该不该签」的判断和主要原因，再点开费用账本。',
    actionType: 'module',
    tab: 'contract',
  },
  {
    title: '看一眼话术',
    text: '在谈判台复制一条追问话术，感受能直接发给房东的输出。',
    actionType: 'module',
    tab: 'negotiation',
  },
]
