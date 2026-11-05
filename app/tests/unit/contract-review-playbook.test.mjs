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

const prompt = getContractReviewPlaybookPrompt()
assert.match(prompt, /deposit-settlement/)
assert.match(prompt, /不得把“缺少更有利约定”直接判定为违法/)
assert.match(prompt, /住房租赁条例.*第十条/)

const reviewPrompt = createAiReviewPrompt('房屋租赁合同：押金退还时间未写明。', { contractType: 'lease', reviewDepth: 'strict' })
assert.match(reviewPrompt, /审查标准卡/)
assert.match(reviewPrompt, /entry-and-consent/)
assert.match(reviewPrompt, /"findingType": "explicit_disadvantage、missing_term 或 needs_review"/)
assert.match(reviewPrompt, /阶段1：条款事实提取/)
assert.match(reviewPrompt, /阶段2：按标准卡判断/)
assert.match(reviewPrompt, /每个标准卡必须明确输出命中、未命中或待核对/)

console.log(`contract-review-playbook passed: ${ids.length} cards with sources, examples and counterexamples`)
