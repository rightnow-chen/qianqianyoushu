import { Check } from 'lucide-react'

const STEPS = [
  { key: 'upload', label: '上传合同' },
  { key: 'confirm', label: '确认信息' },
  { key: 'work', label: '看结果与动作' },
]

// 屏幕 → 当前步骤序号（1 起）。首页不显示进度。
const SCREEN_STEP = {
  upload: 1,
  confirm: 2,
  analyzing: 3,
  work: 3,
}

export default function TopBar({ screen, onPrivacy }) {
  const current = SCREEN_STEP[screen] || 0
  const showSteps = screen !== 'landing'

  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo" aria-hidden="true">
          签
        </div>
        <div className="bname">签前有数</div>
        <div className="bsub">房屋租赁合同 · AI 审查</div>
      </div>

      {showSteps && (
        <nav className="stepbar" aria-label="审查进度">
          {STEPS.map((step, index) => {
            const no = index + 1
            const state = no < current ? 'done' : no === current ? 'on' : ''
            return (
              <span key={step.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className={`step ${state}`}>
                  <i>{no < current ? <Check size={10} aria-hidden="true" /> : no}</i>
                  {step.label}
                </span>
                {index < STEPS.length - 1 && <span className="step-sep" />}
              </span>
            )
          })}
        </nav>
      )}

      <div className="topbar-right">
        <button className="link-btn" type="button" onClick={onPrivacy}>
          隐私说明
        </button>
      </div>
    </header>
  )
}
