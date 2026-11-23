// AI 审查客户端：把已经写好但从未接进界面的审查链路（createAiReviewPrompt /
// parseAiReviewResponse）接到 /api/ai/chat 上。
//
// 三条纪律：
// 1. 这里只负责「取回结果」，不做合并、不做语义换算——合并归 mergeFindings，
//    换算归 riskMapper，避免同一个判断在两处各写一遍。
// 2. 任何失败都必须抛出中文人话，让上层降级回规则结果，绝不让空数组冒充「没风险」。
// 3. 证据校验由 parseAiReviewResponse 负责，前端不再二次放宽，防止编造原文混进结果页。

import {
  buildRagSearchQuery,
  createAiReviewPrompt,
  parseAiReviewResponse,
  searchAiKnowledge,
} from './aiAssistant.js'

const SYSTEM_PROMPT =
  '你是严谨的租房合同解读助手，擅长识别押金、涨租、维修、入户、解除、违约金和管辖风险。必须只返回合法 JSON，且证据必须来自原文。'

export const AI_REVIEW_TIMEOUT_MS = 90_000

/** 取知识库片段；失败不要挡住审查，退回内置知识库（searchAiKnowledge 内部已兜底）。 */
async function loadKnowledge({ text, findings, signal }) {
  try {
    const query = buildRagSearchQuery({
      prompt: '租房合同审查 押金 维修 涨租 解除 违约 入户 管辖 个人信息 代收费用',
      activeTab: 'contract',
      reviewText: text,
      findings,
    })
    return await searchAiKnowledge(query, 6, { signal })
  } catch {
    return []
  }
}

/**
 * 跑一次 AI 审查。
 * @returns {{ findings: object[], qualityReport: object }}
 * @throws 任何失败都带中文 message，上层据此降级
 */
export async function reviewContractWithAi({
  text,
  localFindings = [],
  profile,
  provider = 'DeepSeek',
  model,
  maxTokens = 6000,
  timeoutMs = AI_REVIEW_TIMEOUT_MS,
  signal,
}) {
  if (!String(text || '').trim()) throw new Error('没有合同正文，无法进行 AI 审查')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const abortOuter = () => controller.abort()
  signal?.addEventListener('abort', abortOuter, { once: true })

  try {
    const knowledge = await loadKnowledge({ text, findings: localFindings, signal: controller.signal })
    const prompt = createAiReviewPrompt(text, profile, knowledge)

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'contract-review',
        provider,
        model,
        // 审查是确定性抽取任务：同一份合同应该得到同一组风险。
        // 实测 temperature=0.2 时 5 次输出条数在 4–6 之间漂；锁 0 后 5 次全是 5 条。
        temperature: 0,
        maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.message || `AI 审查服务返回 ${response.status}，本次按规则结果展示`)
    }

    const { findings, qualityReport } = parseAiReviewResponse(data, text)
    return { findings, qualityReport }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('AI 审查超时，本次按规则结果展示', { cause: error })
    }
    // parseAiReviewResponse 抛的错误已经是中文人话，原样上抛
    throw error instanceof Error
      ? error
      : new Error('AI 审查未完成，本次按规则结果展示', { cause: error })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortOuter)
  }
}
