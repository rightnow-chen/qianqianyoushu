import { ShieldAlert } from 'lucide-react'
import { formatMoney } from '../../features/amountEngine.js'
import { LEVEL_ORDER, levelLabel } from '../../features/riskModel.js'

export default function OverviewTab({
  risks,
  amounts,
  counts,
  worst,
  verdict,
  onTab,
  onOpenFix,
}) {
  return (
    <div className="pane">
      <div className="verdict">
        <div className="stamp">
          AI 初审
          <b>已核 {risks.length} 条</b>
        </div>
        <div className="v-label">审查结论</div>
        <div className="v-title">{verdict.title}</div>
        <div className="v-desc">{verdict.desc}</div>
      </div>

      <div className="loss">
        <div className="loss-main">
          <div className="lbl">最坏情况合计损失</div>
          <div className="loss-num">
            <small>¥</small>
            {formatMoney(worst.total)}
          </div>
        </div>
        <div className="loss-brk">
          {worst.items.map((item) => (
            <div className="loss-item" key={item.riskId}>
              <div className="bt">{item.label}</div>
              <div className="bv">¥{formatMoney(item.value)}</div>
              <div className="bn">{item.note} · 估算</div>
            </div>
          ))}
        </div>
      </div>

      <div className="sum3">
        {LEVEL_ORDER.map((level) => {
          const items = risks.filter((risk) => risk.level === level)
          return (
            <div className={`sum-col ${level}`} key={level}>
              <div className="sum-hd">
                <i />
                {levelLabel(level)}
                <span className="c">{counts[level]} 条</span>
              </div>
              {items.map((risk) => (
                <button
                  className="sum-li"
                  key={risk.id}
                  type="button"
                  onClick={() => onOpenFix(risk.id)}
                >
                  <span className="d">{risks.indexOf(risk) + 1}</span>
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {risk.title.replace(/^[^：]+：/, '')}
                  </span>
                  <span className="l">第{risk.location.article}条</span>
                </button>
              ))}
              {items.length === 0 && <div className="hint" style={{ padding: '4px 2px' }}>无</div>}
            </div>
          )
        })}
      </div>

      <div className="peek">
        <div className="peek-ic">
          <ShieldAlert size={14} aria-hidden="true" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="peek-t">还有 8 件合同外的事要当面问清</div>
          <div className="peek-s">
            产权人是谁、是否转租、物业费谁交 —— 这些写不进条款，但决定你会不会被赶走
          </div>
        </div>
        <button className="btn sm" type="button" onClick={() => onTab('check')}>
          看清单 →
        </button>
      </div>

      <div className="cta-row">
        <button className="btn primary" type="button" onClick={() => onTab('risk')}>
          开始逐条看（{risks.length} 条 · 约 3 分钟）
        </button>
        <button className="btn" type="button" onClick={() => onTab('say')}>
          不想逐条看，直接拿话术去问
        </button>
        <span className="sp" />
        <span className="hint">先看必须改的 {counts.must} 条，其余可跳过</span>
      </div>

      <div className="data-source">
        <span>已检查 38 句</span>
        <span>·</span>
        <span>法条库：民法典 / 电力法 / 北京市住房租赁条例</span>
        <span>·</span>
        <span>
          押金按押金的 {Math.round((amounts.depositDeduct / (amounts.deposit || 1)) * 100)}%
          估算，实际以合同约定为准
        </span>
      </div>
    </div>
  )
}
