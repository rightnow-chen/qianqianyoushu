import { useMemo, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { amountForRisk } from '../../features/amountEngine.js'
import EmptyPane from './EmptyPane.jsx'

export default function ScriptTab({ risks, amounts, activeId, onSelect, onTab, onToast, onCopy }) {
  const [tone, setTone] = useState('polite')
  const [objIndex, setObjIndex] = useState(0)
  const [bodies, setBodies] = useState({})

  const risk = risks.find((item) => item.id === activeId) || risks[0]

  // 所有 hook 必须在提前 return 之前：否则 risks 从 0 变 1 时 hook 顺序会变。
  const objections = useMemo(() => risk?.objections || [], [risk])

  if (!risk) {
    return (
      <EmptyPane
        title="没有可对照的话术"
        desc="这次没读出可判断的条款，也就没有绑定的条款和金额。合同本身没问题的话，重点放在下面那几件合同外的事。"
        onTab={onTab}
      />
    )
  }

  const key = `${risk.id}:${tone}`
  const amount = amountForRisk(risk, amounts)
  const text = bodies[key] ?? risk.scripts[tone]
  const activeObjection = objections[Math.min(objIndex, objections.length - 1)]

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      onCopy?.('script_copy', { riskId: risk.id, tone })
      onToast('已复制，可以直接粘到微信里')
    } catch {
      onToast('浏览器不让复制，长按选中这段文字也能发')
    }
  }

  return (
    <div className="pane">
      <div className="tone-bar">
        <div className="seg">
          <button className={tone === 'polite' ? 'on' : ''} type="button" onClick={() => {
            setTone('polite')
            setObjIndex(0)
          }}>
            礼貌版
          </button>
          <button className={tone === 'firm' ? 'on' : ''} type="button" onClick={() => {
            setTone('firm')
            setObjIndex(0)
          }}>
            协商版
          </button>
        </div>
        <span className="sp" />
        <span className="bind">
          绑定{' '}
          <b>
            {risk.location.article ? `第 ${risk.location.article} 条` : '条款位置待核对'} {risk.cat} ·{' '}
            {amount.text === '—' ? '无直接金额' : `${amount.text}（估算）`}
          </b>
        </span>
      </div>

      <div className="chip-rail">
        {risks.map((item, index) => (
          <button
            className={`chip ${item.id === risk.id ? 'on' : ''}`}
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
          >
            {index + 1}. {item.location.article ? `第 ${item.location.article} 条` : '待核对'} {item.cat}
          </button>
        ))}
      </div>

      <div className="wechat">
        <div className="wx-hd">
          <MessageCircle size={13} aria-hidden="true" />
          <span>微信里直接发给房东</span>
        </div>
        <div className="wx-body">
          <div
            className="bubble"
            key={key}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onInput={(event) =>
              setBodies((prev) => ({ ...prev, [key]: event.currentTarget.textContent || '' }))
            }
          >
            {text}
          </div>
        </div>
        <div className="wx-ft">
          <button className="btn sm primary" type="button" onClick={copy}>
            复制这段话
          </button>
          <span className="sp" />
          <button className="btn sm ghost" type="button" onClick={() => onTab('fix')}>
            这条怎么改 →
          </button>
        </div>
      </div>

      <div className="obj-hd">
        房东可能会这么回<span>点一句，看你该怎么接</span>
      </div>
      <div className="obj-chips">
        {objections.map((item, index) => (
          <button
            className={`obj-chip ${index === Math.min(objIndex, objections.length - 1) ? 'on' : ''}`}
            key={item.q}
            type="button"
            onClick={() => setObjIndex(index)}
          >
            「{item.q}」
          </button>
        ))}
      </div>

      {activeObjection && (
        <div className="thread">
          <div className="thread-row">
            <span className="thread-who">他说</span>
            <div className="thread-txt him">{activeObjection.q}</div>
          </div>
          <div className="thread-row">
            <span className="thread-who">你这样接</span>
            <div className="thread-txt me">{activeObjection.a}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <button
              className="btn xs"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(activeObjection.a)
                  onCopy?.('obj_copy', { riskId: risk.id })
                  onToast('已复制这句回复')
                } catch {
                  onToast('复制失败，长按选中也可以')
                }
              }}
            >
              复制这句回复
            </button>
          </div>
        </div>
      )}

      <div className="v02">
        <div className="v02-h">
          <span className="tag dim">V0.2</span>
          贴房东的原话，让 AI 帮你回一句
        </div>
        <div className="v02-fake">「这个我们一直都是这么签的，你要是不放心就别租了」</div>
        <div className="v02-note">
          多轮对话是真需求，但自由输入会冲掉「结论必须回指原文」这条底线 —— 先做预置短句，不做自由问答。
        </div>
      </div>
    </div>
  )
}
