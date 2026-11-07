import { Fragment, useEffect, useMemo } from 'react'
import { Printer, X } from 'lucide-react'
import { buildContractBlocks, buildRiskSegments } from '../utils/contractBlocks.js'
import {
  sortFindingsByPriority,
  splitNegotiationItems,
  STATUS_LABELS,
} from '../utils/artifactContent.js'

/* 出门产物全屏预览：
   - kind='annotated'：批注版合同（A4 纸面，给军师团：原文高亮 + 随文批注）。
   通过浏览器打印 / 存 PDF。 */

function piecesFindingIds(pieces, ids) {
  pieces.forEach((piece) => {
    if (piece.risk && piece.findingId && !ids.includes(piece.findingId)) ids.push(piece.findingId)
  })
}

/* 收集一个块内出现过的风险点 id（按出现顺序），批注框跟在首次命中的段落后面 */
function collectBlockFindingIds(block) {
  const ids = []
  if (!block) return ids
  if (block.pieces) piecesFindingIds(block.pieces, ids)
  if (block.headPieces) piecesFindingIds(block.headPieces, ids)
  if (block.bodyPieces) piecesFindingIds(block.bodyPieces, ids)
  if (block.rows) block.rows.forEach((row) => piecesFindingIds(row.pieces || [], ids))
  if (block.lines) block.lines.forEach((linePieces) => piecesFindingIds(linePieces, ids))
  return ids
}

/* 纸面分段渲染：风险句加高亮底色，首次出现处加编号角标；
   已落稿项显示 删除线原文 + 替换句（Word 修订式），与审阅视图一致。 */
function renderPaperPieces(pieces, ctx) {
  return pieces.map((piece, index) => {
    if (!piece.risk || !piece.findingId) return <span key={index}>{piece.text}</span>

    const no = ctx.badgedIds.has(piece.findingId) ? null : ctx.findingNo.get(piece.findingId)
    if (no != null) ctx.badgedIds.add(piece.findingId)
    const accepted = ctx.acceptedIds.has(piece.findingId)

    if (accepted && piece.replacement) {
      return (
        <span className="ap-fix" key={index}>
          <s>{piece.text}</s>
          <ins>{piece.replacement}</ins>
          {no != null && <sup className="ap-badge ap-badge-ins">{no}</sup>}
        </span>
      )
    }

    return (
      <mark className={`ap-mark ${piece.risk}`} key={index}>
        {piece.text}
        {no != null && <sup className="ap-badge">{no}</sup>}
      </mark>
    )
  })
}

function renderPaperBlock(block, ctx) {
  if (block.type === 'title') {
    return <h4 className="ap-title" key="title">{renderPaperPieces(block.pieces, ctx)}</h4>
  }
  if (block.type === 'fields') {
    return (
      <div className="ap-fields" key="fields">
        {block.rows.map((row, rowIndex) => (
          <p key={rowIndex}>
            {row.label ? <span className="ap-field-label">{row.label}：</span> : null}
            {renderPaperPieces(row.pieces, ctx)}
          </p>
        ))}
      </div>
    )
  }
  if (block.type === 'clause') {
    return (
      <div className="ap-clause" key="clause">
        <span className="ap-clause-marker">{block.marker}</span>
        <div className="ap-clause-main">
          {block.headPieces.length ? (
            <p className="ap-clause-head">{renderPaperPieces(block.headPieces, ctx)}</p>
          ) : null}
          {block.bodyPieces.length ? (
            <p className="ap-clause-body">{renderPaperPieces(block.bodyPieces, ctx)}</p>
          ) : null}
        </div>
      </div>
    )
  }
  if (block.type === 'signature') {
    return (
      <div className="ap-sign" key="signature">
        {block.lines.map((linePieces, lineIndex) => (
          <p key={lineIndex}>{renderPaperPieces(linePieces, ctx)}</p>
        ))}
      </div>
    )
  }
  return <p className="ap-para">{renderPaperPieces(block.pieces, ctx)}</p>
}

