import { extractAssistantChatContent, normalizeAiReplyText } from './aiAssistant.js'
import { redactSensitiveText } from '../utils/privacy.js'

// 谈判军师：把规则库里的静态话术升级为「现场生成 + 现场应对」。
// 全部复用平台 AI 链路：脱敏 -> RAG 检索 -> callAiModel；API 不可用时回落静态预案话术。

export const NEGOTIATION_QUICK_PROMPTS = [
  {
    key: 'opening',
    label: '生成开场话术',
    prompt: '我还没跟房东正式提这一条，请给我一版可以直接发出去的开场说法，语气友好但立场清楚。',
  },
  {
    key: 'rejected',
    label: '房东拒绝了',
    prompt: '房东拒绝了我的要求。请分析他可能的顾虑，再给一版进一层的应对话术：可以退一步，但不能破我的底线。',
  },
  {
    key: 'compromise',
    label: '想折中怎么提',
    prompt: '我想主动提一个折中方案，请帮我把折中说得更容易被接受，并提醒我折中到哪里就必须停。',
  },
]

const TONE_LABEL = { online: '线上（微信文字，克制、便于粘贴）', offline: '线下（当面/电话，口语、可带称谓）' }

function buildReactionLine(state) {
  if (!state || state.status === 'pending') return '还没跟房东提过这件事。'
  const reactionText = { agree: '房东口头表示同意', compromise: '房东提出过折中', reject: '房东明确拒绝过' }[state.reaction]
  const compromise = state.compromise ? `已记录的折中/谈判结果：${state.compromise}。` : ''
  return `${reactionText || '正在接触中'}。${compromise}`
}

/* 军师人设与输出格式：四段式，话术可直接复制发送 */
export function buildNegotiationSystemPrompt({ finding, state, tone }) {
  const context = [
    `风险条款：${finding.title}（等级：${finding.levelText || finding.level}）`,
    finding.evidence ? `合同原文证据：${redactSensitiveText(finding.evidence)}` : '',
    finding.suggestion ? `我们的建议/底线：${redactSensitiveText(finding.suggestion)}` : '',
    finding.legalBasis ? `相关法律依据：${redactSensitiveText(finding.legalBasis)}` : '',
    `当前谈判进度：${buildReactionLine(state)}`,
    `语气偏好：${TONE_LABEL[tone] || TONE_LABEL.online}`,
  ].filter(Boolean)

  return [
    '你是「签前有数」的租房谈判军师。用户是正在和房东/中介谈判的租客，需要你就当前条款给出能立刻使用的应对。',
    '',
    context.join('\n'),
    '',
    '回答固定输出以下四段，用简体中文，直接给结论不客套：',
    '对方立场：一两句，猜房东为什么这么坚持。',
    '应对策略：一到两条，讲事实讲本意，不煽情不吵架。',
    '可直接发的话术：给一版完整话术，用「」包裹，符合语气偏好，可直接复制粘贴发送。',
    '底线提醒：一句话，提醒哪些条件不能让。',
    '',
    '约束：不编造具体法条编号；不鼓励欺骗或威胁；话术不超过 120 字；全文不超过 260 字。',
  ].join('\n')
}

export function createNegotiationMessages({ finding, state, tone, chatHistory, userPrompt, ragItems = [] }) {
  const messages = [
    { role: 'system', content: buildNegotiationSystemPrompt({ finding, state, tone }) },
  ]
  if (ragItems.length) {
    const ragText = ragItems
      .map((item, index) => `${index + 1}. ${item.title || '知识条目'}：${compactKnowledge(item)}`)
      .join('\n')
    messages.push({ role: 'system', content: `知识库参考（引用时不要编造）：\n${redactSensitiveText(ragText)}` })
  }
  const history = Array.isArray(chatHistory) ? chatHistory.slice(-8) : []
  history.forEach((message) => {
    if (message?.role === 'user' || message?.role === 'assistant') {
      messages.push({ role: message.role, content: redactSensitiveText(String(message.content || '')) })
    }
  })
  messages.push({ role: 'user', content: redactSensitiveText(String(userPrompt || '')) })
  return messages
}

