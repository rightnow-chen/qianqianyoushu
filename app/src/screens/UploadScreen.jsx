import { useState } from 'react'

const LEVEL_ICON = { ok: '✓', warn: '!' }

export default function UploadScreen({
  meta,
  quality,
  onRetake,
  onReplace,
  onManual,
  onContinue,
  onBack,
}) {
  const [ocrText, setOcrText] = useState(quality.ocrSample)
  const isOcr = quality.mode === 'ocr'
  const issues = (quality.pages || []).filter((page) => page.state !== 'ok').length
  const checks = quality.checks || []
  const advice = quality.advice || []

  const stateTag = issues
    ? `识别完成 · ${issues} 项需重拍`
    : isOcr
      ? '识别完成'
      : '提取完成'

  return (
    <section className="task">
      <div className="task-inner">
        <div className="crumb">
          <span>新建审查</span>
          <span className="dot" />
          <b>上传与质检</b>
          <span className="dot" />
          <span>确认信息</span>
          <span className="dot" />
          <span>看结果</span>
        </div>

        <div className="grid-upload">
          <div className="panel">
            <div className="panel-hd">
              <span className="t">{isOcr ? '文件与页面' : '读到的内容'}</span>
              <span className="s">
                {quality.pagesCountLabel ? `${quality.pagesCountLabel} · ` : ''}
                {isOcr ? '照片识别结果' : '文字层直接提取'}
              </span>
              <span className="sp" />
              <span className={`tag ${issues ? 'check' : 'blue'}`}>{stateTag}</span>
            </div>
            <div className="panel-bd">
              <div className="file-card">
                <div className="file-badge">{meta.fileKind}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="file-name">{meta.fileName}</div>
                  <div className="file-meta">
                    {meta.fileSize}
                    {quality.mode !== 'plain' && meta.filePages ? ` · ${meta.filePages} 页` : ''} ·{' '}
                    {meta.fileNote}
                  </div>
                </div>
                <button className="btn sm" type="button" onClick={onReplace}>
                  替换
                </button>
              </div>

              {/* 逐页缩略图只在两种情况下有价值：拍照（要知道哪页不清楚）、或确实有坏页要处理。
                  文字层文件每页都完整时，22 个打勾的方块只是噪音，还会把页面撑爆。 */}
              {quality.pages?.length > 0 && (isOcr || issues > 0) && (
                <>
                  <div
                    style={{
                      marginTop: 12,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: 12,
                      color: 'var(--ink3)',
                    }}
                  >
                    {isOcr ? '逐页识别状态' : '逐页提取状态'}
                    <span className="sp" />
                    <span style={{ fontSize: 11, color: 'var(--ink4)' }}>
                      {isOcr ? '点缩略图可补拍单页' : '每页都有文字层，可直接逐句比对'}
                    </span>
                  </div>

                  <div className="thumbs">
                    {quality.pages.map((page) => {
                      const bad = page.state !== 'ok'
                      return (
                        <button
                          className="thumb"
                          key={page.n}
                          type="button"
                          onClick={() => onRetake(page.n)}
                          title={
                            bad
                              ? `只补拍第 ${page.n} 页`
                              : isOcr
                                ? `第 ${page.n} 页已识别完整，可单独替换`
                                : `第 ${page.n} 页，查看提取到的内容`
                          }
                        >
                          <div className={`thumb-box ${bad ? 'bad' : ''}`}>
                            <span className={bad ? 'flag' : 'ok'}>{bad ? '重拍' : '✓'}</span>
                            <span className="pg">第 {page.n} 页</span>
                          </div>
                          <div className={`thumb-cap ${bad ? 'warn' : ''}`}>{page.label}</div>
                        </button>
                      )
                    })}
                    <button className="thumb" type="button" onClick={() => onRetake(0)}>
                      <div className="thumb-box add">+</div>
                      <div className="thumb-cap">{isOcr ? '补拍 / 加页' : '换一页'}</div>
                    </button>
                  </div>
                </>
              )}

              <div className="warn-strip">{quality.warn}</div>

              {/* 文字层文件的「质检」不是看识别率，而是看提取结果有没有串行。
                  给一段开头让用户扫一眼，5 秒就能判断「读对没读对」。 */}
              {!isOcr && quality.previewText && (
                <div className="ocr-box" style={{ marginTop: 10 }}>
                  <div className="ocr-hd">
                    <span>提取到的开头</span>
                    <span className="sp" />
                    <span style={{ color: 'var(--ink4)' }}>扫一眼就能看出有没有串行</span>
                  </div>
                  <div className="ocr-text preview-text">{quality.previewText}…</div>
                </div>
              )}
            </div>

            {/* 补救办法只对「照片没拍好」成立；PDF 有问题时该换的是文件本身，不是重拍 */}
            {advice.length > 0 && (
              <>
                <div className="panel-hd" style={{ borderTop: '1px solid var(--line2)' }}>
                  <span className="t">照片不清楚，可以这样做</span>
                  <span className="s">比反复重试更省时间</span>
                </div>
                <div
                  className="panel-bd"
                  style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}
                >
                  {advice.map((item) => (
                    <button
                      className="btn sm"
                      key={item.kind}
                      type="button"
                      onClick={() => {
                        if (item.kind === 'retake') onRetake(item.page || 1)
                        else if (item.kind === 'replace') onReplace()
                        else onManual()
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div>
            <div className="panel">
              <div className="panel-hd">
                <span className="t">检查结果</span>
                <span className="sp" />
                <span className={`tag ${issues ? 'check' : 'blue'}`}>
                  {issues ? `${issues} 项需重拍` : '全部通过'}
                </span>
              </div>
              <div className="panel-bd" style={{ paddingTop: 4 }}>
                {checks.map((item) => (
                  <div className="check-item" key={item.key}>
                    <div className={`check-ic ${item.status === 'warn' ? 'warn' : 'ok'}`}>
                      {LEVEL_ICON[item.status] || '✓'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="check-title">
                        {item.title}
                        {item.badge && <span className="tag check">{item.badge}</span>}
                      </div>
                      <div className="check-sub">{item.detail}</div>
                      {item.bar && (
                        <div className="check-bar">
                          <i style={{ width: `${item.bar.value}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 只要不是 OCR，就没有「识别结果要改」这回事，这块整块不出现 */}
            {isOcr && (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panel-hd">
                  <span className="t">识别结果，可以直接改</span>
                  <span className="sp" />
                  <span className="tag line">改完就能继续</span>
                </div>
                <div className="panel-bd">
                  <div className="ocr-box">
                    <div className="ocr-hd">
                      <span>识别出来的开头部分</span>
                      <span className="sp" />
                      <span style={{ color: 'var(--ink4)' }}>可直接编辑</span>
                    </div>
                    <div
                      className="ocr-text"
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck={false}
                      onInput={(event) => setOcrText(event.currentTarget.textContent || '')}
                    >
                      {ocrText}
                    </div>
                    <div className="ocr-tip">
                      改完这里，第 1 页不重拍也可以继续 —— 这一条会以你改后的文字为准。
                    </div>
                  </div>
                  <div className="hint" style={{ marginTop: 8 }}>
                    拍的时候把手机放平、别开闪光灯、纸面别翘起来，这三件事能解决 80% 的重拍。
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="task-foot">
          <button className="btn" type="button" onClick={onBack}>
            ← 换一个文件
          </button>
          <span className="hint">{quality.footerHint}</span>
          <button className="btn primary" type="button" onClick={onContinue}>
            继续，确认基础信息 →
          </button>
        </div>
      </div>
    </section>
  )
}
