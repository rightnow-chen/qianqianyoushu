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
  verdict,
  checks,
  degradation,
  aiReview,
  isDemo,
  onTab,
  onOpenFix,
  onReupload,
}) {
  const pendingChecks = checks?.length ?? 0
  const noMatch = degradation?.level === 'no-match'
  // AI 还在跑的时候，「没命中风险条款」这句话是暂时的、会变的，
  // 不能让它独占屏幕，否则用户看到 0 条就以为审查结束了。
  const aiRunning = aiReview?.status === 'running'
  const aiFailed = aiReview?.status === 'failed'

  return (
    <div className="pane">
      {isDemo && (
        <div className="banner demo">
          <b>演示数据</b>
          这一份是样例题库里的合同，不是你自己上传的那份。
        </div>
      )}

      {aiRunning && (
        <div className="banner partial">
          <b>AI 正在逐条核对原文</b>
          规则初筛已经出结果了，AI 正在按押金、退租、维修、入户、涨租这些维度再看一遍。结果回来会自动补到下面，不用重新上传。
        </div>
      )}

      {aiFailed && (
        <div className="banner partial">
          <b>AI 深度审查没跑完</b>
          {aiReview?.message || '这次只跑完了规则初筛。'} 下面这份结果只覆盖写法标准的那几条，隐蔽写法可能没被识别，建议对照左侧原文自己过一遍。
        </div>
      )}

      {degradation && degradation.level !== 'ok' && !aiRunning && (
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
        aiRunning ? (
          // AI 还在跑时只留一句轻提示。上面那条 banner 已经说清了在做什么，
          // 再摆一整块「规则初筛没对上」的插画式空状态，等于给一个临时状态盖结论。
          <div className="ai-wait">
            <span className="aw-dot" aria-hidden="true" />
            通常十几秒，先别关页面
          </div>
        ) : (
          <div className="empty-state">
            <div className="es-t">
              {noMatch ? '这份合同没命中已知的风险条款' : '没有读到可以判断的条款'}
            </div>
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
        )
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

          {/* 算不出合计就整块不出现。写「待补」等于把「这条本来就没有固定金额」
              说成「还差你补个数字」，是两种不同的结论，不该用同一块界面表达。 */}
          {worst.total > 0 && (
            <div className="loss-card">
              <div className="loss-main">
                <div className="lbl">最坏情况合计损失（估算）</div>
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
          )}

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
