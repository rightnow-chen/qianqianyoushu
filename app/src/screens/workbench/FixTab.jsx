import { useState } from 'react'
import { Check } from 'lucide-react'
import { buildDiff } from '../../features/diff.js'
import { levelLabel } from '../../features/riskModel.js'
import EmptyPane from './EmptyPane.jsx'

export default function FixTab({
  risks,
  activeId,
  edited,
  accepted,
  done,
  onSelect,
  onSaveEdit,
  onAccept,
  onDone,
  onLocate,
  onTab,
  onToast,
}) {
  const index = Math.max(0, risks.findIndex((risk) => risk.id === activeId))
  const risk = risks[index]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!risk) {
    return (
      <EmptyPane
        title="没有需要修改的条款"
        desc="这次没读出可判断的风险条款，所以没有修改建议。先看合同外那几件事要不要当面问清。"
        onTab={onTab}
      />
    )
  }

  const current = edited[risk.id] ?? risk.suggestion
  const userEdited = Boolean(edited[risk.id])
  const diff = userEdited ? null : buildDiff(risk.original, current)
  const sameCategory = risks.filter((item) => item.cat === risk.cat && item.id !== risk.id)
  const queue = risks.filter((item) => item.level === 'must' && !done[item.id] && item.id !== risk.id)

  const startEdit = () => {
    setDraft(current)
    setEditing(true)
  }

  return (
    <div className="pane">
      <div className="fix">
        <div className="fix-hd">
          <span className="fix-no">
            风险点 <b>{index + 1}</b> / {risks.length}
          </span>
          <span className={`tag ${risk.level}`}>{levelLabel(risk.level)}</span>
          <span className="sp" />
          <span className="fix-loc">
            {risk.location.article ? `第 ${risk.location.article} 条` : '条款位置待核对'} ·{' '}
            {risk.location.page ? `第 ${risk.location.page} 页` : '页码未识别'}
          </span>
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            <button
              className="btn xs"
              type="button"
              title="上一条"
              disabled={index === 0}
              onClick={() => onSelect(risks[index - 1].id)}
            >
              ↑
            </button>
            <button
              className="btn xs"
              type="button"
              title="下一条"
              disabled={index === risks.length - 1}
              onClick={() => onSelect(risks[index + 1].id)}
            >
              ↓
            </button>
          </div>
        </div>

        <div className="fix-sec">
          <div className="fix-label">风险结论</div>
          <div className="fix-title">{risk.title}</div>
          <div className="fix-why">{risk.why}</div>
          <div className="lawline">
            <span>法律依据</span>
            <b>{risk.law.name}</b>
            <span>{risk.law.version} · {risk.law.scope}</span>
            <button type="button" onClick={() => window.open(risk.law.url, '_blank', 'noopener')}>
              法条原文 ↗
            </button>
          </div>
        </div>

        <div className="fix-sec">
          <div className="fix-label">
            合同原文
            <span className="labtag del">待删除</span>
            <span className="sp" />
            <button type="button" style={{ color: 'var(--blue)', fontSize: 10.5 }} onClick={() => onLocate(risk.id)}>
              定位至原文
            </button>
          </div>
          <div className="quote old">
            {diff
              ? diff.oldParts.map((part, i) =>
                  part.changed ? (
                    <span className="del" key={i}>
                      {part.text}
                    </span>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )
              : risk.original}
          </div>
        </div>

        <div className="fix-sec">
          <div className="fix-label">
            建议改为
            <span className="labtag ins">新增</span>
            <span className="sp" />
            {!editing && (
              <button className="btn xs" type="button" onClick={startEdit}>
                编辑
              </button>
            )}
          </div>

          {editing ? (
            <div className="edit-area">
              <textarea
                value={draft}
                spellCheck={false}
                onChange={(event) => setDraft(event.target.value)}
                autoFocus
              />
              <div className="edit-ft">
                <button
                  className="btn xs primary"
                  type="button"
                  onClick={() => {
                    if (!draft.trim()) {
                      onToast('先写一句你自己的说法，再保存')
                      return
                    }
                    onSaveEdit(risk.id, draft.trim())
                    setEditing(false)
                  }}
                >
                  <Check size={11} aria-hidden="true" />
                  保存
                </button>
                <button className="btn xs" type="button" onClick={() => setEditing(false)}>
                  取消
                </button>
                <span className="hint">改完先点保存，再接受修订</span>
              </div>
            </div>
          ) : (
            <div className="quote new">
              {diff
                ? diff.newParts.map((part, i) =>
                    part.changed ? (
                      <span className="ins" key={i}>
                        {part.text}
                      </span>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )
                : current}
            </div>
          )}
          {userEdited && <div className="hint" style={{ marginTop: 5 }}>已按你的措辞保存，不再显示对照差异。</div>}
        </div>

        <div className="fix-ft">
          <button className={`done-btn ${done[risk.id] ? 'on' : ''}`} type="button" onClick={() => onDone(risk.id)}>
            <Check size={13} aria-hidden="true" />
            <span>{done[risk.id] ? '已处理' : '标记已处理'}</span>
          </button>
          <span className="sp" />
          <button className="btn sm" type="button" onClick={() => onToast('演示：为这一句生成 Word 批注，随批注版导出')}>
            添加批注
          </button>
          <button
            className={`btn primary ${accepted[risk.id] ? '' : ''}`}
            type="button"
            onClick={() => onAccept(risk.id)}
          >
            {accepted[risk.id] ? '✓ 已接受修订' : '接受建议并添加修订'}
          </button>
        </div>
      </div>

      {sameCategory.length > 0 && (
        <div className="related">
          同属「{risk.cat}」的还有 {sameCategory.length} 条：
          {sameCategory.map((item) => (
            <button className="queue-item" key={item.id} type="button" onClick={() => onSelect(item.id)}>
              · {item.title}
            </button>
          ))}
        </div>
      )}

      {queue.length > 0 && (
        <div className="queue">
          还要改的 {queue.length} 条（必须改 · 未处理）
          {queue.map((item) => (
            <button className="queue-item" key={item.id} type="button" onClick={() => onSelect(item.id)}>
              → {item.location.article ? `第 ${item.location.article} 条` : item.cat} {item.title}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn sm" type="button" onClick={() => onTab('risk')}>
          回到风险列表
        </button>
        <button className="btn sm" type="button" onClick={() => onTab('say')}>
          拿这条去跟房东说 →
        </button>
      </div>
    </div>
  )
}
