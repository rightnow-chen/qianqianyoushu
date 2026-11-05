import {
  AI_GENERATED_NOTICE,
  buildMiniappAiMessages,
  buildMiniappCitations,
  buildMiniappContractReviewMessages,
  extractAiReply,
  extractMiniappContractReviewFindings,
  getContractReviewKnowledgeQuery,
  getMiniappAiRequestFingerprint,
  isCasualMiniappPrompt,
  mergeMiniappContractReviewFindings,
  normalizeMiniappAiRequest,
  splitMiniappContractForReview,
} from '../miniapp-ai.mjs'
import { searchKnowledge } from '../rag-engine.mjs'
import { dailyQuota, resolveProviderConfig } from '../config.mjs'
import { getAccountId, toPublicQuota } from '../lib/guards.mjs'
import { logStructured } from '../lib/logger.mjs'
import { miniappUsageStore } from '../lib/usage-store.mjs'
import { requestAiCompletion } from './ai-completion.mjs'

// 模块级单例：内存幂等缓存与在途请求的中止控制器。
const miniappAiRequestCache = new Map()
const miniappAiAbortControllers = new Map()

function cleanupMiniappAiRequestCache(now = Date.now()) {
  const ttl = 15 * 60 * 1_000
  for (const [key, entry] of miniappAiRequestCache) {
    if (now - entry.createdAt > ttl) miniappAiRequestCache.delete(key)
  }
  if (miniappAiRequestCache.size <= 1_000) return
  const oldest = [...miniappAiRequestCache.entries()]
    .sort((left, right) => left[1].createdAt - right[1].createdAt)
    .slice(0, miniappAiRequestCache.size - 1_000)
  oldest.forEach(([key]) => miniappAiRequestCache.delete(key))
}

export function handleMiniappAiCancel(request, response) {
  const requestId = String(request.body?.requestId || '').trim()
  if (!/^[A-Za-z0-9_-]{12,96}$/.test(requestId)) {
    response.status(400).json({ message: 'AI 请求标识无效' })
    return
  }
  const controller = miniappAiAbortControllers.get(`${getAccountId(request)}:${requestId}`)
  controller?.abort()
  response.json({ ok: true, cancelled: Boolean(controller) })
}

