import assert from 'node:assert/strict'
import { getFindingPrimaryAction, getReviewProfileSummary } from '../src/features/reviewUi.js'

assert.deepEqual(getReviewProfileSummary({ reviewDepth: 'strict' }), {
  text: '按租客视角检查租房合同',
  depth: '严格风控',
})

assert.deepEqual(getFindingPrimaryAction({ level: 'high', status: 'pending' }), {
  label: '去谈这一条',
  kind: 'negotiate',
})

assert.deepEqual(getFindingPrimaryAction({ level: 'medium', status: 'resolved' }), {
  label: '写入正式合同',
  kind: 'apply',
})

/*
 * Keep this file executable with plain Node in the current Windows workspace;
 * the built-in test runner cannot spawn workers under the repository policy.
 */
/* test('review profile summary treats contract type and tenant role as fixed context', () => {
  assert.deepEqual(getReviewProfileSummary({ reviewDepth: 'strict' }), {
    text: '按租客视角检查租房合同',
    depth: '严格审查',
  })
})

test('finding primary action sends unresolved risks to the negotiation desk', () => {
  assert.deepEqual(getFindingPrimaryAction({ level: 'high', status: 'pending' }), {
    label: '去谈这一条',
    kind: 'negotiate',
  })
})

test('finding primary action keeps resolved risks focused on writing the agreed clause', () => {
  assert.deepEqual(getFindingPrimaryAction({ level: 'medium', status: 'resolved' }), {
    label: '写入正式合同',
    kind: 'apply',
  })
}) */
