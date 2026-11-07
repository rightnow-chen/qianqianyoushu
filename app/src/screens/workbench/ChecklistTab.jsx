import { Check } from 'lucide-react'

const CIRC = 119.38

export default function ChecklistTab({ checks, onToggle, onToast, onCopy }) {
  const doneCount = checks.filter((item) => item.done).length
  const total = checks.length
  const offset = CIRC * (1 - doneCount / total)

  const buildMessage = () => {
    const lines = checks.map((item, index) => `${index + 1}. ${item.q}`)
    return `房东您好，合同我基本看过了。还有几件事想跟您确认一下，麻烦您回复我一下，我好安排入住：\n${lines.join('\n')}\n谢谢您！`
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildMessage())
      onCopy?.('checklist_copy', { doneCount })
      onToast('已生成一条微信消息，直接粘过去就行')
    } catch {
      onToast('复制失败，长按选中也可以')
    }
  }

  return (
    <div className="pane">
      <div className="check-head">
        <div className="ring">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="19" fill="none" stroke="#EDF1F6" strokeWidth="4" />
            <circle
              cx="22"
              cy="22"
              r="19"
              fill="none"
              stroke="#1A5FFF"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset .3s ease' }}
            />
          </svg>
          <div className="ring-txt">
            {doneCount}/{total}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="h">合同外还要问清的 {total} 件事</div>
          <div className="s">这些写不进条款，但决定你会不会被赶走、押金能不能拿回来</div>
        </div>
      </div>

      <div className="legend">
        <i className="g" />
        已确认 {doneCount} 项
        <i className="w" />
        待确认 {total - doneCount} 项
      </div>

      <div className="check-list">
        {checks.map((item) => (
          <button
            className={`check-row ${item.done ? 'done' : ''}`}
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
          >
            <span className="check-box">{item.done && <Check size={10} aria-hidden="true" />}</span>
            <span className="check-q">{item.q}</span>
          </button>
        ))}
      </div>

      <div className="check-foot">
        <button className="btn sm primary" type="button" onClick={copy}>
          复制成一条微信消息
        </button>
        <span className="hint">一次问完，比来回追问八次更容易得到答复</span>
      </div>

      <div className="hint" style={{ marginTop: 10 }}>
        勾选只存在本机，刷新就清零 —— 我们不保存你的任何回答。
      </div>
    </div>
  )
}
