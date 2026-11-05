import {
  createMiniappSessionToken,
  exchangeWechatLoginCode,
  getCloudContainerIdentity,
  isValidMiniappSessionSecret,
} from '../miniapp-auth.mjs'
import {
  dailyQuota,
  miniappSessionSecret,
  miniappSessionTtlSeconds,
  wxAppId,
  wxAppSecret,
} from '../config.mjs'
import { rateLimit, toPublicQuota } from '../lib/guards.mjs'
import { logStructured } from '../lib/logger.mjs'
import { miniappUsageStore } from '../lib/usage-store.mjs'

export function registerAuthRoutes(app) {
  app.post('/api/auth/wx-login', rateLimit('wx-login', 12), async (request, response) => {
    response.set('Cache-Control', 'no-store')
    const startedAt = Date.now()
    const requestId = request.get('x-request-id') || `wxlogin-${startedAt}`
    const route = '/api/auth/wx-login'
    if (!isValidMiniappSessionSecret(miniappSessionSecret)) {
      logStructured({ requestId, route, statusCode: 503, elapsedMs: Date.now() - startedAt, errorCode: 'session-not-configured', storeMode: miniappUsageStore.mode })
      response.status(503).json({ message: '微信会话服务尚未配置' })
      return
    }

    try {
      const identity = getCloudContainerIdentity(request.headers, wxAppId)
        || await exchangeWechatLoginCode({
          code: request.body?.code,
          appId: wxAppId,
          appSecret: wxAppSecret,
        })
      const session = createMiniappSessionToken({ ...identity, ttlSeconds: miniappSessionTtlSeconds }, miniappSessionSecret)
      const quota = await miniappUsageStore.getQuota(`wx:${identity.openid}`, dailyQuota)
      logStructured({ requestId, route, statusCode: 200, elapsedMs: Date.now() - startedAt, storeMode: miniappUsageStore.mode })
      response.json({
        ok: true,
        token: session.token,
        expiresAt: session.expiresAt,
        quota: toPublicQuota(quota),
      })
    } catch (error) {
      logStructured({ requestId, route, statusCode: error?.status || 502, elapsedMs: Date.now() - startedAt, errorCode: 'wx-login-failed', storeMode: miniappUsageStore.mode })
      response.status(error?.status || 502).json({ message: error?.message || '微信登录失败，请稍后重试' })
    }
  })
}
