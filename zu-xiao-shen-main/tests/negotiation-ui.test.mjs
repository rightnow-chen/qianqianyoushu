import assert from 'node:assert/strict'
import { getNegotiationRoleCopy, getNegotiationProgress } from '../src/features/negotiationUi.js'

assert.deepEqual(getNegotiationProgress({ total: 4, resolvedCount: 2, acceptedCount: 1 }), {
  resolved: '已谈妥 2/4',
  accepted: '已落稿 1/4',
})

assert.deepEqual(getNegotiationRoleCopy('negotiation'), {
  title: '谈判军师',
  description: '只处理当前条款、房东回应和可以直接发出去的话术。',
})

assert.deepEqual(getNegotiationRoleCopy('ai'), {
  title: '租房小助手',
  description: '帮你理解当前进度，判断下一步该先做什么。',
})
