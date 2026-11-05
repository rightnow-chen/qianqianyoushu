import { useMemo } from 'react'
import { tidyContractText } from '../utils/text.js'
import { getFindingHighlightHits } from '../utils/contractBlocks.js'

/* ── 保真 Word 段落渲染 ──────────────────────────
   针对 docx 导入的结构化段落数组（{ type, text, level }），
   按真实段落渲染，风险高亮在段落级文本上做子串匹配。
   支持点击高亮定位、已采纳 diff（删除线 + 替换句）。 */

// 把一段文本按命中的 risk 片段切成 pieces
function highlightParagraph(text, findings, acceptedIds) {
  const segments = [{ text, risk: null, findingId: null, replacement: null }]

  // 返回是否真正标记了内容 —— 证据被其他风险先标过、无连续匹配时为 false
  const applyAnchor = (anchor, finding) => {
    if (!anchor) return false
    let marked = false
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i]
      if (segment.risk || !segment.text.includes(anchor)) continue

      const parts = segment.text.split(anchor)
      if (parts.length <= 1) continue

      const replacement = []
      parts.forEach((part, index) => {
        if (part) replacement.push({ text: part, risk: null, findingId: null, replacement: null })
        if (index < parts.length - 1) {
          replacement.push({
            text: anchor,
            risk: finding.level,
            findingId: finding.id,
            replacement: finding.replacement,
            accepted: acceptedIds.has(finding.id),
          })
          marked = true
        }
      })

      segments.splice(i, 1, ...replacement)
      i += replacement.length - 1
    }
    return marked
  }

  findings.forEach((finding) => {
    // 与原文高亮视图一致：证据（问题条款原文）能命中段落时只高亮证据，关键词仅兜底
    const evidence = typeof finding.evidence === 'string' ? finding.evidence.trim() : ''
    if (evidence.length >= 6 && text.includes(evidence)) {
      if (applyAnchor(evidence, finding)) return
    }

    getFindingHighlightHits(finding).forEach((hit) => applyAnchor(hit, finding))
  })

  return segments
}

function renderPieces(pieces, opts) {
  const { onFindingClick, activeFindingId } = opts || {}
  return pieces.map((piece, index) => {
    if (!piece.risk) return <span key={index}>{piece.text}</span>

    const { findingId, replacement, accepted } = piece

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

export function DocumentView({ structure, findings, acceptedIds, onFindingClick, activeFindingId }) {
  const renderOpts = { onFindingClick, activeFindingId }

  const paragraphs = useMemo(() => {
    if (!Array.isArray(structure) || !structure.length) return []
    const nodes = structure
      .map((node) => ({ ...node, text: tidyContractText(node.text) }))
      .filter((node) => node.text)

    // 兜底：mammoth 不映射 Word「Title」样式，首段若短且含合同关键词则提升为标题
    if (nodes.length && nodes[0].type === 'para') {
      const compact = nodes[0].text.replace(/[ \t]/g, '')
      if (compact.length <= 30 && /(合同|协议|契约)/.test(compact)) {
        nodes[0] = { ...nodes[0], type: 'heading', level: 1 }
      }
    }
    return nodes
  }, [structure])

  if (!paragraphs.length) {
    return <p className="empty-note">暂无可渲染的文档结构，请重新导入或改用粘贴文本。</p>
  }

  return (
    <div className="document-view" aria-label="合同原文（Word 保真渲染）">
      {paragraphs.map((node, index) => {
        const pieces = highlightParagraph(node.text, findings, acceptedIds)

        if (node.type === 'heading') {
          const HeadingTag = `h${Math.min(Math.max(node.level || 1, 1), 6)}`
          return (
            <HeadingTag className="dv-heading" key={index}>
              {renderPieces(pieces, renderOpts)}
            </HeadingTag>
          )
        }
        if (node.type === 'list') {
          return (
            <div className="dv-list-item" key={index}>
              <span className="dv-list-marker" aria-hidden="true">·</span>
              <span>{renderPieces(pieces, renderOpts)}</span>
            </div>
          )
        }
        if (node.type === 'table') {
          return (
            <pre className="dv-table" key={index}>
              {renderPieces(pieces, renderOpts)}
            </pre>
          )
        }
        return (
          <p className="dv-para" key={index}>
            {renderPieces(pieces, renderOpts)}
          </p>
        )
      })}
    </div>
  )
}
