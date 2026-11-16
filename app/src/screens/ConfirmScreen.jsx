import { useState } from 'react'
import { REVIEW_SCOPE, REVIEW_SCALES } from '../features/riskModel.js'
import { previewKindOf } from '../features/filePreview.js'
import { CITY_PLACEHOLDER, PROVINCES, citiesOf, composeCity, isKnownProvince, parseCity } from '../features/cities.js'
import PaperPreview from './confirm/PaperPreview.jsx'

const TYPES = ['房屋租赁合同', '公寓租赁合同', '合租协议', '疑似非租赁合同']

/** 允许下拉里出现「合同里读到、但不在固定列表」的类型，否则 select 会显示空白。 */
function optionsWith(current, options) {
  if (!current || options.includes(current)) return options
  return [current, ...options]
}

export default function ConfirmScreen({ meta, onChangeMeta, onNext, onBack, file, text, structure }) {
  const [mode, setMode] = useState('paper')
  const kind = previewKindOf({ fileName: meta.fileName, source: meta.source, mime: file?.type })
  // 只有拍照才有「识别」这回事：PDF / Word / TXT 的文字本来就是文件自带的，
  // 给它们放一个「识别全文」只会让人以为是识别出来的，还多一层没必要的点击。
  const canToggle = kind === 'image'
  const heading = kind === 'image' ? '合同照片' : kind === 'pdf' || kind === 'word' ? '合同原件' : '原文预览'
  // 不支持切换的来源一律按原件渲染，mode 残值不影响显示
  const activeMode = canToggle ? mode : 'paper'
  // 城市存成「省 · 市」一个字符串，这里拆成两级下拉回显。
  // 旧版本存过区级值（北京 · 朝阳），parseCity 拆出来的省在列表里找不到，
  // 就让省下拉落回「待确认」，而不是把整格清空。
  const picked = parseCity(meta.city)
  const province = isKnownProvince(picked.province) ? picked.province : ''
  const city = province ? picked.city : ''
  const cityOptions = citiesOf(province)
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
                  <label className="field field-city">
                    <span className="k">城市</span>
                    <select
                      value={province}
                      onChange={(event) => onChangeMeta({ city: composeCity(event.target.value, '') })}
                    >
                      <option value="">{CITY_PLACEHOLDER}</option>
                      {PROVINCES.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {cityOptions.length > 0 && (
                      <select
                        value={city}
                        onChange={(event) => onChangeMeta({ city: composeCity(province, event.target.value) })}
                      >
                        <option value="">{province}全省</option>
                        {cityOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    )}
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
                ) : null}
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
          <span className="hint">点击开始后约 30 秒出结果，中途不要关掉这个页面。</span>
          <button className="btn primary" type="button" onClick={onNext}>
            开始审查 →
          </button>
        </div>
      </div>
    </section>
  )
}
