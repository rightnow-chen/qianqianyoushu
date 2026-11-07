import { useState } from 'react'

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
  const issues = quality.pages.filter((page) => page.state !== 'ok').length
  const word = (count) => ['零', '一', '两', '三', '四'][count] || String(count)

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
              <span className="t">文件与页面</span>
              <span className="s">共 {quality.totalPages} 页 · 21 处文字层缺失</span>
              <span className="sp" />
              <span className={`tag ${issues ? 'check' : 'blue'}`}>
                {issues ? '识别完成 · 1 项需重拍' : '识别完成'}
              </span>
            </div>
            <div className="panel-bd">
              <div className="file-card">
                <div className="file-badge">{meta.fileKind}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="file-name">{meta.fileName}</div>
                  <div className="file-meta">
                    {meta.fileSize} · {meta.filePages} 页 · {meta.fileNote}
                  </div>
                </div>
                <button className="btn sm" type="button" onClick={onReplace}>
                  替换
                </button>
              </div>

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
                逐页识别状态
                <span className="sp" />
                <span style={{ fontSize: 11, color: 'var(--ink4)' }}>点缩略图可补拍单页</span>
              </div>

              <div className="thumbs">
                {quality.pages.map((page) => {
                  const bad = page.state !== 'ok'
                  return (
                    <button
                      className="thumb"
                      key={page.n}
                      type="button"
                      onClick={() => (bad ? onRetake(page.n) : onRetake(page.n))}
                      title={bad ? `只补拍第 ${page.n} 页` : `第 ${page.n} 页已识别完整，可单独替换`}
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
                  <div className="thumb-cap">补拍 / 加页</div>
                </button>
              </div>

              <div className="warn-strip">{quality.warn}</div>
            </div>

            <div className="panel-hd" style={{ borderTop: '1px solid var(--line2)' }}>
              <span className="t">三个补救办法</span>
              <span className="s">换一种拍法，比反复重试更省时间</span>
            </div>
            <div className="panel-bd" style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <button className="btn sm" type="button" onClick={() => onRetake(2)}>
                ① 只补拍第 2 页
              </button>
              <button className="btn sm" type="button" onClick={onReplace}>
                ② 换一份文件
              </button>
              <button className="btn sm" type="button" onClick={onManual}>
                ③ 手动粘贴这一条
              </button>
            </div>
          </div>

          <div>
            <div className="panel">
              <div className="panel-hd">
                <span className="t">检查结果</span>
                <span className="sp" />
                <span className="tag check">{issues ? '1 项需重拍' : '全部通过'}</span>
              </div>
              <div className="panel-bd" style={{ paddingTop: 4 }}>
                <div className="check-item">
                  <div className="check-ic ok">✓</div>
                  <div style={{ flex: 1 }}>
                    <div className="check-title">文件完整性</div>
                    <div className="check-sub">
                      {quality.totalPages} 页连续，无缺页；文件未加密
                    </div>
                  </div>
                </div>
                <div className="check-item">
                  <div className="check-ic ok">✓</div>
                  <div style={{ flex: 1 }}>
                    <div className="check-title">合同类型</div>
                    <div className="check-sub">识别为「{meta.type}」，将按 9 类条款审查</div>
                  </div>
                </div>
                <div className="check-item">
                  <div className="check-ic warn">!</div>
                  <div style={{ flex: 1 }}>
                    <div className="check-title">
                      文字识别率 <span className="tag check">第 2 页 61%</span>
                    </div>
                    <div className="check-sub">反光区域集中在押金条款，其余 3 页 96% 以上</div>
                    <div className="check-bar">
                      <i style={{ width: '61%' }} />
                    </div>
                  </div>
                </div>
                <div className="check-item">
                  <div className="check-ic ok">✓</div>
                  <div style={{ flex: 1 }}>
                    <div className="check-title">隐私脱敏</div>
                    <div className="check-sub">
                      {word(quality.maskedIds)} 个身份证号、{word(quality.maskedPhones)}{' '}
                      个手机号已打码，不进模型
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-hd">
                <span className="t">在这里核对修正</span>
                <span className="sp" />
                <span className="tag line">第 4 条 · 押金</span>
              </div>
              <div className="panel-bd">
                <div className="ocr-box">
                  <div className="ocr-hd">
                    <span>识别结果 · 可直接改</span>
                    <span className="sp" />
                    <span style={{ color: 'var(--amber)' }}>低置信度 2 处</span>
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
                    改完这里，第 2 页不重拍也可以继续 —— 这一条会以你改后的文字为准。
                  </div>
                </div>
                <div className="hint" style={{ marginTop: 8 }}>
                  拍的时候把手机放平、别开闪光灯、纸面别翘起来，这三件事能解决 80% 的重拍。
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="task-foot">
          <button className="btn" type="button" onClick={onBack}>
            ← 换一个文件
          </button>
          <span className="hint">
            第 2 页识别不全也可以继续，押金条款会被标为「需人工核对」，但建议先补拍。
          </span>
          <button className="btn primary" type="button" onClick={onContinue}>
            继续，确认基础信息 →
          </button>
        </div>
      </div>
    </section>
  )
}
