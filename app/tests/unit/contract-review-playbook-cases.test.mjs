import assert from 'node:assert/strict'
import { contractReviewPlaybookCases } from '../../src/data/contractReviewPlaybookCases.js'

const ids = Object.keys(contractReviewPlaybookCases)
assert.deepEqual(ids, [
  'deposit-settlement',
  'renewal-rent-change',
  'repair-duty',
  'entry-and-consent',
  'early-termination-loss',
])

for (const [playbookId, cases] of Object.entries(contractReviewPlaybookCases)) {
  assert.equal(cases.length, 3, `${playbookId} 应有正例、负例、争议例各一条`)
  assert.deepEqual(cases.map((item) => item.label), ['explicit_disadvantage', 'counterexample', 'needs_review'])
  for (const item of cases) {
    assert.ok(item.id && item.text && item.expected, `${playbookId} 存在不完整案例`)
    assert.equal(item.playbookId, playbookId)
    assert.ok(item.sourceNote, `${item.id} 必须记录标注依据`) 
  }
}

console.log(`contract-review-playbook-cases passed: ${ids.length * 3} labeled cases`)
