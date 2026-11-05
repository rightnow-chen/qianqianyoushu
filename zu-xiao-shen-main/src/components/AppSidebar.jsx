import {
  Bot,
  FileText,
  Handshake,
  ShieldCheck,
} from 'lucide-react'

export default function AppSidebar({
  activeTab,
  acceptedCount = 0,
  findingsCount = 0,
  localOnlyMode,
  onClearAllData,
  onExportAllData,
  onSwitchModule,
  onToggleLocalOnly,
  pendingFindingsCount = 0,
}) {
  const primaryNavItems = [
    { key: 'contract', label: '审合同', Icon: FileText },
    { key: 'negotiation', label: '谈判台', Icon: Handshake },
  ]
  const utilityNavItems = [
    { key: 'ai', label: 'AI 助手', Icon: Bot },
  ]
  const contractStatus = findingsCount === 0
    ? '尚未完成审查'
    : pendingFindingsCount > 0
      ? `${pendingFindingsCount} 个待处理问题`
      : acceptedCount > 0
        ? '风险已全部落稿'
        : '风险已全部查看'

  const renderNavItem = ({ key, label, Icon }) => (
    <button
      className={activeTab === key ? 'active' : ''}
      key={key}
      type="button"
      aria-current={activeTab === key ? 'page' : undefined}
      onClick={() => onSwitchModule(key)}
    >
      <Icon size={18} aria-hidden="true" />
      {label}
    </button>
  )

  return (
    <aside className="sidebar" aria-label="签前有数导航">
      <button className="brand" type="button" onClick={() => onSwitchModule('proposal')}>
        <div className="brand-mark">
          <ShieldCheck size={26} aria-hidden="true" />
        </div>
        <div className="brand-copy">
          <strong>签前有数</strong>
          <span>租房合同审查助手</span>
        </div>
      </button>

      <nav className="nav-list" aria-label="签约流程与工具">
        <div className="nav-section">
          <span className="nav-section-label">签约流程</span>
          {primaryNavItems.map(renderNavItem)}
        </div>
        <div className="nav-divider" aria-hidden="true" />
        <div className="nav-section">
          <span className="nav-section-label">工具</span>
          {utilityNavItems.map(renderNavItem)}
        </div>
      </nav>
      <div className="sidebar-context-status" aria-live="polite">
        <span>当前合同</span>
        <strong>{contractStatus}</strong>
      </div>
      <div className="sidebar-data-tools" aria-label="本地数据与隐私设置">
        <label className="privacy-toggle">
          <input type="checkbox" checked={localOnlyMode} onChange={(event) => onToggleLocalOnly(event.target.checked)} />
          <span>仅本地分析</span>
        </label>
        <small>{localOnlyMode ? '合同与对话不会发送到远端 AI；图片 OCR 使用本地浏览器处理。' : '开启后可避免合同正文和对话离开当前设备。'}</small>
        <div className="sidebar-data-actions">
          <button type="button" onClick={onExportAllData}>导出全部本地数据</button>
          <button type="button" onClick={onClearAllData}>清除全部数据</button>
        </div>
      </div>
    </aside>
  )
}
