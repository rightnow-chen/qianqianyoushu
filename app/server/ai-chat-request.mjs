// Pure request construction, shared by the HTTP route and transport regression tests.
export function buildChatRequest(input, config) {
  const review = input.task === 'contract-review'
  const fail = (message, status) => { throw Object.assign(new Error(message), { status }) }
  if (!Array.isArray(input.messages) || !input.messages.length) fail('messages must be a non-empty array', 400)
  const chars = input.messages.reduce((total, item) => total + String(item?.content || '').length, 0)
  if (chars > 80_000 || (review && input.messages.length > 16)) {
    fail('合同或请求内容过长，本次未进行完整审查，请缩短后重试。', 413)
  }
  const messages = input.messages.slice(-16).map((item) => ({
    role: ['system', 'user', 'assistant'].includes(item?.role) ? item.role : 'user',
    content: review ? String(item?.content || '') : String(item?.content || '').slice(0, 12_000),
  }))
  if (messages.some((item) => !item.content.trim())) fail('审查请求内容不能为空', 400)
  return {
    model: config.model,
    // 原来写 `Number(x) || 0.2`，传 0 会被 falsy 回退成 0.2 —— 审查任务根本锁不住温度。
    // 显式判断 undefined，让 0 真正生效；不传时仍保持 0.2 的旧默认值。
    temperature: input.temperature === undefined || input.temperature === null
      ? 0.2
      : Math.max(0, Math.min(Number(input.temperature) || 0, 1)),
    max_tokens: Math.max(256, Math.min(Number(input.maxTokens) || (review ? 6000 : 2200), review ? 8000 : 4000)),
    ...(review && config.provider === 'DeepSeek' ? { thinking: { type: 'disabled' } } : {}),
    messages,
  }
}
