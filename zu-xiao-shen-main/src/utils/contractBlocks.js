/* 合同文本结构解析 + 风险分段（供原文高亮视图 HighlightedContract 与批注版合同 ArtifactPreview 共用）。
   把导入 / OCR 得到的合同纯文本拆成可排版的块：
   标题、合同编号、当事人字段、条款、签署区和普通段落，
   同时保留风险关键词的高亮分段。 */

import { tidyContractText } from './text.js'

const CJK_HEAD_RE = '[\\u3400-\\u9fff\\uff08\\u300a\\u300c]'
const CLAUSE_RE = new RegExp(
  '^(第\\s*[一二三四五六七八九十百零\\d]{1,5}\\s*条'
  + '|[（(]\\s*[一二三四五六七八九十]{1,3}\\s*[)）]'
  + '|[一二三四五六七八九十]{1,3}\\s*、'
  + '|\\d{1,2}\\s*[、)]'
  + '|\\d{1,2}\\s*\\.\\s*(?=' + CJK_HEAD_RE + '))\\s*',
)
const FIELD_LABELS = '出租人|出租方|承租人|承租方|甲方|乙方|丙方|丁方|身份证号码|身份证号|联系电话|联系方式|电话号码|电话|住址|通讯地址|工作单位|法定代表人|委托代理人|中介方|见证方'
const FIELD_RE = new RegExp(`(?:${FIELD_LABELS})\\s*(?:（[^）]{0,18}）|\\([^)]{0,18}\\))?\\s*[:：]`)
const FIELD_PAIR_RE = new RegExp(`((${FIELD_LABELS})\\s*(?:（[^）]{0,18}）|\\([^)]{0,18}\\))?\\s*[:：])`, 'g')
const CONTRACT_NO_RE = /((?:合同编号|编号)\s*[:：]?\s*\S{1,20}|NO\s*[.:：]?\s*[A-Za-z0-9-]{1,20})/i
const SIGNATURE_RE = /(签字|签章|签名|盖章|按手印|捺印)/

function splitSegmentsToLines(segments) {
  const lines = []
  let current = []

  segments.forEach((segment) => {
    const parts = String(segment.text).split('\n')
    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push(current)
        current = []
      }
      if (part) current.push({ text: part, risk: segment.risk, findingId: segment.findingId, replacement: segment.replacement })
    })
  })
  lines.push(current)
  return lines
}

function lineText(pieces) {
  return pieces.map((piece) => piece.text).join('')
}

function slicePieces(pieces, start, end) {
  const limit = end == null ? Number.POSITIVE_INFINITY : end
  const out = []
  let pos = 0

  pieces.forEach((piece) => {
    const pieceEnd = pos + piece.text.length
    const from = Math.max(start, pos)
    const to = Math.min(limit, pieceEnd)
    if (to > from) {
      out.push({
        text: piece.text.slice(from - pos, to - pos),
        risk: piece.risk,
        findingId: piece.findingId,
        replacement: piece.replacement,
      })
    }
    pos = pieceEnd
  })
  return out.filter((piece) => piece.text.length > 0)
}

function splitFieldRows(line, pieces, offset) {
  const matches = [...line.matchAll(FIELD_PAIR_RE)]
  if (!matches.length) return null

  const rows = []
  if (line.slice(0, matches[0].index).trim()) {
    rows.push({ label: '', pieces: slicePieces(pieces, offset, offset + matches[0].index) })
  }
  matches.forEach((match, index) => {
    const next = matches[index + 1]
    const start = match.index + match[0].length
    const end = next ? next.index : line.length
    rows.push({
      label: match[0].replace(/[:：]\s*$/, '').trim(),
      pieces: slicePieces(pieces, offset + start, offset + end),
    })
  })
  return rows
}

