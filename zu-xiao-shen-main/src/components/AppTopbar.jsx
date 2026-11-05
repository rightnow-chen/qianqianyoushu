import { RotateCcw } from 'lucide-react'
import { getTopbarCopy } from '../features/topbarUi.js'

export default function AppTopbar({
  activeTab,
  findingsCount,
  revisionItemsCount,
  verdictTitle,
  onBackToDemoRoute,
}) {
  const topbarCopy = getTopbarCopy(activeTab, { findingsCount, revisionItemsCount, verdictTitle })
  const isReview = activeTab === 'needs' || activeTab === 'contract' || activeTab === 'negotiation' || activeTab === 'verdict'
  const isProposal = activeTab === 'proposal'

  // 首页：新 Hero 已承载标题与定位，不再渲染冗余的顶部大标题区
  if (isProposal) {
    return null
  }

  if (isReview) {
    return (
      <header className="topbar topbar-compact">
        <div className="hero-copy">
          <p className="section-kicker">{topbarCopy.kicker}</p>
          <h1 className="compact-title">{topbarCopy.title}</h1>
          <p className="hero-subtitle">{topbarCopy.subtitle}</p>
        </div>
        <div className="topbar-actions">
          <button className="demo-route-return-button" type="button" onClick={onBackToDemoRoute}>
            <RotateCcw size={15} aria-hidden="true" />
            <span>返回演示路线</span>
          </button>
          <div className="module-status-card" aria-label="当前模块状态">
            <span>{topbarCopy.stage}</span>
            <strong>{topbarCopy.state}</strong>
            <p>{topbarCopy.action}</p>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="topbar">
      <div className="hero-copy">
        <p className="section-kicker">{topbarCopy.kicker}</p>
        <h1>{topbarCopy.title}</h1>
        <p className="hero-subtitle">{topbarCopy.subtitle}</p>
      </div>
      <div className="topbar-actions">
        {activeTab !== 'proposal' && (
          <button className="demo-route-return-button" type="button" onClick={onBackToDemoRoute}>
            <RotateCcw size={15} aria-hidden="true" />
            <span>返回演示路线</span>
          </button>
        )}
        <div className="module-status-card" aria-label="当前模块状态">
          <span>{topbarCopy.stage}</span>
          <strong>{topbarCopy.state}</strong>
          <p>{topbarCopy.action}</p>
        </div>
      </div>
    </header>
  )
}
