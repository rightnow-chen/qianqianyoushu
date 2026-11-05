import assert from 'node:assert/strict'
import { getAssistantQuickPrompts, getAssistantStatus } from '../src/features/assistantUi.js'

assert.deepEqual(getAssistantQuickPrompts('contract'), [
  { label: '最需要先处理哪一条？', prompt: '这份合同最需要先处理哪一条？' },
  { label: '哪些风险必须谈？', prompt: '哪些风险必须和房东谈？' },
  { label: '我下一步该做什么？', prompt: '结合当前合同，我下一步应该先做什么？' },
])

assert.deepEqual(getAssistantStatus({
  activeTab: 'verdict',
  highCount: 2,
  pendingCount: 3,
  resolvedCount: 1,
  acceptedCount: 0,
  contractReviewed: true,
}), {
  module: '签约判断',
  facts: ['2 处高风险待处理', '已谈妥 1 条', '已落稿 0 条'],
})
