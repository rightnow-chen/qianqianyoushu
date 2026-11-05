import assert from 'node:assert/strict'

const module = await import('../../server/ai-chat-request.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  return {}
})
assert.equal(typeof module.buildChatRequest, 'function', 'review transport must preserve input and budget its output')
const { buildChatRequest } = module
const config = { model: 'deepseek-v4-flash', provider: 'DeepSeek' }
const content = '合同'.repeat(7000) + '末尾补充条款'
const body = buildChatRequest({ task: 'contract-review', messages: [{ role: 'user', content }], maxTokens: 6000 }, config)
assert.equal(body.messages[0].content, content, 'review input must never be silently sliced')
assert.deepEqual(body.thinking, { type: 'disabled' })
assert.equal(body.max_tokens, 6000)
assert.throws(() => buildChatRequest({ task: 'contract-review', messages: [{ role: 'user', content: '字'.repeat(80001) }] }, config), /过长/)
assert.throws(() => buildChatRequest({ task: 'contract-review', messages: [{ role: 'user', content: ' ' }] }, config))
const other = buildChatRequest({ task: 'contract-review', messages: [{ role: 'user', content: '合同' }] }, { model: 'other', provider: 'Other' })
assert.equal(other.thinking, undefined, 'provider-specific flags must not leak to other APIs')
const chat = buildChatRequest({ messages: [{ role: 'user', content: '你好' }] }, config)
assert.equal(chat.thinking, undefined, 'ordinary chat keeps its previous settings')
assert.equal(chat.max_tokens, 2200)
console.log('PASS review transport preserves text, rejects oversized input, and scopes model settings')
