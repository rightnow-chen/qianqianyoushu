import { AlertTriangle, X } from 'lucide-react'
import { LEGAL_DISCLAIMER } from '../constants/legal.js'
import { proposalValueCards, riskGuideSteps } from '../data/proposalContent.jsx'

export default function RiskGuideModal({ closeRef, onClose, onJump }) {
  return (
    <div className="guide-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="risk-guide-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="guide-header">
          <div>
            <p className="runtime-kicker">Flow Tutorial</p>
            <h2 id="risk-guide-title">签前有数合同审查流程</h2>
            <p>审合同、协商条款、修改后复查，逐项处理合同问题。</p>
          </div>
          <button
            className="guide-close"
            type="button"
            aria-label="关闭合同审查流程教程"
            ref={closeRef}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="guide-body">
          <div className="guide-note" aria-label="给签前有数用户的话">
            <div>
              <span>给正在使用签前有数的你</span>
              <h3>先把眼前这一步看清楚</h3>
            </div>
            <p>
              不用一次弄懂所有租房规则。你只需要放入合同，系统会把风险、成本和待确认问题拆成能执行的下一步。重要决定仍以合同原文、书面沟通和当地政策为准，签前有数帮你先看清、先沟通。
            </p>
          </div>

          <div className="guide-step-grid">
            {riskGuideSteps.map((item, index) => {
              const StepIcon = item.icon
              const entry = proposalValueCards[index]
              const EntryIcon = entry.icon
              return (
                <article className="guide-step" key={item.title}>
                  <div className="guide-step-icon">
                    <StepIcon size={19} aria-hidden="true" />
                  </div>
                  <div className="guide-step-body">
                    <div>
                      <span>{item.step}</span>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                      <strong>{item.output}</strong>
                    </div>
                    <button className="guide-step-action" type="button" onClick={() => onJump(entry.tab)}>
                      <EntryIcon size={16} aria-hidden="true" />
                      <span>{entry.title}</span>
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          <p className="guide-legal-line" role="note" aria-label="签前有数免责声明">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{LEGAL_DISCLAIMER}</span>
          </p>
        </div>
      </section>
    </div>
  )
}
