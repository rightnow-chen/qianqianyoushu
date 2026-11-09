import { useMemo, useState } from 'react'
import { REVIEW_SCOPE, REVIEW_SCALES } from '../features/riskModel.js'
import { previewKindOf, previewNoteFor } from '../features/filePreview.js'
import PaperPreview from './confirm/PaperPreview.jsx'

const TYPES = ['房屋租赁合同', '公寓租赁合同', '合租协议', '疑似非租赁合同']
const CITIES = ['待确认', '北京 · 朝阳', '北京 · 海淀', '上海 · 浦东', '广州 · 天河', '深圳 · 南山', '武汉 · 洪山']

/** 允许下拉里出现「合同里读到、但不在固定列表」的类型，否则 select 会显示空白。 */
function optionsWith(current, options) {
  if (!current || options.includes(current)) return options
  return [current, ...options]
}

export default function ConfirmScreen({ meta, onChangeMeta, onNext, onBack, file, text, structure }) {
  const [mode, setMode] = useState('paper')
  const kind = previewKindOf({ fileName: meta.fileName, source: meta.source, mime: file?.type })
  // 只有拿到原始文件才能显示原件；演示数据没有文件，退化成全文
  const hasOriginal = Boolean(file) && (kind === 'pdf' || kind === 'image' || kind === 'word')
  // 只有拍照才有「识别」这回事：PDF / Word / TXT 的文字本来就是文件自带的，
  // 给它们放一个「识别全文」只会让人以为是识别出来的，还多一层没必要的点击。
  const canToggle = kind === 'image'
  const heading = kind === 'image' ? '合同照片' : kind === 'pdf' || kind === 'word' ? '合同原件' : '原文预览'
  // 不支持切换的来源一律按原件渲染，mode 残值不影响显示
  const activeMode = canToggle ? mode : 'paper'
  const note = useMemo(() => {
    if (canToggle && mode === 'text') {
      return '这是从照片里识别出来的文字，按条款重新排过版，方便你逐条核对；识别错的地方右边字段可以直接改。'
    }
    if (hasOriginal) return previewNoteFor(kind, { pageCount: meta.filePages })
    if (kind === 'word') return previewNoteFor('word')
    return '这是从文件里读出来的正文全文，右边的六个字段就是从这段文字里提取的。'
  }, [canToggle, mode, hasOriginal, kind, meta.filePages])
  // 空白模板、扫描不清、格式怪异，都可能读不出数字。
  // 不说清就变成「识别错了」——用户以为是产品算错，其实是合同里没有或没读到。
  const missing = [
    meta.rent ? '' : '月租',
    meta.deposit ? '' : '押金',
    meta.months ? '' : '租期',
  ].filter(Boolean)

  return (
    <section className="task">
      <div className="task-inner">
        <div className="grid-confirm">
          <div className="preview">
            <div className="preview-hd">
              <span>{heading}</span>
              <span className="tag line">{meta.fileKind || '文本'}</span>
              <span className="sp" />
              {canToggle ? (
                <div className="seg">
                  <button className={mode === 'paper' ? 'on' : ''} type="button" onClick={() => setMode('paper')}>
                    照片
                  </button>
                  <button className={mode === 'text' ? 'on' : ''} type="button" onClick={() => setMode('text')}>
                    识别文字
                  </button>
                </div>
              ) : null}
            </div>

            <PaperPreview
              kind={kind}
              file={file}
              text={text}
              structure={structure}
              pageCount={meta.filePages}
              mode={activeMode}
            />

            <div className="preview-note">{note}</div>
          </div>

          <div>
            <div className="panel">
              <div className="panel-hd">
                <span className="t">基础信息</span>
                <span className="s">已从合同自动读取，读错了直接改</span>
              </div>
              <div className="panel-bd">
                <div className="field-row">
                  <label className="field">
                    <span className="k">类型</span>
                    <select value={meta.type} onChange={(event) => onChangeMeta({ type: event.target.value })}>
                      {optionsWith(meta.type, TYPES).map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="k">城市</span>
                    <select value={meta.city} onChange={(event) => onChangeMeta({ city: event.target.value })}>
                      {optionsWith(meta.city, CITIES).map((city) => (
                        <option key={city}>{city}</option>
                      ))}
                    </select>
                  </label>
                  <label className={meta.rent ? 'field' : 'field needs-value'}>
                    <span className="k">月租</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={meta.rent}
                      onChange={(event) => onChangeMeta({ rent: Number(event.target.value) || 0 })}
                    />
                    <span className="unit">元</span>
                  </label>
                  <label className={meta.months ? 'field' : 'field needs-value'}>
                    <span className="k">租期</span>
                    <input
                      type="number"
                      min="1"
                      value={meta.months}
                      onChange={(event) => onChangeMeta({ months: Number(event.target.value) || 0 })}
                    />
                    <span className="unit">个月</span>
                  </label>
                  <label className={meta.deposit ? 'field' : 'field needs-value'}>
                    <span className="k">押金</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={meta.deposit}
                      onChange={(event) => onChangeMeta({ deposit: Number(event.target.value) || 0 })}
                    />
                    <span className="unit">元</span>
                  </label>
                  <label className="field">
                    <span className="k">审查尺度</span>
                    <select value={meta.scale} onChange={(event) => onChangeMeta({ scale: event.target.value })}>
                      {REVIEW_SCALES.map((scale) => (
                        <option key={scale.value} value={scale.label}>
                          {scale.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {missing.length ? (
                  <div className="hint hint-warn" style={{ marginTop: 8 }}>
                    {missing.join('、')}没读出来，请手动填 —— 后面算金额要用到。
                  </div>
                ) : (
                  <div className="hint" style={{ marginTop: 8 }}>
                    六个字段都读到了，可以对照左边原文核一遍；读错了直接在上面改。
                  </div>
                )}
                <div className="hint" style={{ marginTop: 6 }}>
                  城市只用来提示地区差异（如押金监管、水电价），不作为结论依据。
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-hd">
                <span className="t">这次会检查什么</span>
                <span className="sp" />
                <span className="tag line">9 类 · 逐句</span>
              </div>
              <div className="panel-bd" style={{ paddingTop: 8 }}>
                <div className="scope-grid">
                  {REVIEW_SCOPE.map((item) => (
                    <span key={item}>· {item}</span>
                  ))}
                  <span style={{ color: 'var(--ink4)' }}>（合同外事项单列，不混进风险）</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="task-foot">
          <button className="btn" type="button" onClick={onBack}>
            ← 上一步
          </button>
          <span className="hint">点击开始后约 30 秒出结果，可以先用「看已完成的部分」。</span>
          <button className="btn primary" type="button" onClick={onNext}>
            开始审查 →
          </button>
        </div>
      </div>
    </section>
  )
}
