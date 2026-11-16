import { buildChatRequest } from '../ai-chat-request.mjs'
import {
  ocrTimeoutMs,
  rapidOcrEnabled,
  resolveProviderConfig,
  upstreamTimeoutMs,
  zhipuVisionApiKey,
} from '../config.mjs'
import { getAccountId, getQuotaSnapshot, quotaLimit, rateLimit, toPublicQuota, trustedApiRequest } from '../lib/guards.mjs'
import { logStructured } from '../lib/logger.mjs'
import { miniappUsageStore } from '../lib/usage-store.mjs'
import { requestAiCompletion } from '../services/ai-completion.mjs'
import { recognizeImageWithFallback } from '../services/ocr.mjs'

// 真实 AI/OCR 冒烟监测：用内置极小样本验证模型和 OCR 链路当前是否真的可用
// 受 trustedApiRequest 保护，不进入用户正常使用流程，不消耗用户额度
// 不输出 API Key、openid、token、合同正文
const SMOKE_CONTRACT_SAMPLE = '甲方：张三，乙方：李四。租期一年，月租金2000元，押一付一。'
const SMOKE_AI_MAX_TOKENS = 64
// 极小有效 PNG（1x1 像素、带 alpha），用于验证 OCR 链路的签名校验与调用流程。
// 原来那串手写字节的 IDAT CRC 是错的：leptonica 直接报「IDAT: Extra compressed
// data / CRC error / no pix returned」，于是 /api/ai/smoke 的 ocr 一项永远 false，
// 看起来像 OCR 坏了，其实只是这张样本图坏了。用 zlib 重新生成并校验过。
const SMOKE_PNG_FIXTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+p5qgoAAAAABJRU5ErkJggg==',
  'base64',
)

export function registerAiRoutes(app) {
  app.get('/api/ai/quota', trustedApiRequest, (request, response) => {
    response.json(toPublicQuota(getQuotaSnapshot(getAccountId(request))))
  })

  app.get('/api/ai/smoke', trustedApiRequest, rateLimit('ai-smoke', 6), async (_request, response) => {
    response.set('Cache-Control', 'no-store')
    const startedAt = Date.now()
    const checkedAt = new Date().toISOString()
    const config = resolveProviderConfig()
    // 预先标注本次将尝试的 OCR 引擎，即使调用失败也能从返回值看出尝试了哪条链路
    const expectedOcrMode = zhipuVisionApiKey ? 'remote-zhipu-vision' : rapidOcrEnabled ? 'offline-rapidocr' : 'offline-tesseract'
    const result = {
      checkedAt,
      ai: { success: false, provider: config.provider, model: config.model, elapsedMs: 0, errorType: '', message: '' },
      ocr: { success: false, mode: expectedOcrMode, elapsedMs: 0, errorType: '', message: '' },
    }

    // AI 合同复核冒烟：用极小样本跑一次，maxTokens 限制为 64 以最小化消耗
    const aiStart = Date.now()
    try {
      const aiResponse = await requestAiCompletion({
        config,
        messages: [
          { role: 'system', content: '你是合同风险助手，只输出 JSON。' },
          { role: 'user', content: `请用一句话点评这条合同片段的风险：${SMOKE_CONTRACT_SAMPLE}` },
        ],
        temperature: 0.2,
        maxTokens: SMOKE_AI_MAX_TOKENS,
      })
      const hasContent = Boolean(aiResponse?.choices?.[0]?.message?.content)
      result.ai.success = hasContent
      result.ai.elapsedMs = Date.now() - aiStart
      if (!hasContent) {
        result.ai.errorType = 'empty-response'
        result.ai.message = 'AI 返回内容为空'
      }
    } catch (error) {
      result.ai.elapsedMs = Date.now() - aiStart
      result.ai.errorType = error?.code || error?.name || 'ai-error'
      result.ai.message = String(error?.message || 'AI 请求失败').slice(0, 200)
      if (error?.status) result.ai.httpStatus = error.status
    }

    // OCR 冒烟：用内置极小 PNG 验证 OCR 链路（签名校验 → 引擎调用 → 返回结果）
    const ocrStart = Date.now()
    const smokeOcrTimeoutMs = Math.min(ocrTimeoutMs, 10_000)
    if (process.env.NODE_ENV === 'test') {
      result.ocr.elapsedMs = 0
      result.ocr.message = '测试环境跳过实际 OCR 调用'
    } else {
      try {
        const ocrResult = await Promise.race([
          recognizeImageWithFallback(SMOKE_PNG_FIXTURE),
          new Promise((_, reject) => setTimeout(
            () => {
              const timeoutError = new Error('smoke OCR timeout')
              timeoutError.code = 'smoke-ocr-timeout'
              reject(timeoutError)
            },
            smokeOcrTimeoutMs,
          )),
        ])
        result.ocr.mode = ocrResult.mode || ocrResult.engine || expectedOcrMode
        result.ocr.success = true
        result.ocr.elapsedMs = Date.now() - ocrStart
        // 不输出识别文本，仅输出是否 fallback 和置信度
        result.ocr.fallback = Boolean(ocrResult.fallback)
        result.ocr.fallbackFrom = ocrResult.fallbackFrom || null
        result.ocr.confidence = typeof ocrResult.confidence === 'number' ? ocrResult.confidence : null
      } catch (error) {
        result.ocr.elapsedMs = Date.now() - ocrStart
        result.ocr.errorType = error?.code || error?.name || 'ocr-error'
        result.ocr.message = String(error?.message || 'OCR 识别失败').slice(0, 200)
      }
    }

    result.totalElapsedMs = Date.now() - startedAt
    logStructured({
      requestId: `ai-smoke-${startedAt}`,
      route: '/api/ai/smoke',
      statusCode: 200,
      elapsedMs: result.totalElapsedMs,
      provider: config.provider,
      model: config.model,
      storeMode: miniappUsageStore.mode,
    })
    response.json(result)
  })

  app.post('/api/ai/chat', trustedApiRequest, rateLimit('chat', 20), quotaLimit, async (request, response) => {
    const { provider, baseUrl, model } = request.body || {}
    const config = resolveProviderConfig({ provider, baseUrl, model })

    if (!config.endpoint) {
      response.status(500).json({ message: 'AI_PROXY_BASE_URL is not configured' })
      return
    }

    if (!config.apiKey) {
      response.status(500).json({ message: 'AI_PROXY_API_KEY is not configured' })
      return
    }

    let upstreamBody
    try {
      upstreamBody = buildChatRequest(request.body || {}, config)
    } catch (error) {
      response.status(error.status || 400).json({ message: error.message })
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs)

    try {
      const upstreamResponse = await fetch(config.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(upstreamBody),
      })

      const data = await upstreamResponse.json().catch(() => ({}))

      if (!upstreamResponse.ok) {
        response.status(upstreamResponse.status).json({
          message: data?.error?.message || data?.message || `Upstream AI request failed: HTTP ${upstreamResponse.status}`,
        })
        return
      }

      response.json(data)
    } catch (error) {
      response.status(error?.name === 'AbortError' ? 504 : 502).json({
        message: error?.name === 'AbortError' ? 'Upstream AI request timed out' : error?.message || 'AI proxy request failed',
      })
    } finally {
      clearTimeout(timeout)
    }
  })
}
