import { parseContractDocument } from '../contract-document-parser.mjs'
import { acceptJsonUpload, authenticateMiniappSession, rateLimit, upload } from '../lib/guards.mjs'
import { logStructured } from '../lib/logger.mjs'
import { miniappUsageStore } from '../lib/usage-store.mjs'

const maxConcurrentContractParses = 2
let contractParsesInFlight = 0

export function registerContractRoutes(app) {
  app.post('/api/miniapp/contract/parse', authenticateMiniappSession, rateLimit('contract-parse', 12), upload.single('document'), acceptJsonUpload('document'), async (request, response) => {
    response.set('Cache-Control', 'no-store')
    const startedAt = Date.now()
    const requestId = request.get('x-request-id') || `contract-${startedAt}`
    const route = '/api/miniapp/contract/parse'
    if (!request.file) {
      logStructured({ requestId, route, statusCode: 400, elapsedMs: Date.now() - startedAt, errorCode: 'missing-file', storeMode: miniappUsageStore.mode })
      response.status(400).json({ message: '请选择需要解析的合同文件', code: 'missing-file' })
      return
    }

    if (contractParsesInFlight >= maxConcurrentContractParses) {
      response.set('Retry-After', '10')
      logStructured({ requestId, route, statusCode: 429, elapsedMs: Date.now() - startedAt, errorCode: 'busy', storeMode: miniappUsageStore.mode })
      response.status(429).json({ message: '合同解析服务繁忙，请稍后重试', code: 'busy' })
      return
    }

    contractParsesInFlight += 1
    try {
      const result = await parseContractDocument({
        buffer: request.file.buffer,
        fileName: request.body?.fileName || request.file.originalname,
      })
      logStructured({ requestId, route, statusCode: 200, elapsedMs: Date.now() - startedAt, storeMode: miniappUsageStore.mode })
      response.json({ ok: true, ...result, retained: false })
    } catch (error) {
      logStructured({ requestId, route, statusCode: error?.status || 422, elapsedMs: Date.now() - startedAt, errorCode: error?.code || 'parse-failed', storeMode: miniappUsageStore.mode })
      response.status(error?.status || 422).json({
        message: error?.message || '合同文件解析失败',
        code: error?.code || 'parse-failed',
      })
    } finally {
      contractParsesInFlight = Math.max(0, contractParsesInFlight - 1)
    }
  })
}
