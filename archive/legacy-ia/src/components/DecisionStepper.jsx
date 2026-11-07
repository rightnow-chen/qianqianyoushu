import { Check } from 'lucide-react'

// 审查后进入谈判，修改后返回审查。
const STEPS = [
  { key: 'contract', label: '审合同' },
  { key: 'negotiation', label: '谈判台' },
]

export default function DecisionStepper({
  currentTab,
  contractFilled,
  negotiationFilled,
  onStepClick,
}) {
  const filled = {
    contract: contractFilled,
    negotiation: negotiationFilled,
  }

  return (
    <nav className="decision-stepper" aria-label="合同审查与谈判进度">
      {STEPS.map((step, index) => {
        const isFilled = filled[step.key]
        const isActive = currentTab === step.key
        const isDone = isFilled && !isActive
        return (
          <button
            className={`stepper-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
            key={step.key}
            type="button"
            onClick={() => onStepClick(step.key)}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className="stepper-dot">
              {isDone ? <Check size={13} aria-hidden="true" /> : index + 1}
            </span>
            <span className="stepper-label">{step.label}</span>
            {index < STEPS.length - 1 && <span className="stepper-line" aria-hidden="true" />}
          </button>
        )
      })}
    </nav>
  )
}
