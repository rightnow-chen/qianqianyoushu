import { ShieldAlert } from 'lucide-react'
import { formatMoney } from '../../features/amountEngine.js'
import { LEVEL_ORDER, levelLabel } from '../../features/riskModel.js'

/** 引擎没给出可用结论时的三种说法，各自对应一个能点的下一步（PRD 9.6）。 */
const DEGRADE_COPY = {
  failed: {
    title: '这次没跑出结论',
    action: '换一份或重拍',
  },
  // 字读到了，只是没有一句话对得上规则库。这跟「文件有问题」是两回事，
  // 不能让人拿着一份正常合同去重拍。
  'no-match': {
    title: '读到了正文，但没命中已知风险条款',
    action: '看待核实清单',
  },
  partial: {
    title: '只读到条款，没定位到原句',
    action: '对照原文核对',
  },
}

export default function OverviewTab({
  risks,
  counts,
  worst,
  hasAmounts,
  verdict,
  checks,
  degradation,
  isDemo,
  onTab,
  onOpenFix,
  onReupload,
}) {
  const pendingChecks = checks?.length ?? 0
  const noMatch = degradation?.level === 'no-match'
  const mustCount = counts?.must ?? 0

  // 「待补」只在真的缺数时出现。条款本身没有固定金额（违约金按逾期天数算）
  // 时不摆「待补」——那句话会让用户以为回到上一步填个数字就能算出来。
  const lossNote =
    mustCount === 0
      ? '这份合同没有必须修改的条款，不需要估算损失。'
      : hasAmounts
        ? '这几条没有固定金额可以折算（比如违约金按逾期天数计），实际损失取决于违约多久、扣多少，所以不在这里硬凑一个数。'
        : '这份合同里没读到月租或押金金额，损失推算不出来。回到上一步把这几个数补上，这里的金额会立刻重算。'

  return (
    <div className="pane">
      {isDemo && (
        <div className="banner demo">
          <b>演示数据</b>
          这一份是样例题库里的合同，不是你自己上传的那份。
        </div>
      )}

      {degradation && degradation.level !== 'ok' && (
        <div className={`banner ${degradation.level}`}>
          <b>{DEGRADE_COPY[degradation.level]?.title || '结果不完整'}</b>
          {degradation.message}
          {degradation.level === 'failed' && onReupload && (
            <button className="bsm" type="button" onClick={onReupload}>
              重新上传 →
            </button>
          )}
        </div>
      )}

      {degradation?.level === 'ok' && degradation.noSuggestion > 0 && (
        <div className="banner partial">
          <b>{degradation.noSuggestion} 条只给出风险</b>
          {degradation.message}
        </div>
      )}

      {risks.length === 0 ? (
        <div className="empty-state">
          <div className="es-t">{noMatch ? '这份合同没命中已知的风险条款' : '没有读到可以判断的条款'}</div>
          <div className="es-s">
            {noMatch
              ? `押金、退租、维修这三条最花钱，请对着左边原文自己过一遍；右边那 ${
                  pendingChecks || 8
                } 件合同外的事也一并问清楚。`
              : `可能文件只有几行，或者图片没识别清。你可以重传一份更完整的合同；如果合同本身没问题，也别忘了把那 ${
                  pendingChecks || 8
                } 件合同外的事问清楚。`}
          </div>
          <div className="es-a">
            {onReupload && (
              <button className="btn sm primary" type="button" onClick={onReupload}>
                重新上传合同
              </button>
            )}
            <button className="btn sm" type="button" onClick={() => onTab('check')}>
              先看待核实清单
            </button>
          </div>
        </div>
      ) : (
        <>
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
              <div className="lbl">最坏情况合计损失（估算）</div>
              {worst.total > 0 ? (
                <div className="loss-num">
                  <small>¥</small>
                  {formatMoney(worst.total)}
                </div>
              ) : (
                <div className="loss-num tbd">{mustCount === 0 ? '—' : '待补'}</div>
              )}
            </div>
            <div className="loss-brk">
              {worst.items.map((item) => (
                <div className="loss-item" key={item.riskId}>
                  <div className="bt">{item.label}</div>
                  <div className="bv">¥{formatMoney(item.value)}</div>
                  <div className="bn">{item.note} · 估算</div>
                </div>
              ))}
              {worst.total === 0 && (
                <div className="loss-item">
                  <div className="bt">还没法算</div>
                  <div className="bn" style={{ whiteSpace: 'normal' }}>
                    {lossNote}
                  </div>
                </div>
              )}
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
                      <span className="l">
                        {risk.location.article ? `第${risk.location.article}条` : '待核对'}
                      </span>
                    </button>
                  ))}
                  {items.length === 0 && (
                    <div className="hint" style={{ padding: '4px 2px' }}>
                      无
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="peek">
            <div className="peek-ic">
              <ShieldAlert size={14} aria-hidden="true" />
            </div>
            <div style={{ flex: 1 }}>
              <div className="peek-t">还有 {pendingChecks} 件合同外的事要当面问清</div>
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
        </>
      )}
    </div>
  )
}
