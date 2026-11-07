import { useRef, useState } from 'react'
import { Camera, Check, FolderOpen } from 'lucide-react'

const FACTS = [
  {
    title: '完全免费',
    sub: '没有次数限制',
    icon: <path d="M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6" />,
  },
  {
    title: '上传即脱敏',
    sub: '证件号自动打码',
    icon: (
      <>
        <path d="M12 3l7 3v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z" />
        <path d="M9.2 12l2 2 3.6-3.8" />
      </>
    ),
  },
  {
    title: '3 分钟出结果',
    sub: '9 条逐句标注',
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
  },
]

export default function LandingScreen({ onFile, onDemo, onPaste, onCamera }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  const handleFiles = (files) => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    <section className="landing">
      <div className="landing-inner">
        <div className="eyebrow">签约之前 · 先看清楚</div>
        <h1 className="h1">
          别盲目签约。
          <br />
          签之前，先看清这份合同<em>会坑你多少钱</em>。
        </h1>
        <div className="landing-sub">
          上传房东或中介发来的合同，<b>3 分钟</b>告诉你哪几条必须改、能改成什么，以及怎么跟他开口。
          不用注册，不保存原文。
        </div>

        <div className="facts">
          {FACTS.map((fact) => (
            <div className="fact" key={fact.title}>
              <div className="fact-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  {fact.icon}
                </svg>
              </div>
              <div>
                <div className="fact-t1">{fact.title}</div>
                <div className="fact-t2">{fact.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDrag(false)
            handleFiles(event.dataTransfer.files)
          }}
        >
          <div className="dz-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
              <path d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16" />
            </svg>
          </div>
          <div className="dz-title">把合同文件拖到这里</div>
          <div className="dz-sub">支持 PDF / Word / 图片 · 单份不超过 20 页 · 扫描件会自动 OCR</div>
          <div className="dz-btns">
            <button className="btn primary" type="button" onClick={() => inputRef.current?.click()}>
              <FolderOpen size={14} aria-hidden="true" />
              选择文件
            </button>
            <button className="btn" type="button" onClick={onCamera}>
              <Camera size={14} aria-hidden="true" />
              拍照上传
            </button>
          </div>
          <div className="dz-alt">
            微信里收到的合同，也可以直接 <button type="button" onClick={onPaste}>粘贴文字</button>
            　·　<button type="button" onClick={onDemo}>用示例合同试一下 →</button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            hidden
            onChange={(event) => {
              handleFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </div>

        <div className="safebar">
          <span>
            <Check size={11} aria-hidden="true" />
            身份证号自动打码
          </span>
          <span>
            <Check size={11} aria-hidden="true" />
            手机号、银行卡号不进模型
          </span>
          <span>
            <Check size={11} aria-hidden="true" />
            关闭页面即清除
          </span>
        </div>

        <div className="landing-foot">
          没有电子版也可以拍照 —— 但照片越清楚识别越准，拍到反光、缺角会要求重拍。
          <br />
          本结果由 AI 生成，不构成法律意见，可能存在遗漏 · 是否签约由你决定
        </div>
        <div className="coverage">
          <b>覆盖 9 类条款</b>
          <span>押金 · 退租 · 维修 · 涨租 · 水电 · 检查 · 转租 · 宠物 · 附件</span>
        </div>
      </div>
    </section>
  )
}
