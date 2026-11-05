import { isValidMiniappSessionSecret } from '../miniapp-auth.mjs'
import {
  miniappSessionSecret,
  rapidOcrEnabled,
  resolveProviderConfig,
  wxAppId,
  wxAppSecret,
  zhipuVisionApiKey,
} from '../config.mjs'
import { miniappUsageStore } from '../lib/usage-store.mjs'

export function registerHealthRoutes(app) {
  app.get('/api/health', async (_request, response) => {
    const config = resolveProviderConfig()
    const usageHealth = await miniappUsageStore.checkHealth()
    response.json({
      ok: true,
      miniappApiVersion: 3,
      provider: config.provider,
      model: config.model,
      hasApiKey: Boolean(config.apiKey),
      miniappAuthConfigured: Boolean(wxAppId && wxAppSecret && isValidMiniappSessionSecret(miniappSessionSecret)),
      miniappUsageStore: miniappUsageStore.mode,
      miniappUsagePersistent: miniappUsageStore.mode !== 'memory',
      miniappUsageHealthy: usageHealth.ok,
      contractDocumentParsing: true,
      ocrMode: zhipuVisionApiKey
        ? 'remote-zhipu-vision+offline-fallback'
        : rapidOcrEnabled ? 'offline-rapidocr+tesseract-fallback' : 'offline-tesseract',
      zhipuVisionConfigured: Boolean(zhipuVisionApiKey),
      subsidyLiveUpdates: true,
    })
  })
}
