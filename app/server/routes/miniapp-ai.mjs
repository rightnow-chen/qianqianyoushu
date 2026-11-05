import { dailyQuota } from '../config.mjs'
import { authenticateMiniappSession, getAccountId, rateLimit, toPublicQuota } from '../lib/guards.mjs'
import { miniappUsageStore } from '../lib/usage-store.mjs'
import { handleMiniappAiCancel, handleMiniappChat } from '../services/miniapp-chat.mjs'

export function registerMiniappAiRoutes(app) {
  app.post('/api/miniapp/ai/cancel', authenticateMiniappSession, rateLimit('miniapp-cancel', 30), handleMiniappAiCancel)

  app.get('/api/miniapp/ai/quota', authenticateMiniappSession, rateLimit('miniapp-quota', 60), async (request, response) => {
    response.set('Cache-Control', 'no-store')
    try {
      response.json(toPublicQuota(await miniappUsageStore.getQuota(getAccountId(request), dailyQuota)))
    } catch (error) {
      response.status(error?.status || 503).json({ message: error?.message || '额度服务暂时不可用' })
    }
  })

  app.post('/api/miniapp/ai/chat', authenticateMiniappSession, rateLimit('miniapp-chat', 20), handleMiniappChat)
}
