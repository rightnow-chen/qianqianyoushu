import assert from 'node:assert/strict'
import { getTopbarCopy } from '../../src/features/topbarUi.js'

const contractCopy = getTopbarCopy('contract', { findingsCount: 2, revisionItemsCount: 0 })
const verdictCopy = getTopbarCopy('verdict', { findingsCount: 2, verdictTitle: '谈清楚再签' })
const negotiationCopy = getTopbarCopy('negotiation', { findingsCount: 2 })

assert.equal(contractCopy.kicker, '合同审查 · 第 1 步')
assert.equal(contractCopy.title, '先把合同看清楚')
assert.equal(verdictCopy.kicker, '签约决策 · 第 2 步')
assert.equal(verdictCopy.title, '这套房，现在适合签吗？')
assert.equal(negotiationCopy.kicker, '合同审查 · 第 2 步')
assert.equal(negotiationCopy.title, '把没谈清楚的事逐条处理')

for (const copy of [contractCopy, verdictCopy, negotiationCopy]) {
  assert.doesNotMatch(`${copy.kicker} ${copy.title} ${copy.subtitle}`, /第 4 步|四步|填需求/)
}
