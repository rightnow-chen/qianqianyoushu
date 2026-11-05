import { upstreamTimeoutMs } from '../config.mjs'

export async function requestAiCompletion({ config, messages, temperature = 0.2, maxTokens = 2_200, signal }) {
  if (!config.endpoint) {
    const error = new Error('AI 服务地址尚未配置')
    error.status = 503
    throw error
  }
  if (!config.apiKey) {
    const error = new Error('AI 服务密钥尚未配置')
    error.status = 503
    throw error
  }

  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs)
  try {
    const upstreamResponse = await fetch(config.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: Math.max(0, Math.min(Number(temperature) || 0.2, 1)),
        max_tokens: Math.max(256, Math.min(Number(maxTokens) || 2_200, 4_000)),
        messages,
        ...(config.provider === 'DeepSeek' ? { thinking: { type: 'disabled' } } : {}),
      }),
    })
    const data = await upstreamResponse.json().catch(() => ({}))
    if (!upstreamResponse.ok) {
      const error = new Error(data?.error?.message || data?.message || `上游 AI 请求失败（HTTP ${upstreamResponse.status}）`)
      error.status = upstreamResponse.status >= 400 && upstreamResponse.status < 600 ? upstreamResponse.status : 502
      throw error
    }
    return data
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (signal?.aborted) {
        const cancelledError = new Error('AI 请求已取消')
        cancelledError.status = 499
        cancelledError.code = 'client-aborted'
        throw cancelledError
      }
      const timeoutError = new Error('AI 响应超时，请稍后重试')
      timeoutError.status = 504
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
