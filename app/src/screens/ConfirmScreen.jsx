import { useState } from 'react'
import { REVIEW_SCOPE, REVIEW_SCALES } from '../features/riskModel.js'

const TYPES = ['房屋租赁合同', '公寓租赁合同', '合租协议']
const CITIES = ['北京 · 朝阳', '北京 · 海淀', '上海 · 浦东', '广州 · 天河', '深圳 · 南山']

export default function ConfirmScreen({ meta, onChangeMeta, onNext, onBack }) {
  const [mode, setMode] = useState('paper')

  return (
    <section className="task">
      <div className="task-inner">
        <div className="crumb">
          <span>新建审查</span>
          <span className="dot" />
          <span>上传与质检</span>
          <span className="dot" />
          <b>确认基础信息</b>
          <span className="dot" />
          <span>看结果</span>
        </div>

        <div className="grid-confirm">
          <div className="preview">
            <div className="preview-hd">
              <span>原文预览</span>
              <span className="tag line">第 1 页 / {meta.filePages}</span>
              <span className="sp" />
              <div className="seg">
                <button
                  className={mode === 'paper' ? 'on' : ''}
                  type="button"
                  onClick={() => setMode('paper')}
                >
                  原文
                </button>
                <button
                  className={mode === 'text' ? 'on' : ''}
                  type="button"
                  onClick={() => setMode('text')}
                >
                  识别全文
                </button>
              </div>
            </div>

            {mode === 'paper' ? (
              <div className="mini-paper">
                <div className="mp-no">合同编号：CY-2026-1102</div>
                <div className="mp-title">房屋租赁合同</div>
                <p>出租人（甲方）：李××　　身份证号：1101**********1234</p>
                <p>承租人（乙方）：王××　　身份证号：1101**********5678</p>
                <p>
                  根据《中华人民共和国民法典》及有关法律、法规的规定，甲乙双方在平等、自愿、协商一致的基础上，就房屋租赁的有关事宜达成如下协议：
                </p>
                <div className="mp-clause">第一条　房屋基本情况</div>
                <p>
                  甲方将坐落于北京市朝阳区建国路 88 号院 3 号楼 2 单元 1102 室的房屋出租给乙方居住使用，建筑面积 62 平方米。
                </p>
                <div className="mp-clause">第二条　租赁期限</div>
                <p>租赁期限自 2026 年 12 月 1 日起至 2027 年 11 月 30 日止，共计 12 个月。</p>
                <div className="mp-clause">第三条　租金及支付方式</div>
                <p>1. 房屋月租金为人民币 4,500 元（大写：肆仟伍佰元整）。</p>
                <p>2. 租金支付方式为押三付一，乙方应于每月 5 日前支付当月租金。</p>
                <p>3. 乙方逾期支付租金的，每逾期一日，应按月租金的 1% 支付滞纳金。</p>
                <p>4. 租赁期内，甲方有权根据市场行情上调租金，每年上调幅度最高不超过 8%。</p>
              </div>
            ) : (
              <div className="ocr-box" style={{ marginTop: 10 }}>
                <div className="ocr-hd">
                  <span>识别全文 · 可直接修改</span>
                  <span className="sp" />
                  <span style={{ color: 'var(--amber)' }}>3 处待核对</span>
                </div>
                <div className="ocr-text" contentEditable suppressContentEditableWarning spellCheck={false}>
                  {`甲方将坐落于北京市朝阳区建国路 88 号院 3 号楼 2 单元 1102 室的房屋出租给乙方居住使用，建筑面积 62 平方米，房屋权属证书号为京（2019）朝阳区不动产权第 30×××× 号。

租赁期限自 2026 年 12 月 1 日起至 2027 年 11 月 30 日止，共计 12 个月。

房屋月租金为人民币 4,500 元（大写：肆仟伍佰元整）。`}
                </div>
                <div className="ocr-tip">黄色处是低置信度字符，改一下就能继续 —— 比重新上传一份快。</div>
              </div>
            )}

            <div className="hint" style={{ marginTop: 8 }}>
              只做「审查范围」的确认，不问押金多少、房东是谁 —— 这些从合同里读，读错了在右侧改。
            </div>
          </div>

          <div>
            <div className="panel">
              <div className="panel-hd">
                <span className="t">基础信息</span>
                <span className="s">已从合同自动读取</span>
              </div>
              <div className="panel-bd">
                <div className="field-row">
                  <label className="field">
                    <span className="k">类型</span>
                    <select value={meta.type} onChange={(event) => onChangeMeta({ type: event.target.value })}>
                      {TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="k">城市</span>
                    <select value={meta.city} onChange={(event) => onChangeMeta({ city: event.target.value })}>
                      {CITIES.map((city) => (
                        <option key={city}>{city}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="k">月租</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={meta.rent}
                      onChange={(event) => onChangeMeta({ rent: Number(event.target.value) || 0 })}
                    />
                    <span style={{ color: 'var(--ink4)', fontSize: 11 }}>元</span>
                  </label>
                  <label className="field">
                    <span className="k">租期</span>
                    <input
                      className="narrow"
                      type="number"
                      min="1"
                      value={meta.months}
                      onChange={(event) => onChangeMeta({ months: Number(event.target.value) || 0 })}
                    />
                    <span style={{ color: 'var(--ink4)', fontSize: 11 }}>个月</span>
                  </label>
                  <label className="field">
                    <span className="k">押金</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={meta.deposit}
                      onChange={(event) => onChangeMeta({ deposit: Number(event.target.value) || 0 })}
                    />
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
                <div className="hint" style={{ marginTop: 8 }}>
                  城市只用来提示地区差异（如北京押金监管、水电价），不作为结论依据。
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

            <div className="tip-panel" style={{ marginTop: 12 }}>
              <b>不用选模板、不用挑规则。</b>审查范围按合同类型自动挂载，你只要确认读到的信息对不对
              —— 参数越多，第一次用的人越容易放弃。
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
