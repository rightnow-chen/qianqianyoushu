import { Bot, EyeOff, PlugZap, Send } from 'lucide-react'
import { getNegotiationRoleCopy } from '../features/negotiationUi.js'
import { getAssistantQuickPrompts } from '../features/assistantUi.js'
import AiMessageContent from './AiMessageContent.jsx'

export default function AiAssistantPanel({
  activeTab,
  aiDraft,
  aiFeedback,
  aiMessages,
  aiSending,
  aiStage,
  localOnlyMode,
  modelConnectionLabel,
  onDraftChange,
  onRateMessage,
  onResetChat,
  onCancel,
  onRetry,
  onSendDraft,
  assistantStatus,
}) {
  const roleCopy = getNegotiationRoleCopy('ai')
  const quickPrompts = getAssistantQuickPrompts(activeTab)

  return (
    <section className="ai-chat-panel runtime-api-panel" aria-label="租房小助手">
      <div className="ai-chat-header">
        <div className="ai-config-title">
          <span className="ai-config-icon">
            <Bot size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="runtime-kicker">全局辅助</p>
            <h2>{roleCopy.title}</h2>
            <p>{roleCopy.description}可以结合预算、合同风险和谈判进度回答。</p>
          </div>
        </div>
        <div className="ai-config-status">
          <span className="model-status">
            <PlugZap size={16} aria-hidden="true" />
            {modelConnectionLabel}
          </span>
        </div>
      </div>

      <div className="ai-chat-meta">
        <span className={localOnlyMode ? 'privacy-badge active' : 'privacy-badge'}>{localOnlyMode ? '仅本地分析' : '远端 AI 可用'}</span>
        {aiSending && <span>阶段：{aiStage === 'rag' ? '检索知识库' : aiStage === 'model' ? '模型分析' : '生成本地回复'}</span>}
      </div>

      <div className="assistant-status-card" aria-label="当前签约进度">
        <span>当前进度</span>
        <strong>{assistantStatus?.module || activeTab}</strong>
        <p>{assistantStatus?.facts?.join(' · ') || '正在读取当前进度'}。不知道怎么处理时，可以直接问我下一步先做什么。</p>
      </div>

      <div className="ai-chat-thread" aria-label="对话记录">
        {aiMessages.map((message) => (
          <article key={message.id} className={`ai-chat-bubble ${message.role === 'user' ? 'user' : 'assistant'} ${message.pending ? 'pending' : ''}`}>
            <span>{message.role === 'user' ? '我' : '租房小助手'}</span>
            <AiMessageContent content={message.content} />
            {message.role === 'assistant' && !message.pending && message.id !== 'assistant-welcome' ? (
              <div className="ai-feedback" aria-label="回复反馈">
                <button
                  className={aiFeedback.byMessage[message.id] === 'helpful' ? 'active' : ''}
                  type="button"
                  onClick={() => onRateMessage(message.id, 'helpful')}
                >
                  有帮助
                </button>
                <button
                  className={aiFeedback.byMessage[message.id] === 'needsWork' ? 'active' : ''}
                  type="button"
                  onClick={() => onRateMessage(message.id, 'needsWork')}
                >
                  需改进
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="assistant-quick-prompts" aria-label="快捷提问">
        <span>不知道怎么问？</span>
        <div>
          {quickPrompts.map((item) => (
            <button key={item.prompt} type="button" disabled={aiSending} onClick={() => onSendDraft(item.prompt)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ai-chat-composer">
        <textarea
          value={aiDraft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="直接问租房小助手，比如：我下一步应该先处理什么？"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSendDraft()
            }
          }}
        />
        <div className="config-actions ai-chat-actions">
          <button className="ghost-button" type="button" onClick={onResetChat} disabled={aiSending}>
            清空对话
          </button>
          <button className="primary-button" type="button" onClick={onSendDraft} disabled={aiSending || !aiDraft.trim()}>
            <Send size={17} aria-hidden="true" />
            {aiSending ? '发送中...' : '发送'}
          </button>
          {aiSending && <button className="ghost-button" type="button" onClick={onCancel}>取消请求</button>}
          {!aiSending && <button className="ghost-button" type="button" onClick={onRetry}>重试上一条</button>}
        </div>
      </div>

      <div className="security-callout">
        <EyeOff size={17} aria-hidden="true" />
        <span>这里负责跨模块判断和下一步建议；条款细节和谈判话术，请去谈判台。</span>
      </div>
    </section>
  )
}
