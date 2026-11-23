import assert from 'node:assert/strict'
import { contractReviewPlaybook, getContractReviewPlaybookPrompt, getPlaybookIdForFinding } from '../../src/data/contractReviewPlaybook.js'
import { createAiReviewPrompt } from '../../src/features/aiAssistant.js'

const requiredFields = ['id', 'title', 'dimension', 'trigger', 'counterSignals', 'requiredEvidence', 'examples', 'nonExamples', 'action', 'legalSources', 'resultTypes']
const ids = [
  'deposit-settlement',
  'renewal-rent-change',
  'repair-duty',
  'entry-and-consent',
  'early-termination-loss',
  'utilities-and-fees',
  'sublease-and-cohabitation',
  'attachments-and-inventory',
  'pet-and-use-restrictions',
]

assert.deepEqual(Object.keys(contractReviewPlaybook), ids)

for (const id of ids) {
  const card = contractReviewPlaybook[id]
  for (const field of requiredFields) assert.ok(card[field], `${id} 缺少 ${field}`)
  assert.ok(card.examples.length >= 1, `${id} 至少需要一个应报例子`)
  assert.ok(card.nonExamples.length >= 1, `${id} 至少需要一个不得报例子`)
  assert.deepEqual(card.resultTypes, ['explicit_disadvantage', 'missing_term', 'needs_review'])
  assert.ok(card.legalSources.every((source) => source.url && source.title && source.scope), `${id} 的法律来源必须可核验`)
}

assert.equal(getPlaybookIdForFinding({ dimension: '押金', title: '押金扣减范围宽泛' }), 'deposit-settlement')
assert.equal(getPlaybookIdForFinding({ dimension: '维修', title: '自然老化维修责任' }), 'repair-duty')
assert.equal(getPlaybookIdForFinding({ dimension: '居住权', title: '默认同意入户' }), 'entry-and-consent')
assert.equal(getPlaybookIdForFinding({ dimension: '解除', title: '提前解约责任' }), 'early-termination-loss')
assert.equal(getPlaybookIdForFinding({ dimension: '费用', title: '水电费按甲方价格收取' }), 'utilities-and-fees')
assert.equal(getPlaybookIdForFinding({ dimension: '居住权', title: '转租须书面同意' }), 'sublease-and-cohabitation')
assert.equal(getPlaybookIdForFinding({ dimension: '维修', title: '退租须恢复全新状态' }), 'attachments-and-inventory')
assert.equal(getPlaybookIdForFinding({ dimension: '居住权', title: '不得饲养任何宠物' }), 'pet-and-use-restrictions')

const prompt = getContractReviewPlaybookPrompt()
assert.match(prompt, /deposit-settlement/)
assert.match(prompt, /不得把“缺少更有利约定”直接判定为违法/)
assert.match(prompt, /住房租赁条例.*第十条/)

// nonExamples 是"什么不该报"的刹车信号。只测数据字段存在性不够——
// 曾出现字段定义了却从未注入 prompt，导致模型对合规条款误报。
for (const card of Object.values(contractReviewPlaybook)) {
  for (const ne of card.nonExamples) {
    assert.ok(prompt.includes(ne), `${card.id} 的明确不报情形未进 prompt：${ne}`)
  }
}
assert.match(prompt, /明确不报（已含这些保护\/例外时，该卡判未命中，不得进 risks）/)

const reviewPrompt = createAiReviewPrompt('房屋租赁合同：押金退还时间未写明。', { contractType: 'lease', reviewDepth: 'strict' })
assert.match(reviewPrompt, /审查标准卡/)
assert.match(reviewPrompt, /约定固定补偿并明确不再重复主张同一期间的空置损失/)
assert.match(reviewPrompt, /entry-and-consent/)
assert.match(reviewPrompt, /"findingType": "explicit_disadvantage、missing_term 或 needs_review"/)
assert.match(reviewPrompt, /阶段1：条款事实提取/)
assert.match(reviewPrompt, /阶段2：按标准卡判断/)
assert.match(reviewPrompt, /每个标准卡必须明确输出命中、未命中或待核对/)

console.log(`contract-review-playbook passed: ${ids.length} cards with sources, examples and counterexamples`)