function compactKnowledge(item) {
  const text = String(item.content || item.summary || item.text || '')
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

/* 本地兜底：军师离线时用规则库预案话术，保证谈判现场不空窗。
 * mode: 'local' = 用户主动开启「仅本地分析」；'offline' = AI 服务连接失败。 */
export function createLocalNegotiationFallback({ finding, state, userPrompt, mode = 'offline' }) {
  const script = String(finding.negotiation || '').trim()
  const strategy = String(finding.suggestion || '').trim()
  const pasted = String(userPrompt || '').trim()
  const isLocal = mode === 'local'

  const stance = pasted
    ? (isLocal
        ? '你开启了「仅本地分析」，合同与对话不会发送到远端；如需军师用大模型解读这段话，请在左下角关闭该开关。'
        : '军师暂时离线，无法解读房东的这段话；可先记录下来，网络恢复后再让军师细看。')
    : {
        pending: '还没开口谈——第一句话术最重要，先友好、再讲本意、最后给建议。',
        negotiating: '正在谈——记住先确认对方顾虑，再决定让不让步。',
        resolved: '这条已谈妥，记得把结果记进「折中/结果」，方便落稿到正式合同。',
      }[state?.status || 'pending']

  const banner = isLocal
    ? '【本地模式】你开启了「仅本地分析」，以下是规则库预案，可直接使用。如需 AI 解读，请在左下角关闭该开关。'
    : '【军师离线】当前无法连接 AI 服务，以下是规则库预案建议，可直接使用。'

  return [
    banner,
    '',
    `对方立场：${stance}`,
    strategy ? `应对策略：${strategy}` : '',
    script ? `预案话术：「${script}」` : '',
    strategy ? `底线提醒：${strategy}` : '底线提醒：先标记谈判状态，谈妥后再落稿。',
  ]
    .filter(Boolean)
    .join('\n')
}

/*
 * 发送一条军师对话：RAG 检索 + 上下文构建 + 模型调用，全链路失败时回落本地预案。
 * 返回 { reply, offline, knowledgeHits }
 */
export async function requestAdvisorReply({ finding, state, tone, chatHistory, userPrompt, callAi, searchKnowledge, localOnlyMode, signal }) {
  if (localOnlyMode || typeof callAi !== 'function') {
    return { reply: createLocalNegotiationFallback({ finding, state, userPrompt, mode: 'local' }), offline: true, knowledgeHits: [] }
  }

  let ragItems = []
  try {
    if (typeof searchKnowledge === 'function') {
      const query = [finding.title, userPrompt].filter(Boolean).join(' ')
      ragItems = await searchKnowledge(query, 4, { signal })
    }
  } catch { /* 检索失败不阻断对话 */ }

  try {
    const messages = createNegotiationMessages({ finding, state, tone, chatHistory, userPrompt, ragItems })
    // maxTokens 须覆盖推理模型的思考过程（reasoning tokens 计入 max_tokens）。
    // 实测 deepseek 思考偶发飙到 2000+ 字符，2000 会偶发挤空 content，故给到 3000（代理上限 4000）。
    const data = await callAi(messages, { temperature: 0.4, maxTokens: 3000, signal })
    const reply = normalizeAiReplyText(extractAssistantChatContent(data))
    return {
      reply: reply || '军师暂时没拿到明确回复，请换个问法再试一次。',
      offline: false,
      knowledgeHits: Array.isArray(ragItems) ? ragItems : [],
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    const base = createLocalNegotiationFallback({ finding, state, userPrompt, mode: 'offline' })
    return { reply: `${base}\n\n（大模型连接失败：${error?.message || '未知错误'}）`, offline: true, knowledgeHits: [] }
  }
}
