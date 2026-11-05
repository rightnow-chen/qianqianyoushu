import { detectImageSignature, recognizeImageWithFallback } from '../services/ocr.mjs'
import { acceptJsonUpload, authenticateMiniappSession, rateLimit, trustedApiRequest, upload } from '../lib/guards.mjs'
import { logStructured } from '../lib/logger.mjs'
import { miniappUsageStore } from '../lib/usage-store.mjs'

let ocrInFlight = false

async function handleOcrUpload(request, response) {
  response.set('Cache-Control', 'no-store')
  const startedAt = Date.now()
  const requestId = request.get('x-request-id') || `ocr-${startedAt}`
  const route = request.path
  if (!request.file) {
    logStructured({ requestId, route, statusCode: 400, elapsedMs: Date.now() - startedAt, errorCode: 'missing-image', storeMode: miniappUsageStore.mode })
    response.status(400).json({ message: '请选择需要识别的合同图片', code: 'missing-image' })
    return
  }

  if (!/^image\//i.test(request.file.mimetype || '')) {
    logStructured({ requestId, route, statusCode: 415, elapsedMs: Date.now() - startedAt, errorCode: 'unsupported-image', storeMode: miniappUsageStore.mode })
    response.status(415).json({ message: '仅支持 JPG、PNG 或 WEBP 合同图片', code: 'unsupported-image' })
    return
  }

  // 真实文件签名校验，防止伪造扩展名（如把 .txt 改名 .jpg）进入 OCR worker
  const imageSignature = detectImageSignature(request.file.buffer)
  if (!imageSignature) {
    logStructured({ requestId, route, statusCode: 415, elapsedMs: Date.now() - startedAt, errorCode: 'invalid-image-signature', storeMode: miniappUsageStore.mode })
    response.status(415).json({ message: '图片内容无效或格式不支持，请重新选择', code: 'invalid-image-signature' })
    return
  }

  if (ocrInFlight) {
    response.set('Retry-After', '10')
    logStructured({ requestId, route, statusCode: 429, elapsedMs: Date.now() - startedAt, errorCode: 'busy', storeMode: miniappUsageStore.mode })
    response.status(429).json({ message: '图片识别服务繁忙，请稍后重试', code: 'busy' })
    return
  }

  ocrInFlight = true
  try {
    const result = await recognizeImageWithFallback(request.file.buffer)
    logStructured({ requestId, route, statusCode: 200, elapsedMs: Date.now() - startedAt, storeMode: miniappUsageStore.mode })
    response.json({
      ok: true,
      mode: result.mode,
      engine: result.engine,
      language: result.language,
      text: result.text,
      confidence: result.confidence,
      fallback: Boolean(result.fallback),
      fallbackFrom: result.fallbackFrom || null,
    })
  } catch (error) {
    logStructured({ requestId, route, statusCode: 500, elapsedMs: Date.now() - startedAt, errorCode: 'ocr-failed', storeMode: miniappUsageStore.mode })
    response.status(500).json({
      message: error.message || '合同图片识别失败，请重试',
      code: 'ocr-failed',
      fallback: 'vision-model',
    })
  } finally {
    ocrInFlight = false
  }
}

// 小程序使用独立路径和短期微信会话；旧 Web 接口继续保留来源/共享令牌校验。
export function registerOcrRoutes(app) {
  app.post('/api/miniapp/ocr/image', authenticateMiniappSession, rateLimit('miniapp-ocr', 6), upload.single('image'), acceptJsonUpload('image'), handleOcrUpload)
  app.post('/api/ocr/image', trustedApiRequest, rateLimit('ocr', 6), upload.single('image'), handleOcrUpload)
}