export function buildContractBlocks(segments) {
  const lines = splitSegmentsToLines(segments)
  const blocks = []
  let open = null
  let titleFound = false

  const flush = () => {
    if (!open) return
    if (open.type === 'fields' || open.type === 'signature') {
      if (open.rows?.length || open.lines?.length) blocks.push(open)
    } else if (open.pieces?.length || open.headPieces?.length || open.bodyPieces?.length) {
      blocks.push(open)
    }
    open = null
  }

  lines.forEach((pieces) => {
    const plain = lineText(pieces)
    const trimmed = plain.trim()
    const lead = plain.length - plain.trimStart().length

    if (!trimmed) {
      flush()
      return
    }

    const compact = trimmed.replace(/[ \t]/g, '')

    // 合同标题：首个内容行，短且含「合同 / 协议 / 契约」
    if (!titleFound) {
      titleFound = true
      if (compact.length <= 30 && /(合同|协议|契约)/.test(compact) && !CLAUSE_RE.test(trimmed)) {
        const noMatch = trimmed.match(CONTRACT_NO_RE)
        flush()
        blocks.push({
          type: 'title',
          pieces: noMatch ? slicePieces(pieces, 0, lead + noMatch.index) : pieces,
          no: noMatch ? noMatch[1].trim() : '',
        })
        return
      }
    }

    // 独立编号行（紧跟标题时并入标题块）
    const lastBlock = blocks[blocks.length - 1]
    if (
      lastBlock?.type === 'title' && !lastBlock.no && compact.length <= 24
      && /^(合同编号|编号|NO)[.:：\s]/i.test(trimmed)
    ) {
      lastBlock.no = trimmed.trim()
      return
    }

    // 签署区（签字 / 盖章 / 日期）
    if (SIGNATURE_RE.test(compact) && compact.length <= 44) {
      if (open?.type !== 'signature') {
        flush()
        open = { type: 'signature', lines: [] }
      }
      open.lines.push(pieces)
      return
    }
    if (open?.type === 'signature' && compact.length <= 30 && /(日期|年月日|_)/.test(compact)) {
      open.lines.push(pieces)
      return
    }

    // 条款开头：一、 / （一） / 第一条 / 1.
    const clauseMatch = trimmed.match(CLAUSE_RE)
    if (clauseMatch) {
      flush()
      const marker = clauseMatch[0].trim()
      const restOffset = clauseMatch[0].length
      const rest = trimmed.slice(restOffset)
      const delimIndex = rest.search(/[，。；：,;:]/)
      const headLength = delimIndex === -1 ? rest.length : delimIndex
      let heading = ''
      let bodyOffset = restOffset

      if (rest && headLength <= 18) {
        heading = rest.slice(0, headLength)
        bodyOffset = restOffset + headLength + (delimIndex === -1 ? 0 : 1)
      }

      open = {
        type: 'clause',
        marker: marker.replace(/第|条|[（）()、.\s]/g, ''),
        headPieces: heading ? slicePieces(pieces, lead + restOffset, lead + restOffset + heading.length) : [],
        bodyPieces: bodyOffset < trimmed.length ? slicePieces(pieces, lead + bodyOffset) : [],
      }
      return
    }

    // 当事人 / 联系方式等字段行
    if (FIELD_RE.test(compact) && compact.length <= 100) {
      if (open?.type !== 'fields') {
        flush()
        open = { type: 'fields', rows: [] }
      }
      open.rows.push(...(splitFieldRows(trimmed, pieces, lead) || [{ label: '', pieces }]))
      return
    }

    // 普通段落：连续行合并成一段，空行分段
    if (open?.type === 'clause') {
      open.bodyPieces.push(...pieces)
      return
    }
    flush()
    open = { type: 'para', pieces: [...pieces] }
  })

  flush()
  return blocks
}

/* 把风险命中拆进文本分段（高亮 mark / 批注编号都依赖这里的 findingId 标记）
   返回是否真正标记了内容 —— 证据被别的风险先标过、找不到连续匹配时返回 false。 */
function applyAnchor(segments, anchor, finding) {
  if (!anchor) return false
  let marked = false
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    if (segment.risk || !segment.text.includes(anchor)) continue

    const parts = segment.text.split(anchor)
    if (parts.length <= 1) continue

    const replacement = []
    parts.forEach((part, index) => {
      if (part) replacement.push({ text: part, risk: null })
      if (index < parts.length - 1) {
        replacement.push({ text: anchor, risk: finding.level, findingId: finding.id, replacement: finding.replacement })
        marked = true
      }
    })

    segments.splice(i, 1, ...replacement)
    i += replacement.length - 1
  }
  return marked
}

/* 关键词兜底黑名单：这些泛词在合同里到处出现，做高亮只会散射误导，
   宁可该条无高亮也不标错地方。 */
const GENERIC_HIGHLIGHT_WORDS = new Set([
  '押金', '保证金', '扣除', '退还', '返还', '租金', '房租', '费用',
  '甲方', '乙方', '违约', '逾期', '合同', '房屋',
])

/* 关键词兜底：过滤短词（<3 字）与泛词，避免全文散射。证据定位失败时才使用。 */
export function getFindingHighlightHits(finding) {
  const hits = Array.isArray(finding.highlightHits) && finding.highlightHits.length
    ? finding.highlightHits
    : (Array.isArray(finding.hits) && finding.hits.length ? finding.hits : [])
  return hits.filter((hit) => hit && hit.length >= 3 && !GENERIC_HIGHLIGHT_WORDS.has(hit))
}

export function buildRiskSegments(text, findings) {
  const cleaned = tidyContractText(text)
  const segments = [{ text: cleaned, risk: null }]

  findings.forEach((finding) => {
    // 高亮 = 有问题的条款原文（证据）。证据能定位时只高亮证据本身，
    // 避免关键词（如「押金」）在全文所有出现处误亮；仅当证据缺失或被其他风险
    // 先标记截断、找不到连续匹配时，才退回关键词兜底。
    const evidence = typeof finding.evidence === 'string' ? finding.evidence.trim() : ''
    if (evidence.length >= 6 && cleaned.includes(evidence)) {
      if (applyAnchor(segments, evidence, finding)) return
    }
    getFindingHighlightHits(finding).forEach((hit) => applyAnchor(segments, hit, finding))
  })

  return segments
}
