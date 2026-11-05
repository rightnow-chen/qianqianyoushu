import assert from 'node:assert/strict'
import { getDecisionOutcomeLabel, getDecisionStageCopy, getTrustDisplayLabel } from '../src/features/decisionUi.js'

assert.equal(getDecisionOutcomeLabel('pause'), '不建议签')
assert.equal(getDecisionOutcomeLabel('confirm'), '谈清楚再签')
assert.equal(getDecisionOutcomeLabel('more-info'), '信息不足，暂时不能判断')
assert.equal(getDecisionOutcomeLabel('go'), '可以签')

assert.deepEqual(getDecisionStageCopy({ fullyFilled: true, contractReviewed: false }), {
  label: '初步判断',
  note: '还没结合合同风险，当前结果只作为参考。',
})

assert.deepEqual(getDecisionStageCopy({ fullyFilled: true, contractReviewed: true }), {
  label: '完整判断',
  note: '已结合预算、房源条件和合同风险。',
})

assert.equal(getTrustDisplayLabel('contract'), '合同里已写明')
assert.equal(getTrustDisplayLabel('verbal'), '房东口头说过')
assert.equal(getTrustDisplayLabel('guess'), '还需要确认')
