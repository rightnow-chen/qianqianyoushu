import crypto from 'node:crypto'

// 结构化脱敏日志：只输出白名单字段，禁止记录用户问题、合同正文、contextSummary、
// 姓名、手机号、地址、openid、session token、API Key、Redis Token 等敏感数据。
const LOG_FIELD_WHITELIST = new Set([
  'requestId', 'route', 'statusCode', 'elapsedMs', 'model', 'provider',
  'usage', 'replayed', 'errorCode', 'storeMode',
])

// 对 requestId 做稳定短哈希，避免原样记录 body.requestId 或 x-request-id。
// 用户可能把身份证号、session token 等敏感数据放进 requestId，因此必须脱敏。
function hashRequestId(requestId) {
  if (!requestId || typeof requestId !== 'string') return null
  const hash = crypto.createHash('sha256').update(requestId).digest('hex')
  return `rid_${hash.slice(0, 12)}`
}

export function logStructured(fields) {
  const entry = {}
  for (const key of LOG_FIELD_WHITELIST) {
    if (fields[key] !== undefined && fields[key] !== null) entry[key] = fields[key]
  }
  // requestId 统一替换为稳定短哈希，不记录原值
  if (entry.requestId) {
    entry.requestId = hashRequestId(entry.requestId)
  }
  // 强制脱敏：usage 只保留 token 数字，不保留任何文本字段
  if (entry.usage && typeof entry.usage === 'object') {
    entry.usage = {
      prompt_tokens: Number(entry.usage.prompt_tokens) || 0,
      completion_tokens: Number(entry.usage.completion_tokens) || 0,
      total_tokens: Number(entry.usage.total_tokens) || 0,
    }
  }
  console.log(JSON.stringify(entry))
}
