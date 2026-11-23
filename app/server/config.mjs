import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const serverDir = __dirname
export const rootDir = path.join(__dirname, '..')
export const distDir = path.join(rootDir, 'dist')
export const indexHtmlPath = path.join(distDir, 'index.html')

export const port = Number(process.env.PORT || process.env.AI_PROXY_PORT || 8787)
export const allowedOrigins = new Set([
  ...(process.env.AI_PROXY_ALLOWED_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Vercel 部署时自动注入的域名（预览域名 + 生产域名），前端与 /api 同源。
  // 这样 CORS 中间件和 trustedApiRequest 守卫都能放行，无需手动配白名单。
  ...(['VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL']
    .map((key) => process.env[key]?.trim())
    .filter(Boolean)
    .map((host) => `https://${host}`)),
  // 自己这个 origin 必须放行：`npm start` 下前端和接口同端口，
  // vite 给 script/link 加了 crossorigin，浏览器会把这些静态请求也当成 CORS 请求，
  // 不把自己列进去就会 500 —— 页面加载出来但样式和脚本全被拦掉。
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
])
export const requireTrustedOrigin = process.env.AI_PROXY_REQUIRE_ORIGIN === 'true' || process.env.NODE_ENV === 'production'
export const accessToken = String(process.env.AI_PROXY_ACCESS_TOKEN || '').trim()

export const wxAppId = String(process.env.WX_APPID || '').trim()
export const wxAppSecret = String(process.env.WX_SECRET || '').trim()
export const miniappSessionSecret = String(process.env.MINIAPP_SESSION_SECRET || '').trim()
export const miniappSessionTtlSeconds = Math.max(300, Math.min(Number(process.env.MINIAPP_SESSION_TTL_SECONDS) || 7_200, 604_800))

export const upstreamTimeoutMs = Math.max(5_000, Math.min(Number(process.env.AI_PROXY_TIMEOUT_MS) || 45_000, 120_000))
export const ocrTimeoutMs = Math.max(15_000, Math.min(Number(process.env.OCR_TIMEOUT_MS) || 90_000, 180_000))
export const dailyQuota = Math.max(1, Number(process.env.AI_DAILY_QUOTA || 30))

export const zhipuVisionApiKey = String(process.env.ZHIPU_API_KEY || process.env.BIGMODEL_API_KEY || '').trim()
export const zhipuVisionModels = [...new Set([
  process.env.ZHIPU_VISION_MODEL,
  'glm-4.6v-flash',
  'glm-4.1v-thinking-flash',
  'glm-4v-flash',
].map((item) => String(item || '').trim()).filter(Boolean))]
export const rapidOcrEnabled = process.env.RAPIDOCR_ENABLED === 'true'
export const rapidOcrTimeoutMs = Math.max(15_000, Math.min(Number(process.env.RAPIDOCR_TIMEOUT_MS) || ocrTimeoutMs, 180_000))
export const rapidOcrScriptPath = path.join(rootDir, 'server', 'rapidocr-image.py')

export const maxUploadBytes = 8 * 1024 * 1024
export const uploadMimeTypes = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
}

const providerPresets = {
  'OpenAI-compatible': {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    keyEnv: ['OPENAI_API_KEY', 'AI_PROXY_API_KEY'],
  },
  DeepSeek: {
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    keyEnv: ['DEEPSEEK_API_KEY', 'AI_PROXY_API_KEY'],
  },
  '通义千问': {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    keyEnv: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY', 'AI_PROXY_API_KEY'],
  },
  '智谱 GLM': {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    keyEnv: ['ZHIPU_API_KEY', 'BIGMODEL_API_KEY', 'AI_PROXY_API_KEY'],
  },
  Moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    keyEnv: ['MOONSHOT_API_KEY', 'AI_PROXY_API_KEY'],
  },
  '百川智能': {
    baseUrl: 'https://api.baichuan-ai.com/v1',
    defaultModel: 'Baichuan4',
    keyEnv: ['BAICHUAN_API_KEY', 'AI_PROXY_API_KEY'],
  },
  '腾讯混元': {
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    defaultModel: 'hunyuan-lite',
    keyEnv: ['HUNYUAN_API_KEY', 'TENCENT_HUNYUAN_API_KEY', 'AI_PROXY_API_KEY'],
  },
  '火山方舟': {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-1-5-lite-32k-250115',
    keyEnv: ['ARK_API_KEY', 'VOLCENGINE_API_KEY', 'AI_PROXY_API_KEY'],
  },
  MiniMax: {
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'MiniMax-Text-01',
    keyEnv: ['MINIMAX_API_KEY', 'AI_PROXY_API_KEY'],
  },
}

export function buildChatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.endsWith('/chat/completions')) return trimmed
  if (/^https:\/\/api\.deepseek\.com\/?$/i.test(trimmed)) return `${trimmed}/chat/completions`
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

function readFirstEnv(keys) {
  return keys.map((key) => process.env[key]).find(Boolean) || ''
}

export function resolveProviderConfig({ provider, baseUrl, model } = {}) {
  const selectedProvider = provider || process.env.AI_PROXY_PROVIDER || (process.env.DEEPSEEK_API_KEY ? 'DeepSeek' : 'OpenAI-compatible')
  const preset = providerPresets[selectedProvider] || null
  const allowCustom = process.env.AI_PROXY_ALLOW_CUSTOM_UPSTREAM === 'true'

  if (preset) {
    return {
      endpoint: buildChatCompletionsUrl(process.env.AI_PROXY_BASE_URL || preset.baseUrl),
      apiKey: readFirstEnv(preset.keyEnv),
      model: model || process.env.AI_PROXY_MODEL || preset.defaultModel,
      provider: selectedProvider,
    }
  }

  if (allowCustom) {
    return {
      endpoint: buildChatCompletionsUrl(process.env.AI_PROXY_BASE_URL || baseUrl || ''),
      apiKey: process.env.AI_PROXY_API_KEY || '',
      model: process.env.AI_PROXY_MODEL || model || '',
      provider: provider || 'custom',
    }
  }

  return {
    endpoint: buildChatCompletionsUrl(process.env.AI_PROXY_BASE_URL || 'https://api.openai.com/v1'),
    apiKey: process.env.AI_PROXY_API_KEY || '',
    model: process.env.AI_PROXY_MODEL || 'gpt-4.1-mini',
    provider: 'server-default',
  }
}
