import multer from 'multer'
import path from 'node:path'
import {
  accessToken,
  allowedOrigins,
  dailyQuota,
  maxUploadBytes,
  miniappSessionSecret,
  requireTrustedOrigin,
  uploadMimeTypes,
} from '../config.mjs'
import { getBearerToken, verifyMiniappSessionToken } from '../miniapp-auth.mjs'
import { logStructured } from './logger.mjs'
import { miniappUsageStore } from './usage-store.mjs'

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes },
})

const rateWindowMs = 60_000
const rateBuckets = new Map()
const quotaBuckets = new Map()

export function rateLimit(scope, maxRequests) {
  return (request, response, next) => {
    const identity = request.miniappSession?.openid || request.ip || request.socket.remoteAddress || 'unknown'
    const key = `${scope}:${identity}`
    const now = Date.now()
    const current = rateBuckets.get(key)
    const bucket = current && now - current.startedAt < rateWindowMs
      ? current
      : { startedAt: now, count: 0 }

    bucket.count += 1
    rateBuckets.set(key, bucket)

    if (bucket.count > maxRequests) {
      response.set('Retry-After', '60')
      response.status(429).json({ message: '请求过于频繁，请稍后再试' })
      return
    }

    if (rateBuckets.size > 2_000) {
      for (const [bucketKey, entry] of rateBuckets) {
        if (now - entry.startedAt >= rateWindowMs) rateBuckets.delete(bucketKey)
      }
    }

    next()
  }
}

export function getAccountId(request) {
  if (request.miniappSession?.openid) return `wx:${request.miniappSession.openid}`
  return String(request.get('x-rental-safe-account') || `ip:${request.ip || request.socket.remoteAddress || 'unknown'}`).slice(0, 120)
}

export function getQuotaSnapshot(accountId) {
  const day = new Date().toISOString().slice(0, 10)
  for (const quotaKey of quotaBuckets.keys()) {
    if (!quotaKey.startsWith(`${day}:`)) quotaBuckets.delete(quotaKey)
  }
  const key = `${day}:${accountId}`
  const used = quotaBuckets.get(key)?.used || 0
  return { key, used, limit: dailyQuota, remaining: Math.max(0, dailyQuota - used), resetAt: `${day}T23:59:59.999Z` }
}

export function toPublicQuota(quota) {
  return {
    used: quota.used,
    limit: quota.limit,
    remaining: quota.remaining,
    resetAt: quota.resetAt,
  }
}

function reserveQuota(accountId) {
  const quota = getQuotaSnapshot(accountId)
  if (quota.remaining <= 0) return { ok: false, quota }
  quotaBuckets.set(quota.key, { used: quota.used + 1 })
  return { ok: true, quota: getQuotaSnapshot(accountId) }
}

export function rollbackQuota(accountId) {
  const quota = getQuotaSnapshot(accountId)
  quotaBuckets.set(quota.key, { used: Math.max(0, quota.used - 1) })
}

export function quotaLimit(request, response, next) {
  const accountId = getAccountId(request)
  const reservation = reserveQuota(accountId)
  if (!reservation.ok) {
    response.set('Retry-After', '3600')
    response.status(429).json({ message: '当前账号今日 AI 额度已用完，请明日再试', quota: toPublicQuota(reservation.quota) })
    return
  }
  response.set('X-AI-Quota-Limit', String(dailyQuota))
  response.set('X-AI-Quota-Remaining', String(reservation.quota.remaining))
  next()
}

export function authenticateMiniappSession(request, response, next) {
  const result = verifyMiniappSessionToken(getBearerToken(request), miniappSessionSecret)
  if (!result.ok) {
    logStructured({
      requestId: request.get('x-request-id') || 'auth-fail',
      route: request.path,
      statusCode: 401,
      errorCode: result.reason || 'auth-failed',
      storeMode: miniappUsageStore.mode,
    })
    response.status(401).json({ message: '登录状态已失效，请重新登录', reason: result.reason })
    return
  }
  request.miniappSession = result
  next()
}

export function trustedApiRequest(request, response, next) {
  const miniappSession = verifyMiniappSessionToken(getBearerToken(request), miniappSessionSecret)
  if (miniappSession.ok) {
    request.miniappSession = miniappSession
    next()
    return
  }

  if (!requireTrustedOrigin && !accessToken) {
    next()
    return
  }

  const token = String(request.get('x-ai-proxy-token') || '').trim()
  if (accessToken && token === accessToken) {
    next()
    return
  }

  const origin = String(request.get('origin') || '').trim()
  if (origin && allowedOrigins.has(origin)) {
    next()
    return
  }

  response.status(403).json({ message: '请求来源未被允许' })
}

export function acceptJsonUpload(fieldName) {
  return (request, response, next) => {
    if (request.file || !request.body?.fileBase64) {
      next()
      return
    }
    const fileBase64 = String(request.body.fileBase64)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(fileBase64) || fileBase64.length % 4 !== 0) {
      response.status(400).json({ message: '文件内容格式无效', code: 'invalid-file' })
      return
    }
    const buffer = Buffer.from(fileBase64, 'base64')
    if (!buffer.length || buffer.length > maxUploadBytes) {
      response.status(413).json({ message: '文件超过 8MB 限制', code: 'file-too-large' })
      return
    }
    const originalname = path.basename(String(request.body.fileName || `${fieldName}.bin`)).slice(0, 200)
    const extension = path.extname(originalname).slice(1).toLowerCase()
    request.file = {
      buffer,
      originalname,
      mimetype: uploadMimeTypes[extension] || 'application/octet-stream',
      size: buffer.length,
    }
    next()
  }
}
