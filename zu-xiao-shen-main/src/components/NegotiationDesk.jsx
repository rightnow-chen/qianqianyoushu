import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, FileText, Handshake, MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { NEGOTIATION_QUICK_PROMPTS, requestAdvisorReply } from '../features/negotiationAi.js'
import { getNegotiationProgress, getNegotiationRoleCopy } from '../features/negotiationUi.js'

const LEVEL_RANK = { high: 0, medium: 1, low: 2 }
const STATUS_RANK = { negotiating: 0, pending: 1, resolved: 2 }
const STATE_LABEL = { pending: '待谈', negotiating: '谈中', resolved: '已谈妥' }

function createState(findingId, negotiationStates) {
  return negotiationStates?.[findingId] || { status: 'pending', reaction: null, compromise: '' }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

let messageSeq = 0
function createMessageId(prefix) {
  messageSeq += 1
  return `${prefix}-${Date.now()}-${messageSeq}`
}

/*
 * 谈判台：租客出发去谈判现场时的随身边军师。
 * 左栏 = 待谈清单（什么最急先谈什么）；中栏 = 军师对话（现场生成话术/应对房东回应）；
 * 右栏 = 条款档案（原文证据、底线、法条、三态记录器）。三态与审合同页共享同一份数据。
 */
export default function NegotiationDesk({
  findings,
  negotiationStates,
  onChangeNegotiationState,
  negotiationChats,
  onAppendChat,
  acceptedIds,
  onApplyResolved,
  resolvedCount,
  callAi,
  searchKnowledge,
  localOnlyMode,
  focusFindingId,
  onFocusConsumed,
  onGoReview,
}) {
  const roleCopy = getNegotiationRoleCopy('negotiation')
  const acceptedCount = acceptedIds?.size || 0
  const progressCopy = getNegotiationProgress({ total: findings.length, resolvedCount, acceptedCount })
  const readyToApplyCount = findings.filter((finding) => (
    !acceptedIds?.has(finding.id) && createState(finding.id, negotiationStates).status === 'resolved'
  )).length
  // 深链/默认选中只在挂载时初始化（审合同「问军师」跳转时 focusFindingId 已就位），不用 effect 同步
  const [selectedId, setSelectedId] = useState(() => focusFindingId ?? null)
  const [tone, setTone] = useState('online')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const abortRef = useRef(null)
  const chatScrollRef = useRef(null)

  const sortedFindings = useMemo(() => {
    return [...findings].sort((a, b) => {
      const statusA = acceptedIds?.has(a.id) ? 3 : STATUS_RANK[createState(a.id, negotiationStates).status] ?? 1
      const statusB = acceptedIds?.has(b.id) ? 3 : STATUS_RANK[createState(b.id, negotiationStates).status] ?? 1
      if (statusA !== statusB) return statusA - statusB
      const levelA = LEVEL_RANK[a.level] ?? 1
      const levelB = LEVEL_RANK[b.level] ?? 1
      if (levelA !== levelB) return levelA - levelB
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN')
    })
  }, [acceptedIds, findings, negotiationStates])

  // 选中态派生：手动选中的优先；未选或选中项已不存在时回落到清单第一条
  const activeId = selectedId && findings.some((finding) => finding.id === selectedId)
    ? selectedId
    : sortedFindings[0]?.id ?? null

  // 深链消费：只在挂载后通知父级清掉 focus 标记，避免下次进 tab 误选中旧条款
  useEffect(() => {
    if (focusFindingId) onFocusConsumed?.()
  }, [focusFindingId, onFocusConsumed])

  const selected = useMemo(
    () => findings.find((finding) => finding.id === activeId) || null,
    [findings, activeId],
  )
  const messages = negotiationChats?.[activeId] || []

  useEffect(() => {
    const node = chatScrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages.length, sending, activeId])

  const send = async (rawPrompt) => {
    const prompt = String(rawPrompt || '').trim()
    if (!prompt || sending || !selected) return

    const controller = new AbortController()
    abortRef.current = controller
    setSending(true)
    setDraft('')

    const userMessage = { id: createMessageId('user'), role: 'user', content: prompt }
    let result
    try {
      result = await requestAdvisorReply({
        finding: selected,
        state: createState(selected.id, negotiationStates),
        tone,
        chatHistory: messages,
        userPrompt: prompt,
        callAi,
        searchKnowledge,
        localOnlyMode,
        signal: controller.signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') {
        setSending(false)
        abortRef.current = null
        return
      }
      result = { reply: `军师暂时联系不上：${error?.message || '未知错误'}`, offline: true, knowledgeHits: [] }
    }

    const advisorMessage = {
      id: createMessageId('advisor'),
      role: 'assistant',
      content: result.reply,
      offline: Boolean(result.offline),
    }
    onAppendChat?.(selected.id, [userMessage, advisorMessage])
    setSending(false)
    abortRef.current = null
  }

  const copyMessage = async (message) => {
    await copyText(message.content)
    setCopiedId(message.id)
    window.setTimeout(() => setCopiedId(null), 1600)
  }

  const cancelSend = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setSending(false)
  }

  if (!findings.length) {
    return (
      <section className="negotiation-desk">
        <div className="desk-empty">
          <Handshake size={40} aria-hidden="true" />
          <h2>还没有可谈判的风险点</h2>
          <p>完成合同检查后，这里会自动生成待谈清单。你可以逐条记录房东回应，再把谈妥内容写回修订合同。</p>
          <button className="primary-button" type="button" onClick={onGoReview}>
            <FileText size={16} aria-hidden="true" />
            去审合同
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="negotiation-desk">
      <aside className="desk-list-panel">
        <header className="desk-panel-head">
          <h2>待谈清单</h2>
          <div className="desk-progress">
            <span>{progressCopy.resolved}</span>
            <span>{progressCopy.accepted}</span>
          </div>
        </header>
        <p className="desk-list-intro">这些风险来自「审合同」；优先处理高风险项，谈妥后再落稿。</p>
        <div className="desk-list">
          {sortedFindings.map((finding) => {
            const state = createState(finding.id, negotiationStates)
            return (
              <button
                className={`desk-item ${activeId === finding.id ? 'active' : ''} status-${state.status}`}
                key={finding.id}
                type="button"
                onClick={() => setSelectedId(finding.id)}
              >
            <span className="desk-item-title">{finding.title}</span>
                <span className="desk-item-meta">
                  <span className={`risk-badge ${finding.level}`}>{finding.levelText || finding.level}</span>
                  <span className={`state-chip ${state.status}`}>{STATE_LABEL[state.status]}</span>
                  {acceptedIds.has(finding.id) && <span className="desk-item-done">已落稿</span>}
                </span>
              </button>
            )
          })}
        </div>
        <footer className="desk-list-foot">
          <button
            className="primary-button desk-apply"
            type="button"
            onClick={onApplyResolved}
            disabled={readyToApplyCount === 0}
          >
            {readyToApplyCount ? `将 ${readyToApplyCount} 条已谈妥内容写入合同` : '已全部写入修订合同'}
          </button>
        </footer>
      </aside>

      <section className="desk-chat-panel">
        {!selected ? (
          <div className="desk-empty desk-empty-slim">
            <Handshake size={32} aria-hidden="true" />
            <p>从左侧选择一条要谈的条款，军师随时开工。</p>
          </div>
        ) : (
          <>
            <header className="desk-chat-head">
              <div className="desk-chat-title">
                <Handshake size={18} aria-hidden="true" />
                <strong>{roleCopy.title}</strong>
                <span className="desk-chat-topic">{selected.title}</span>
                {localOnlyMode && <span className="desk-offline-chip">离线预案模式</span>}
              </div>
              <div className="tone-toggle" role="group" aria-label="语气切换">
                <button className={tone === 'online' ? 'active' : ''} type="button" onClick={() => setTone('online')}>
                  线上
                </button>
                <button className={tone === 'offline' ? 'active' : ''} type="button" onClick={() => setTone('offline')}>
                  线下
                </button>
              </div>
            </header>

            <div className="desk-chat-scroll" ref={chatScrollRef}>
              {messages.length === 0 && (
                <div className="desk-intro">
                  <p className="desk-intro-head">带着预案去谈，心里更有底：</p>
                  {selected.negotiation && <p className="desk-intro-script">「{selected.negotiation}」</p>}
                  <p className="desk-intro-hint">
                    {roleCopy.description}点下面的快捷提问，或在输入框粘贴房东的最新回应。
                  </p>
                </div>
              )}
              {messages.map((message) => (
                <div className={`desk-msg ${message.role === 'user' ? 'user' : 'advisor'}`} key={message.id}>
                  <div className="desk-msg-bubble">
                    {message.role === 'assistant' && message.offline && <span className="desk-offline-chip">离线预案</span>}
                    <p>{message.content}</p>
                  </div>
                  {message.role === 'assistant' && (
                    <button className="desk-copy" type="button" onClick={() => copyMessage(message)}>
                      {copiedId === message.id ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                      {copiedId === message.id ? '已复制' : '复制'}
                    </button>
                  )}
                </div>
              ))}
              {sending && (
                <div className="desk-msg advisor">
                  <div className="desk-msg-bubble pending">
                    <p>军师思考中…</p>
                  </div>
                  <button className="desk-copy" type="button" onClick={cancelSend}>
                    <X size={13} aria-hidden="true" />
                    取消
                  </button>
                </div>
              )}
            </div>

            <div className="desk-quick" role="group" aria-label="快捷提问">
              {NEGOTIATION_QUICK_PROMPTS.map(({ key, label, prompt }) => (
                <button disabled={sending} key={key} type="button" onClick={() => send(prompt)}>
                  <Sparkles size={13} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <form
              className="desk-input"
              onSubmit={(event) => {
                event.preventDefault()
                send(draft)
              }}
            >
              <input
                onChange={(event) => setDraft(event.target.value)}
                placeholder="粘贴房东最新回应，或问这一条怎么谈…"
                type="text"
                value={draft}
              />
              <button aria-label="发送" className="desk-send" disabled={sending || !draft.trim()} type="submit">
                <Send size={16} aria-hidden="true" />
              </button>
            </form>
          </>
        )}
      </section>

      <aside className="desk-clause-panel">
        <header className="desk-panel-head">
          <h2>条款档案</h2>
          <MessageCircle size={15} aria-hidden="true" />
        </header>
        {!selected ? (
          <p className="desk-clause-empty">选中条款后，这里显示原文证据、底线和谈判进度。</p>
        ) : (
          <div className="desk-clause-body">
            {selected.evidence && (
              <div className="desk-clause-block">
                <span className="desk-clause-label">原文证据</span>
                <p className="desk-clause-evidence">{selected.evidence}</p>
              </div>
            )}
            {selected.suggestion && (
              <div className="desk-clause-block">
                <span className="desk-clause-label">我们的底线</span>
                <p className="desk-clause-baseline">{selected.suggestion}</p>
              </div>
            )}
            {selected.legalBasis && (
              <div className="desk-clause-block">
                <span className="desk-clause-label">依据</span>
                <p className="desk-clause-legal">
                  {selected.legalBasis}
                  {selected.legalUrl && (
                    <a href={selected.legalUrl} rel="noreferrer" target="_blank">法条原文 ↗</a>
                  )}
                </p>
              </div>
            )}

            <div className="desk-clause-block">
              <span className="desk-clause-label">谈判进度</span>
              <div className="negotiation-state-tabs desk-state-tabs" role="tablist" aria-label="谈判进度">
                {[
                  { key: 'pending', label: '待谈' },
                  { key: 'negotiating', label: '谈中' },
                  { key: 'resolved', label: '已谈妥' },
                ].map(({ key, label }) => (
                  <button
                    className={`state-tab ${createState(selected.id, negotiationStates).status === key ? 'active' : ''}`}
                    key={key}
                    type="button"
                    onClick={() => onChangeNegotiationState(selected.id, { status: key, reaction: key === 'pending' ? null : createState(selected.id, negotiationStates).reaction, compromise: createState(selected.id, negotiationStates).compromise })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {createState(selected.id, negotiationStates).status === 'negotiating' && (
                <>
                  <div className="reaction-row" role="radiogroup" aria-label="房东反应">
                    {[
                      { key: 'agree', label: '同意' },
                      { key: 'compromise', label: '折中' },
                      { key: 'reject', label: '拒绝' },
                    ].map(({ key, label }) => (
                      <button
                        className={`reaction-chip ${createState(selected.id, negotiationStates).reaction === key ? 'active' : ''}`}
                        key={key}
                        type="button"
                        onClick={() => onChangeNegotiationState(selected.id, { status: 'negotiating', reaction: key, compromise: createState(selected.id, negotiationStates).compromise })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="compromise-input"
                    onChange={(event) => onChangeNegotiationState(selected.id, { status: 'negotiating', reaction: createState(selected.id, negotiationStates).reaction, compromise: event.target.value })}
                    placeholder="记录折中结果，如：押金退 30 天谈成 15 天"
                    type="text"
                    value={createState(selected.id, negotiationStates).compromise}
                  />
                </>
              )}
              {createState(selected.id, negotiationStates).status === 'resolved' && createState(selected.id, negotiationStates).compromise && (
                <div className="negotiation-result resolved-note">
                  <span>谈妥结果</span>
                  {createState(selected.id, negotiationStates).compromise}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </section>
  )
}
