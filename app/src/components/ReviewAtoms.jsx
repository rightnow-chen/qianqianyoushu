import { useMemo, useState } from 'react'
import { Check, ChevronDown, ExternalLink, MessageCircle } from 'lucide-react'
import { buildContractBlocks, buildRiskSegments } from '../utils/contractBlocks.js'
import { getFindingPrimaryAction } from '../features/reviewUi.js'

const findingTypeLabels = {
  explicit_disadvantage: '明确不利',
  missing_term: '信息缺失',
  needs_review: '待核对',
}

function renderPieces(pieces, opts) {
  const { onFindingClick, activeFindingId, acceptedIds } = opts || {}
  return pieces.map((piece, index) => {
    if (!piece.risk) return <span key={index}>{piece.text}</span>

    const findingId = piece.findingId
    const accepted = findingId ? acceptedIds?.has(findingId) : false
    const replacement = piece.replacement

    // 已采纳：原文显示删除线 + 替换句（Word 修订式 diff）；无替换句的显示已处理样式
    if (accepted) {
      if (replacement) {
        return (
          <span className="mark-replaced" key={index} data-finding-id={findingId}>
            <span className="mark-del">{piece.text}</span>
            <span className="mark-ins">{replacement}</span>
          </span>
        )
      }
      return (
        <mark className="risk-mark accepted" key={index} data-finding-id={findingId}>
          {piece.text}
        </mark>
      )
    }

    return (
      <mark
        className={`risk-mark ${piece.risk}${findingId ? ' clickable' : ''}${activeFindingId === findingId ? ' active' : ''}`}
        data-finding-id={findingId || undefined}
        key={index}
        title={findingId ? '点击定位到对应风险点' : undefined}
        onClick={findingId && onFindingClick ? () => onFindingClick(findingId) : undefined}
      >
        {piece.text}
      </mark>
    )
  })
}

export function HighlightedContract({ text, findings, acceptedIds, onFindingClick, activeFindingId }) {
  const blocks = useMemo(() => buildContractBlocks(buildRiskSegments(text, findings)), [findings, text])

  const renderOpts = { onFindingClick, activeFindingId, acceptedIds }

  return (
    <div className="contract-view" aria-label="合同风险高亮预览">
      {blocks.map((block, index) => {
        if (block.type === 'title') {
          return (
            <header className="cv-head" key={`block-${index}`}>
              <h3 className="cv-title">{renderPieces(block.pieces, renderOpts)}</h3>
              {block.no ? <span className="cv-no">{block.no}</span> : null}
            </header>
          )
        }
        if (block.type === 'fields') {
          return (
            <div className="cv-fields" key={`block-${index}`}>
              {block.rows.map((row, rowIndex) => (
                <div className="cv-field" key={`row-${rowIndex}`}>
                  {row.label ? <span className="cv-field-label">{row.label}</span> : null}
                  <span className="cv-field-value">
                    {row.pieces.length ? renderPieces(row.pieces, renderOpts) : <em>待补充</em>}
                  </span>
                </div>
              ))}
            </div>
          )
        }
        if (block.type === 'clause') {
          return (
            <article className="cv-clause" key={`block-${index}`}>
              <span className="cv-clause-badge">{block.marker}</span>
              <div className="cv-clause-main">
                {block.headPieces.length ? (
                  <div className="cv-clause-head">{renderPieces(block.headPieces, renderOpts)}</div>
                ) : null}
                {block.bodyPieces.length ? (
                  <p className="cv-clause-body">{renderPieces(block.bodyPieces, renderOpts)}</p>
                ) : null}
              </div>
            </article>
          )
        }
        if (block.type === 'signature') {
          return (
            <div className="cv-signature" key={`block-${index}`}>
              {block.lines.map((linePieces, lineIndex) => (
                <p key={`sign-${lineIndex}`}>{renderPieces(linePieces, renderOpts)}</p>
              ))}
            </div>
          )
        }
        return (
          <p className="cv-para" key={`block-${index}`}>
            {renderPieces(block.pieces, renderOpts)}
          </p>
        )
      })}
    </div>
  )
}

