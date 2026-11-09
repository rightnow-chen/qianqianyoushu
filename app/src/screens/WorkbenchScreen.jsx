import { useState } from 'react'
import { Download } from 'lucide-react'
import ContractPane from './workbench/ContractPane.jsx'
import OverviewTab from './workbench/OverviewTab.jsx'
import RiskTab from './workbench/RiskTab.jsx'
import FixTab from './workbench/FixTab.jsx'
import ScriptTab from './workbench/ScriptTab.jsx'
import ChecklistTab from './workbench/ChecklistTab.jsx'

const TABS = [
  { key: 'ov', label: '概览' },
  { key: 'risk', label: '风险' },
  { key: 'fix', label: '修改' },
  { key: 'say', label: '话术' },
  { key: 'check', label: '待核实' },
]

const PRIMARY = {
  ov: '开始逐条看',
  risk: '去改必须改的 3 条',
  fix: '去跟房东说',
  say: '核对待核实 8 件',
  check: '回到概览',
}

export default function WorkbenchScreen({
  meta,
  pages,
  file,
  risks,
  amounts,
  counts,
  worst,
  verdict,
  checks,
  tab,
  degradation,
  isDemo,
  onTab,
  activeId,
  onActive,
  locateSignal,
  done,
  accepted,
  edited,
  onDone,
  onAccept,
  onSaveEdit,
  onToggleCheck,
  onReupload,
  onExport,
  onToast,
  onCopy,
  onTrack,
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  const doneCount = Object.values(done).filter(Boolean).length
  const pendingChecks = checks.filter((item) => !item.done).length
  const mustRisks = risks.filter((risk) => risk.level === 'must')
  const nextMust = mustRisks.find((risk) => !done[risk.id])

  const handlePrimary = () => {
    if (tab === 'ov') onTab('risk')
    else if (tab === 'risk') onTab('fix')
    else if (tab === 'fix') onTab('say')
    else if (tab === 'say') onTab('check')
    else onTab('ov')
  }

  const openFix = (riskId) => {
    onActive(riskId)
    onTab('fix')
  }

  return (
    <section className="work">
      <div className="filebar">
        <span className="fi">{meta.fileKind}</span>
        <span className="fn">{meta.fileName}</span>
        {isDemo && <span className="tag demo">演示数据</span>}
        <div className="filebar-acts">
          <button className="btn sm" type="button" onClick={onReupload}>
            重新上传
          </button>
          <div className="export-wrap">
            <button className="btn sm primary" type="button" onClick={() => setMenuOpen((prev) => !prev)}>
              <Download size={12} aria-hidden="true" />
              导出
            </button>
            {menuOpen && (
              <div className="menu">
                <button className="menu-item" type="button" onClick={() => onExport('report')}>
                  导出审查报告
                  <span className="k">PDF · 含脱敏原文</span>
                </button>
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onExport('revision')
                  }}
                >
                  导出合同原文（修订版）
                  <span className="k">docx · 已采纳的修改标红</span>
                </button>
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onExport('comment')
                  }}
                >
                  导出合同原文（批注版）
                  <span className="k">docx · Word 批注挂在原句</span>
                </button>
                <button className="menu-item" type="button" onClick={() => onExport('text')}>
                  只复制文字
                  <span className="k">3 条建议 + 3 段话术</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="work-body">
        <ContractPane
          pages={pages}
          risks={risks}
          file={file}
          meta={meta}
          activeId={activeId}
          locateSignal={locateSignal}
          onPickRisk={(riskId) => {
            onActive(riskId)
            onTab('risk')
          }}
        />

        <main className="workspace">
          <div className="tabs" role="tablist">
            {TABS.map((item) => {
              const badge =
                item.key === 'risk' ? risks.length : item.key === 'fix' ? counts.must : item.key === 'check' ? pendingChecks : null
              return (
                <button
                  className={`tab ${tab === item.key ? 'on' : ''}`}
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.key}
                  onClick={() => {
                    setMenuOpen(false)
                    onTab(item.key)
                  }}
                >
                  {item.label}
                  {badge !== null && <span className={`n ${item.key === 'risk' ? 'must' : ''}`}>{badge}</span>}
                </button>
              )
            })}
          </div>

          {tab === 'ov' && (
            <OverviewTab
              risks={risks}
              counts={counts}
              worst={worst}
              verdict={verdict}
              checks={checks}
              degradation={degradation}
              isDemo={isDemo}
              onTab={onTab}
              onOpenFix={openFix}
              onReupload={onReupload}
            />
          )}

          {tab === 'risk' && (
            <RiskTab
              risks={risks}
              amounts={amounts}
              done={done}
              meta={meta}
              onTrack={onTrack}
              onOpenFix={openFix}
              onTab={onTab}
              onLocate={(riskId) => {
                onActive(riskId)
              }}
              onDone={onDone}
            />
          )}

          {tab === 'fix' && (
            <FixTab
              key={`fix-${activeId}`}
              risks={risks}
              activeId={activeId}
              edited={edited}
              accepted={accepted}
              done={done}
              onSelect={onActive}
              onSaveEdit={onSaveEdit}
              onAccept={onAccept}
              onDone={onDone}
              onLocate={(riskId) => onActive(riskId)}
              onTab={onTab}
              onToast={onToast}
            />
          )}

          {tab === 'say' && (
            <ScriptTab
              key={`say-${activeId}`}
              risks={risks}
              amounts={amounts}
              activeId={activeId}
              onSelect={onActive}
              onTab={onTab}
              onToast={onToast}
              onCopy={onCopy}
            />
          )}

          {tab === 'check' && (
            <ChecklistTab checks={checks} onToggle={onToggleCheck} onToast={onToast} onCopy={onCopy} />
          )}

          <div className="actionbar">
            <div className="ab-counts">
              <span className="c must">
                <i />
                必须改 <b>{counts.must}</b>
              </span>
              <span className="c check">
                <i />
                建议确认 <b>{counts.check}</b>
              </span>
              <span className="c note">
                <i />
                仅提醒 <b>{counts.note}</b>
              </span>
            </div>
            <div className="ab-progress">
              <span>
                已处理 {doneCount} / {risks.length}
              </span>
              <span className="ab-bar">
                <i style={{ width: `${risks.length ? (doneCount / risks.length) * 100 : 0}%` }} />
              </span>
            </div>
            <span className="sp" />
            <span className="disc">AI 生成，可能存在遗漏 · 是否签约由你决定 · 不保存原文</span>
            <button
              className="btn sm primary"
              type="button"
              onClick={() => {
                if (tab === 'risk' && nextMust) openFix(nextMust.id)
                else handlePrimary()
              }}
            >
              {tab === 'risk' && nextMust ? `改下一条：${nextMust.location.article ? `第 ${nextMust.location.article} 条` : nextMust.cat}` : PRIMARY[tab]}
            </button>
          </div>
        </main>
      </div>
    </section>
  )
}