export async function handleMiniappChat(request, response) {
  response.set('Cache-Control', 'no-store')
  const startedAt = Date.now()
  let input
  try {
    input = normalizeMiniappAiRequest(request.body)
  } catch (error) {
    logStructured({
      requestId: request.get('x-request-id') || 'invalid-input',
      route: '/api/miniapp/ai/chat',
      statusCode: error?.status || 400,
      elapsedMs: Date.now() - startedAt,
      errorCode: 'invalid-input',
      storeMode: miniappUsageStore.mode,
    })
    response.status(error?.status || 400).json({ message: error?.message || 'AI 请求内容无效' })
    return
  }

  cleanupMiniappAiRequestCache()
  const accountId = getAccountId(request)
  const cacheKey = `${accountId}:${input.requestId}`
  const requestHash = getMiniappAiRequestFingerprint(input)
  const cached = miniappAiRequestCache.get(cacheKey)
  if (cached) {
    if (cached.requestHash !== requestHash) {
      logStructured({
        requestId: input.requestId,
        route: '/api/miniapp/ai/chat',
        statusCode: 409,
        elapsedMs: Date.now() - startedAt,
        errorCode: 'request-id-conflict',
        storeMode: miniappUsageStore.mode,
      })
      response.status(409).json({ message: '请求标识已被其他问题使用，请重新发送', code: 'request-id-conflict' })
      return
    }
    try {
      // cached.promise 解析为 { result, upstreamUsage }；upstreamUsage 不进入重放响应
      const resolved = cached.result ? { result: cached.result } : await cached.promise
      const result = resolved.result || resolved
      logStructured({
        requestId: input.requestId,
        route: '/api/miniapp/ai/chat',
        statusCode: 200,
        elapsedMs: Date.now() - startedAt,
        replayed: true,
        storeMode: miniappUsageStore.mode,
      })
      response.json({ ...result, replayed: true })
    } catch (error) {
      logStructured({
        requestId: input.requestId,
        route: '/api/miniapp/ai/chat',
        statusCode: error?.status || 502,
        elapsedMs: Date.now() - startedAt,
        replayed: true,
        errorCode: 'replay-failed',
        storeMode: miniappUsageStore.mode,
      })
      response.status(error?.status || 502).json({ message: error?.message || 'AI 请求失败，请稍后重试' })
    }
    return
  }

  let claim
  try {
    claim = await miniappUsageStore.claimRequest(accountId, input.requestId, requestHash, dailyQuota)
  } catch (error) {
    logStructured({
      requestId: input.requestId,
      route: '/api/miniapp/ai/chat',
      statusCode: error?.status || 503,
      elapsedMs: Date.now() - startedAt,
      errorCode: 'claim-failed',
      storeMode: miniappUsageStore.mode,
    })
    response.status(error?.status || 503).json({ message: error?.message || '额度服务暂时不可用' })
    return
  }
  if (claim.status === 'cached') {
    const persistedResult = claim.value?.result || claim.value
    if (persistedResult?.privateResultOmitted) {
      logStructured({
        requestId: input.requestId,
        route: '/api/miniapp/ai/chat',
        statusCode: 409,
        elapsedMs: Date.now() - startedAt,
        replayed: true,
        errorCode: 'private-result-not-cached',
        storeMode: miniappUsageStore.mode,
      })
      response.status(409).json({
        message: '该合同审查已完成；为保护合同隐私，服务端不缓存逐字证据，请重新点击综合审查获取新报告',
        code: 'private-result-not-cached',
      })
      return
    }
    miniappAiRequestCache.set(cacheKey, { createdAt: Date.now(), requestHash, result: persistedResult })
    logStructured({
      requestId: input.requestId,
      route: '/api/miniapp/ai/chat',
      statusCode: 200,
      elapsedMs: Date.now() - startedAt,
      replayed: true,
      storeMode: miniappUsageStore.mode,
    })
    response.json({ ...persistedResult, replayed: true })
    return
  }
  if (claim.status === 'conflict') {
    logStructured({
      requestId: input.requestId,
      route: '/api/miniapp/ai/chat',
      statusCode: 409,
      elapsedMs: Date.now() - startedAt,
      errorCode: 'request-id-conflict',
      storeMode: miniappUsageStore.mode,
    })
    response.status(409).json({ message: '请求标识已被其他问题使用，请重新发送', code: 'request-id-conflict' })
    return
  }
  if (claim.status === 'pending') {
    response.set('Retry-After', '2')
    logStructured({
      requestId: input.requestId,
      route: '/api/miniapp/ai/chat',
      statusCode: 425,
      elapsedMs: Date.now() - startedAt,
      errorCode: 'request-in-progress',
      storeMode: miniappUsageStore.mode,
    })
    response.status(425).json({ message: '相同请求正在处理中，请稍后重试', code: 'request-in-progress' })
    return
  }
  if (claim.status === 'quota') {
    response.set('Retry-After', '3600')
    logStructured({
      requestId: input.requestId,
      route: '/api/miniapp/ai/chat',
      statusCode: 429,
      elapsedMs: Date.now() - startedAt,
      errorCode: 'quota-exhausted',
      storeMode: miniappUsageStore.mode,
    })
    response.status(429).json({ message: '今日联网 AI 额度已用完，本地分析仍可使用', quota: toPublicQuota(claim.quota) })
    return
  }
  const reservation = { quota: claim.quota }

  const config = resolveProviderConfig()
  const workController = new AbortController()
  const abortOnDisconnect = () => {
    if (!response.writableEnded) workController.abort()
  }
  miniappAiAbortControllers.set(cacheKey, workController)
  response.once('close', abortOnDisconnect)
  // work 返回 { result, upstreamUsage }：result 是纯净的客户端结果，不含 _upstreamUsage；
  // upstreamUsage 只用于结构化日志，绝不进入内存缓存、Redis 幂等缓存或客户端响应。
  const work = (async () => {
    if (input.task === 'contract-review') {
      const chunks = splitMiniappContractForReview(input.contractText)
      const knowledge = searchKnowledge(getContractReviewKnowledgeQuery(input.profile.contractType), 4)
      const settledResults = await Promise.allSettled(chunks.map(async (chunk, chunkIndex) => {
        const data = await requestAiCompletion({
          config,
          messages: buildMiniappContractReviewMessages({
            chunk,
            chunkIndex,
            chunkCount: chunks.length,
            profile: input.profile,
            knowledge,
            localFindings: input.localFindings,
          }),
          temperature: 0.1,
          maxTokens: 1_600,
          signal: workController.signal,
        })
        const findings = extractMiniappContractReviewFindings(data, chunk).filter((finding) => (
          input.profile.reviewDepth === 'strict'
          || (input.profile.reviewDepth === 'business' ? finding.level === 'high' : finding.level !== 'low')
        ))
        return {
          findings,
          usage: data?.usage,
        }
      }))
      if (workController.signal.aborted) {
        const error = new Error('AI 请求已取消')
        error.status = 499
        error.code = 'client-aborted'
        throw error
      }
      const results = settledResults.filter((item) => item.status === 'fulfilled').map((item) => item.value)
      if (!results.length) throw settledResults.find((item) => item.status === 'rejected')?.reason || new Error('AI 分段复核失败')
      const failedChunks = settledResults.length - results.length
      const upstreamUsage = results.reduce((total, item) => ({
        prompt_tokens: total.prompt_tokens + (Number(item.usage?.prompt_tokens) || 0),
        completion_tokens: total.completion_tokens + (Number(item.usage?.completion_tokens) || 0),
        total_tokens: total.total_tokens + (Number(item.usage?.total_tokens) || 0),
      }), { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })
      return {
        result: {
          ok: true,
          requestId: input.requestId,
          findings: mergeMiniappContractReviewFindings(results.map((item) => item.findings)),
          reviewedChars: input.contractText.length,
          chunksReviewed: results.length,
          chunksTotal: chunks.length,
          partial: failedChunks > 0,
          aiGenerated: true,
          notice: AI_GENERATED_NOTICE,
          quota: toPublicQuota(reservation.quota),
        },
        upstreamUsage,
      }
    }

    const knowledge = isCasualMiniappPrompt(input.prompt)
      ? []
      : searchKnowledge(`${input.prompt} ${input.contextSummary}`, 4)
    const messages = buildMiniappAiMessages({ ...input, knowledge })
    const data = await requestAiCompletion({ config, messages, temperature: 0.2, maxTokens: 900, signal: workController.signal })
    const result = {
      ok: true,
      requestId: input.requestId,
      reply: extractAiReply(data),
      citations: buildMiniappCitations(knowledge),
      aiGenerated: true,
      notice: AI_GENERATED_NOTICE,
      // 额度已在调用模型前原子预占。直接返回预占快照，避免模型成功后
      // 因额度存储的第二次读取短暂失败而把有效回答误报为失败。
      quota: toPublicQuota(reservation.quota),
    }
    return { result, upstreamUsage: data?.usage }
  })()
  miniappAiRequestCache.set(cacheKey, { createdAt: Date.now(), requestHash, promise: work })

  try {
    const { result, upstreamUsage } = await work
    const persistedResult = input.task === 'contract-review'
      ? { requestId: input.requestId, privateResultOmitted: true }
      : result
    if (input.task === 'contract-review') miniappAiRequestCache.delete(cacheKey)
    else miniappAiRequestCache.set(cacheKey, { createdAt: Date.now(), requestHash, result })
    try {
      await miniappUsageStore.completeRequest(accountId, input.requestId, requestHash, persistedResult)
    } catch (cacheError) {
      logStructured({
        requestId: input.requestId,
        route: '/api/miniapp/ai/chat',
        statusCode: 500,
        errorCode: 'idempotency-cache-write-failed',
        storeMode: miniappUsageStore.mode,
      })
    }
    logStructured({
      requestId: input.requestId,
      route: '/api/miniapp/ai/chat',
      statusCode: 200,
      elapsedMs: Date.now() - startedAt,
      model: config.model,
      provider: config.provider,
      usage: upstreamUsage,
      replayed: false,
      storeMode: miniappUsageStore.mode,
    })
    response.json(result)
  } catch (error) {
    miniappAiRequestCache.delete(cacheKey)
    try {
      await miniappUsageStore.rollbackRequest(accountId, input.requestId, requestHash, dailyQuota)
    } catch (rollbackError) {
      logStructured({
        requestId: input.requestId,
        route: '/api/miniapp/ai/chat',
        statusCode: 500,
        errorCode: 'quota-rollback-failed',
        storeMode: miniappUsageStore.mode,
      })
    }
    const errorCode = error?.status === 504 ? 'upstream-timeout' : 'upstream-failed'
    logStructured({
      requestId: input.requestId,
      route: '/api/miniapp/ai/chat',
      statusCode: error?.status || 502,
      elapsedMs: Date.now() - startedAt,
      model: config.model,
      provider: config.provider,
      errorCode,
      storeMode: miniappUsageStore.mode,
    })
    if (!response.destroyed) response.status(error?.status || 502).json({ message: error?.message || 'AI 请求失败，请稍后重试' })
  }
  response.off('close', abortOnDisconnect)
  if (miniappAiAbortControllers.get(cacheKey) === workController) miniappAiAbortControllers.delete(cacheKey)
}