export function FindingItem({ finding, accepted, onApply, onLocate, active, state, onStateChange, expanded, onToggle, onAskAdvisor }) {
  const Icon = finding.icon
  const [openSection, setOpenSection] = useState(null)
  const toggle = (key) => setOpenSection((current) => (current === key ? null : key))

  // 收缩/展开：传入 onToggle 即为可收缩模式（左文右卡布局下默认收缩，单开手风琴）
  const collapsible = typeof onToggle === 'function'
  const isOpen = !collapsible || Boolean(expanded)

  // 谈判三态：pending（待谈）→ negotiating（谈中/已谈，记结果）→ resolved（已谈妥，可落稿）
  const status = state?.status || 'pending'
  const reaction = state?.reaction || null
  const compromise = state?.compromise || ''

  // 「依据」区仅在能给出具体法条时展示，避免大量重复的兜底文案伤可信度
  // 证据片段已移除：左栏原文高亮 + 定位原文已覆盖该信息
  // 谈判话术已移除：话术生成/语气切换统一收口到「谈判台」，卡片用「问军师」深链过去
  const hasLegal = Boolean(finding.legalLaw) || /第[一二三四五六七八九十百零\d]+条/.test(finding.legalBasis || '')
  const collapsibles = [
    { key: 'law', label: '依据', show: hasLegal },
  ].filter((item) => item.show)
  const primaryAction = getFindingPrimaryAction({ level: finding.level, status })
  const handlePrimaryAction = () => {
    if (primaryAction.kind === 'apply') {
      onApply(finding)
    } else if (primaryAction.kind === 'details') {
      onToggle?.(finding.id)
    } else {
      onAskAdvisor?.(finding.id)
    }
  }

  return (
    <article
      className={`finding ${finding.level} status-${status}${active ? ' active' : ''}${collapsible ? (isOpen ? ' expanded' : ' collapsed') : ''}`}
      id={`finding-${finding.id}`}
      data-finding-id={finding.id}
    >
      <button
        aria-expanded={collapsible ? isOpen : undefined}
        className="finding-summary"
        type="button"
        onClick={collapsible ? () => onToggle(finding.id) : undefined}
      >
        <span className="finding-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
        <span className="finding-summary-text">
          <span className="finding-title">{finding.title}</span>
          <span className="finding-meta">
            {finding.dimension}
            {finding.findingType && ` · ${findingTypeLabels[finding.findingType] || '待核对'}`}
          </span>
          {finding.evidence && <span className="finding-evidence-preview">证据：{finding.evidence}</span>}
        </span>
        {status !== 'pending' && (
          <span className={`state-chip ${status}`}>{status === 'negotiating' ? '谈中' : '已谈妥'}</span>
        )}
        <span className={`risk-badge ${finding.level}`}>{finding.levelText}</span>
        {collapsible && <ChevronDown className="finding-chevron" size={16} aria-hidden="true" />}
      </button>

      <div className="finding-primary-action-row">
        <button
          className={`finding-primary-action ${primaryAction.kind === 'apply' ? 'is-apply' : ''}`}
          type="button"
          onClick={handlePrimaryAction}
          disabled={primaryAction.kind === 'apply' && accepted}
        >
          {primaryAction.kind === 'apply' ? <Check size={15} aria-hidden="true" /> : <MessageCircle size={15} aria-hidden="true" />}
          {accepted ? '已写入合同' : primaryAction.label}
        </button>
        {status === 'resolved' && !accepted && <span className="finding-primary-hint">谈妥后可写入修订合同</span>}
      </div>

      {isOpen && (
        <>
          {onLocate ? (
            <button className="finding-locate" type="button" onClick={() => onLocate(finding.id)}>
              定位原文
            </button>
          ) : null}

          {finding.verificationStatus && (
            <div className={`finding-evidence-status ${finding.verificationStatus}`}>
              <strong>证据</strong>
              <span>
                {finding.verificationStatus === 'verified' ? '已核验' : '部分核验'}
                {finding.evidenceLocation?.line ? ` · 第 ${finding.evidenceLocation.line} 行` : ''}
                {finding.evidenceLocation?.clause ? ` · ${finding.evidenceLocation.clause}` : ''}
              </span>
            </div>
          )}

          {finding.relatedEvidence?.length > 0 && (
            <div className="finding-related-evidence">
              <strong>关联条款</strong>
              {finding.relatedEvidence.map((item, index) => (
                <div key={`${item.location?.line || 'line'}-${index}`}>
                  <span>{item.role}：</span>{item.text}
                </div>
              ))}
            </div>
          )}

          <p>{finding.explain}</p>

          <div className="suggestion">
            <span>建议</span>
            {finding.suggestion}
          </div>

      {/* 谈判状态机：待谈 → 谈中(记结果) → 已谈妥(落稿) */}
      <div className="negotiation-flow">
        <div className="negotiation-state-tabs" role="tablist" aria-label="谈判进度">
          <button
            className={`state-tab ${status === 'pending' ? 'active' : ''}`}
            type="button"
            onClick={() => onStateChange(finding.id, { status: 'pending', reaction: null, compromise: '' })}
          >
            待谈
          </button>
          <button
            className={`state-tab ${status === 'negotiating' ? 'active' : ''}`}
            type="button"
            onClick={() => onStateChange(finding.id, { status: 'negotiating', reaction: reaction || 'agree', compromise })}
          >
            谈中
          </button>
          <button
            className={`state-tab ${status === 'resolved' ? 'active' : ''}`}
            type="button"
            onClick={() => onStateChange(finding.id, { status: 'resolved', reaction: reaction || 'agree', compromise })}
          >
            已谈妥
          </button>
        </div>

        {status === 'negotiating' && (
          <div className="negotiation-result">
            <div className="reaction-row" role="radiogroup" aria-label="房东反应">
              {[
                { key: 'agree', label: '同意' },
                { key: 'compromise', label: '折中' },
                { key: 'reject', label: '拒绝' },
              ].map(({ key, label }) => (
                <button
                  className={`reaction-chip ${reaction === key ? 'active' : ''}`}
                  key={key}
                  type="button"
                  onClick={() => onStateChange(finding.id, { status: 'negotiating', reaction: key, compromise })}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="compromise-input"
              type="text"
              value={compromise}
              placeholder="记录折中结果，如：押金退 30 天谈成 15 天"
              onChange={(e) => onStateChange(finding.id, { status: 'negotiating', reaction, compromise: e.target.value })}
            />
          </div>
        )}

        {status === 'resolved' && compromise && (
          <div className="negotiation-result resolved-note">
            <span>谈妥结果</span>
            {compromise}
          </div>
        )}
      </div>

      {collapsibles.length > 0 && (
        <div className="finding-collapsibles">
          {collapsibles.map(({ key, label }) => (
            <button
              className={`finding-toggle ${openSection === key ? 'open' : ''}`}
              key={key}
              type="button"
              onClick={() => toggle(key)}
            >
              {label}
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {openSection === 'law' && hasLegal && (
        <div className="finding-law">
          <strong>依据</strong>
          <span>{finding.legalBasis}</span>
          {finding.legalLaw && (
            <div className="finding-law-meta">
              <em>{finding.legalLaw}</em>
              {finding.legalUrl && (
                <a href={finding.legalUrl} target="_blank" rel="noreferrer">
                  法条原文
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>
      )}

        </>
      )}
    </article>
  )
}