function AnnotatedBlock({ block, annotations, ctx, findingNo, negotiationStates, acceptedIds }) {
  return (
    <Fragment>
      {renderPaperBlock(block, ctx)}
      {annotations.map((finding) => {
        const status = negotiationStates[finding.id]?.status || 'pending'
        return (
          <aside className={`anno-block ${finding.level}`} key={finding.id}>
            <header>
              <span className="anno-no">{findingNo.get(finding.id)}</span>
              <strong>{finding.title}</strong>
              <span className={`chip-mini ${finding.level}`}>{finding.levelText}</span>
              <span className="anno-state">{STATUS_LABELS[status]}</span>
            </header>
            {finding.explain ? <p className="anno-explain">{finding.explain}</p> : null}
            {finding.negotiation ? <p className="anno-talk">话术：{finding.negotiation}</p> : null}
            {acceptedIds.has(finding.id) ? <p className="anno-status-note">已写入合同草案</p> : null}
          </aside>
        )
      })}
    </Fragment>
  )
}

export default function ArtifactPreview({
  kind,
  onClose,
  text,
  findings,
  acceptedIds,
  negotiationStates,
  summary,
}) {
  const open = kind === 'annotated'

  useEffect(() => {
    if (!open) return undefined
    document.body.classList.add('artifact-printing')
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('artifact-printing')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  const { todo, done } = useMemo(
    () => splitNegotiationItems(findings, acceptedIds, negotiationStates),
    [findings, acceptedIds, negotiationStates],
  )

  const findingNo = useMemo(() => {
    const map = new Map()
    sortFindingsByPriority(findings).forEach((finding, index) => map.set(finding.id, index + 1))
    return map
  }, [findings])

  const findingById = useMemo(() => new Map(findings.map((finding) => [finding.id, finding])), [findings])

  const blocks = useMemo(
    () => (open ? buildContractBlocks(buildRiskSegments(text, findings)) : []),
    [open, text, findings],
  )

  if (!open) return null

  const now = new Date()
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日`
  const ctx = { acceptedIds, findingNo, badgedIds: new Set() }
  const shownAnno = new Set()

  return (
    <div
      className="artifact-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="批注版合同预览"
    >
      <div className="artifact-topbar">
        <div className="artifact-topbar-copy">
          <strong>批注版合同</strong>
          <span>发给爸妈朋友把关，或打印带去谈判现场</span>
        </div>
        <div className="artifact-topbar-actions">
          <button className="ghost-button compact-button" type="button" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" />
            打印 / 存 PDF
          </button>
          <button
            className="ghost-button compact-button artifact-close"
            type="button"
            onClick={onClose}
            aria-label="关闭预览"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="artifact-scroll">
        <div className="artifact-paper paper-annotated">
          <header className="paper-head">
            <h3>租房合同 · 批注版</h3>
            <p className="paper-meta">
              生成于 {dateLabel} · 综合风险 {summary.score == null ? '暂未评分' : `${summary.score}/100`}（{summary.label}）
              · 待谈 {todo.length} 项 · 已谈妥 {done.length} 项
            </p>
            <p className="paper-note">
              给军师团：下面高亮的段落是 AI 标出的风险点，编号批注写在对应段落后，
              请重点帮忙看这几处、帮我出出主意。
            </p>
            <p className="paper-legend">
              高亮说明：红 = 高风险 · 琥珀 = 中风险 · 青 = 低风险；绿色替换句是已写入草案的修改。
            </p>
          </header>

          <div className="paper-contract">
            {blocks.map((block, index) => {
              const annotations = []
              collectBlockFindingIds(block).forEach((id) => {
                if (shownAnno.has(id) || !findingById.has(id)) return
                shownAnno.add(id)
                annotations.push(findingById.get(id))
              })
              return (
                <AnnotatedBlock
                  acceptedIds={acceptedIds}
                  annotations={annotations}
                  block={block}
                  ctx={ctx}
                  findingNo={findingNo}
                  key={`block-${index}`}
                  negotiationStates={negotiationStates}
                />
              )
            })}
          </div>

          <footer className="paper-foot">签前有数 · AI 批注仅供参考，关键条款以双方书面确认为准</footer>
        </div>
      </div>
    </div>
  )
}
