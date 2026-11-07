import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { amountForRisk } from '../../features/amountEngine.js'
import { levelLabel } from '../../features/riskModel.js'

export default function RiskTab({ risks, amounts, done, meta, onOpenFix, onTab, onLocate, onDone, onTrack }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('severity')
  const [open, setOpen] = useState({ r1: true })

  const counts = {
    all: risks.length,
    must: risks.filter((risk) => risk.level === 'must').length,
    check: risks.filter((risk) => risk.level === 'check').length,
    note: risks.filter((risk) => risk.level === 'note').length,
  }

  const visible = risks
    .filter((risk) => (filter === 'all' ? true : risk.level === filter))
    .slice()
    .sort((a, b) => {
      if (sort === 'article') return (a.location.article ?? 999) - (b.location.article ?? 999)
      const order = { must: 0, check: 1, note: 2 }
      return order[a.level] - order[b.level]
    })

  const stats = [
    { key: 'all', label: '全部', value: counts.all, cls: '' },
    { key: 'must', label: '必须改', value: counts.must, cls: 'must' },
    { key: 'check', label: '建议确认', value: counts.check, cls: 'check' },
    { key: 'note', label: '仅提醒', value: counts.note, cls: '' },
    {
      key: 'pass',
      label: '已检查通过',
      value: Math.max(0, (meta?.sentenceCount || 0) - risks.length),
      cls: 'pass',
    },
  ]

  return (
    <div className="pane">
      <div className="stats">
        {stats.map((item) => (
          <button
            className={`stat ${item.cls} ${filter === item.key ? 'on' : ''}`}
            key={item.key}
            type="button"
            onClick={() => {
              if (item.key === 'pass') return
              setFilter(item.key)
              onTrack?.('risk_filter', { filter: item.key })
            }}
          >
            <div className="v">{item.value}</div>
            <div className="k">{item.label}</div>
          </button>
        ))}
      </div>

      <div className="filterbar">
        <span>
          共 {visible.length} 条，按{sort === 'severity' ? '严重程度' : '原文顺序'}排序
        </span>
        <span className="sp" />
        <button
          className="sort-btn"
          type="button"
          onClick={() => {
            const next = sort === 'severity' ? 'article' : 'severity'
            setSort(next)
            onTrack?.('risk_sort', { sort: next })
          }}
        >
          {sort === 'severity' ? '严重程度' : '原文顺序'}
          <ChevronDown size={11} aria-hidden="true" />
        </button>
      </div>

      {visible.map((risk) => {
        const index = risks.indexOf(risk) + 1
        const amount = amountForRisk(risk, amounts)
        const expanded = !!open[risk.id]
        return (
          <div className="risk-card" key={risk.id}>
            <button
              className="rc-hd"
              type="button"
              onClick={() => {
                setOpen((prev) => ({ ...prev, [risk.id]: !expanded }))
                if (!expanded) onTrack?.('risk_card_open', { riskId: risk.id, level: risk.level })
              }}
            >
              <span className={`tag ${risk.level}`}>{levelLabel(risk.level)}</span>
              <span className="rc-title">
                {index}. {risk.title}
              </span>
              {done[risk.id] && <span className="tag line">已处理</span>}
              <span className={`rc-amt ${amount.kind}`}>
                {amount.text}
                {amount.kind !== 'none' && <i className="est">估算</i>}
              </span>
              {expanded ? (
                <ChevronUp size={13} aria-hidden="true" color="#9AA4B2" />
              ) : (
                <ChevronDown size={13} aria-hidden="true" color="#9AA4B2" />
              )}
            </button>

            {expanded && (
              <div className="rc-body">
                <div className="rc-meta">
                  <span>
                    {risk.location.article ? `第 ${risk.location.article} 条` : '条款位置待核对'}
                  </span>
                  <span>
                    {risk.location.page ? `第 ${risk.location.page} 页` : '页码未识别'}
                  </span>
                  <span>置信度：{risk.confidence}</span>
                  <span>类别：{risk.cat}</span>
                </div>

                <div className="rc-block">
                  <div className="rc-label">风险结论</div>
                  <div className="rc-text">{risk.consequence}</div>
                </div>

                <div className="rc-block">
                  <div className="rc-label">
                    合同原文
                    <span className="sp" />
                    <button
                      type="button"
                      style={{ color: 'var(--blue)', fontSize: 10.5 }}
                      onClick={() => onLocate(risk.id)}
                    >
                      定位至原文 →
                    </button>
                  </div>
                  <div className="quote old">{risk.original}</div>
                </div>

                <div className="rc-block">
                  <div className="rc-label">建议改为</div>
                  <div className="quote new">{risk.suggestion}</div>
                </div>

                <div className="lawline">
                  <span>法律依据</span>
                  <b>{risk.law.name}</b>
                  <span>· {risk.law.version}</span>
                  <span>· {risk.law.scope}</span>
                  <button type="button" onClick={() => window.open(risk.law.url, '_blank', 'noopener')}>
                    法条原文 ↗
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                  <button className="btn sm" type="button" onClick={() => onOpenFix(risk.id)}>
                    看怎么改
                  </button>
                  <button className="btn sm" type="button" onClick={() => onTab('say')}>
                    怎么跟房东说
                  </button>
                  <span className="sp" />
                  <button
                    className={`done-btn ${done[risk.id] ? 'on' : ''}`}
                    type="button"
                    onClick={() => onDone(risk.id)}
                  >
                    {done[risk.id] ? '✓ 已处理' : '标记已处理'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
