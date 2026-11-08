// 合同原文导出（V0.2）：修订版与批注版。
//
// 两件事必须守住：
// 1. **原文一字不动地保留**。OCR 出来的文字里常混着多余空格（「标 准 由 甲 方 核 定」），
//    定位要忽略空白，但写进 docx 的必须是原文，不能把归一化后的版本当成合同发出去。
// 2. **改了什么要说清楚**。修订版把替换处标红加下划线，文末附修改清单；
//    批注版用 Word 原生批注挂到原句上，正文不改，并单列「没能在原文里定位到」的条目。
//
// 纯逻辑（定位 / 拼段 / 修改清单）与 docx 渲染分开，前者可以直接单测。

const HEADING_RE = /^\s*(?:第[一二三四五六七八九十百]+条|[一二三四五六七八九十]+\s*、)/
const PARTY_RE = /^\s*(?:出租方|承租方|甲方|乙方|出租人|承租人)/

/** 建立「去空白文本 → 原文下标」的映射，用于忽略空格与换行的定位。 */
export function buildIndexMap(text) {
  const chars = []
  const map = []
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (/\s/.test(ch)) continue
    chars.push(ch)
    map.push(i)
  }
  return { value: chars.join(''), map }
}

/** 在原文里定位一句话：先按原样找，找不到再忽略空白找。 */
export function locateQuote(text, quote, indexMap = buildIndexMap(text)) {
  const raw = String(quote || '').trim()
  if (!raw) return null
  const exact = text.indexOf(raw)
  if (exact !== -1) return { start: exact, end: exact + raw.length }
  const needle = raw.replace(/\s+/g, '')
  if (needle.length < 4) return null
  const at = indexMap.value.indexOf(needle)
  if (at === -1) return null
  return { start: indexMap.map[at], end: indexMap.map[at + needle.length - 1] + 1 }
}

function rateOf(risk, index) {
  return { mark: index + 1, level: risk.level, cat: risk.cat, title: risk.title }
}

/** 按风险区间切成「原文段 / 替换段」，区间去重叠、按位置排序。 */
function cutSegments(text, spans) {
  const sorted = spans.slice().sort((a, b) => a.start - b.start)
  const kept = []
  const dropped = []
  let cursor = 0
  sorted.forEach((span) => {
    if (span.start < cursor) {
      dropped.push(span)
      return
    }
    kept.push(span)
    cursor = span.end
  })

  const segments = []
  let at = 0
  kept.forEach((span) => {
    if (span.start > at) segments.push({ kind: 'text', text: text.slice(at, span.start) })
    segments.push({ kind: span.kind, text: span.text, risk: span.risk, mark: span.mark })
    at = span.end
  })
  if (at < text.length) segments.push({ kind: 'text', text: text.slice(at) })
  return { segments: segments.filter((s) => s.text), dropped }
}

/**
 * 修订版：把「已采纳」的修改替换进原文。
 * 返回 { text, segments, changes }，changes 里逐条说明改没改、为什么没改。
 */
export function composeRevision(text, risks = [], { accepted = {}, edited = {}, forceAll = false } = {}) {
  const source = String(text || '')
  const indexMap = buildIndexMap(source)
  const spans = []
  const changes = []

  risks.forEach((risk, index) => {
    const meta = rateOf(risk, index)
    const target = locateQuote(source, risk.original, indexMap)
    const next = String(edited[risk.id] ?? risk.suggestion ?? '').trim()
    const wanted = forceAll || accepted[risk.id] === true

    if (!target) {
      changes.push({ ...meta, id: risk.id, applied: false, reason: 'not-found', from: risk.original, to: next })
      return
    }
    if (!wanted) {
      changes.push({ ...meta, id: risk.id, applied: false, reason: 'not-accepted', from: risk.original, to: next })
      return
    }
    if (!next || next === risk.original.trim()) {
      changes.push({ ...meta, id: risk.id, applied: false, reason: 'no-change', from: risk.original, to: next })
      return
    }

    spans.push({ kind: 'changed', start: target.start, end: target.end, text: next, risk, mark: meta.mark })
    changes.push({ ...meta, id: risk.id, applied: true, reason: 'applied', from: risk.original, to: next })
  })

  const { segments, dropped } = cutSegments(source, spans)
  dropped.forEach((span) => {
    const hit = changes.find((item) => item.id === span.risk.id)
    if (hit) {
      hit.applied = false
      hit.reason = 'overlap'
      hit.to = ''
    }
  })

  return {
    text: segments.map((s) => s.text).join(''),
    segments,
    changes,
    appliedCount: changes.filter((item) => item.applied).length,
  }
}

/** 批注版：原文不动，只把每条风险挂到对应的原句上。 */
export function planComments(text, risks = []) {
  const source = String(text || '')
  const indexMap = buildIndexMap(source)
  const spans = []
  const missing = []

  risks.forEach((risk, index) => {
    const meta = rateOf(risk, index)
    const target = locateQuote(source, risk.original, indexMap)
    if (!target) {
      missing.push({ ...meta, id: risk.id, reason: 'not-found' })
      return
    }
    spans.push({ kind: 'anchor', start: target.start, end: target.end, text: source.slice(target.start, target.end), risk, mark: meta.mark })
  })

  const { segments, dropped } = cutSegments(source, spans)
  dropped.forEach((span) => missing.push({ ...rateOf(span.risk, 0), id: span.risk.id, reason: 'overlap' }))
  missing.sort((a, b) => a.mark - b.mark)

  return { segments, anchors: segments.filter((s) => s.kind === 'anchor'), missing }
}

// ---------------------------------------------------------------------------
// docx 渲染
// ---------------------------------------------------------------------------

const FONT = 'SimSun'
const INK = '171713'
const MUTED = '6B6B63'
const ACCENT = 'C0392B'
const RULE = 'E4E1D6'

function run(text, options = {}) {
  return { text, options }
}

function paraOf(runs, kind) {
  const text = runs.map((r) => r.text).join('')
  return { runs, text, kind }
}

/**
 * 把段落序列揉成 docx Paragraph。
 * 段落类型按首个可见文字判断：条款标题加粗、甲乙方不缩进、正文首行缩进。
 */
async function renderParagraphs(paras, extra = {}) {
  const { AlignmentType, Paragraph, TextRun } = await import('docx')
  return paras.map((para) => {
    const trimmed = para.text.trim()
    const isHeading = HEADING_RE.test(trimmed)
    const isParty = PARTY_RE.test(trimmed)
    const children = para.runs.map(({ text, options }) =>
      new TextRun({
        text,
        font: FONT,
        size: options.size || 24,
        bold: options.bold || isHeading,
        color: options.color || INK,
        underline: options.underline ? { type: 'single' } : undefined,
        strike: options.strike || false,
      }),
    )
    return new Paragraph({
      alignment: isParty ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
      indent: isParty || isHeading ? undefined : { firstLine: 480 },
      spacing: isHeading ? { before: 220, after: 100 } : { after: 160, line: 444 },
      children,
      ...extra,
    })
  })
}

/** 把 segments 摊平成「带样式标记的段落」：换行断段，替换段标红加下划线。 */
function segmentsToParas(segments) {
  const paras = []
  let buf = []
  const flush = () => {
    if (!buf.length) return
    paras.push(paraOf(buf, 'body'))
    buf = []
  }

  segments.forEach((segment) => {
    const options = segment.kind === 'changed' ? { color: ACCENT, underline: true } : {}
    String(segment.text)
      .split('\n')
      .forEach((piece, index) => {
        if (index > 0) flush()
        if (piece) buf.push(run(piece, options))
      })
  })
  flush()
  return paras
}

export async function buildRevisionDocxBlob({ text, risks = [], accepted = {}, edited = {}, meta = {}, forceAll = false }) {
  const { AlignmentType, Document, Packer, Paragraph, TextRun, convertInchesToTwip } = await import('docx')
  const composed = composeRevision(text, risks, { accepted, edited, forceAll })
  const paras = segmentsToParas(composed.segments)

  const header = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: '房屋租赁合同（修订版）', font: FONT, size: 36, bold: true, color: INK })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `共替换 ${composed.appliedCount} 处 · 红色下划线为已按建议修改的文字 · ${new Date().toLocaleDateString('zh-CN')}`,
          font: FONT,
          size: 19,
          color: MUTED,
        }),
      ],
    }),
  ]

  const body = await renderParagraphs(paras)

  const appendix = [
    new Paragraph({
      spacing: { before: 360, after: 140 },
      border: { top: { color: RULE, size: 6, space: 8, style: 'single' } },
      children: [new TextRun({ text: '修改清单', font: FONT, size: 28, bold: true, color: INK })],
    }),
  ]

  const applied = composed.changes.filter((item) => item.applied)
  const skipped = composed.changes.filter((item) => !item.applied)

  applied.forEach((item, index) => {
    appendix.push(
      new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [
          new TextRun({ text: `${index + 1}. 第 ${item.mark} 条 · ${item.cat || ''}`, font: FONT, size: 22, bold: true, color: INK }),
          new TextRun({ text: `　${item.title || ''}`, font: FONT, size: 20, color: MUTED }),
        ],
      }),
      new Paragraph({
        spacing: { after: 40 },
        indent: { left: 240 },
        children: [new TextRun({ text: `原：${item.from}`, font: FONT, size: 20, color: MUTED })],
      }),
      new Paragraph({
        spacing: { after: 120 },
        indent: { left: 240 },
        children: [new TextRun({ text: `改：${item.to}`, font: FONT, size: 20, color: ACCENT })],
      }),
    )
  })

  if (skipped.length) {
    appendix.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: '未替换的条目', font: FONT, size: 22, bold: true, color: INK })],
      }),
      ...skipped.map((item) => {
        const why =
          item.reason === 'not-found'
            ? '没能在合同原文里定位到这句（可能是 OCR 缺字），请手工核对'
            : item.reason === 'overlap'
              ? '与另一条修改位置重叠，未自动替换'
              : item.reason === 'not-accepted'
                ? '你还没有采纳这条修改'
                : '建议文本与原文一致'
        return new Paragraph({
          spacing: { after: 60 },
          indent: { left: 240 },
          children: [
            new TextRun({ text: `第 ${item.mark} 条 · ${item.title || ''}：`, font: FONT, size: 20, bold: true, color: INK }),
            new TextRun({ text: why, font: FONT, size: 20, color: MUTED }),
          ],
        })
      }),
    )
  }

  appendix.push(
    new Paragraph({
      spacing: { before: 260 },
      children: [
        new TextRun({
          text: `本合同由「签前有数」按你的选择生成${meta.fileName ? `（原件：${meta.fileName}）` : ''}· AI 初筛，不替代律师 · 修改是否被对方接受由双方协商决定`,
          font: FONT,
          size: 18,
          color: MUTED,
        }),
      ],
    }),
  )

  const document = new Document({
    title: '签前有数-合同修订版',
    creator: '签前有数',
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.86),
              right: convertInchesToTwip(0.71),
              bottom: convertInchesToTwip(0.79),
              left: convertInchesToTwip(0.71),
            },
          },
        },
        children: [...header, ...body, ...appendix],
      },
    ],
  })

  return { blob: await Packer.toBlob(document), composed }
}

export async function buildCommentDocxBlob({ text, risks = [], accepted = {}, meta = {} }) {
  const {
    AlignmentType,
    CommentRangeEnd,
    CommentRangeStart,
    CommentReference,
    Document,
    Packer,
    Paragraph,
    TextRun,
    convertInchesToTwip,
  } = await import('docx')
  const plan = planComments(text, risks)

  // 每条风险一条批注：等级 · 类别 / 结论 / 建议改为 / 依据；已采纳的在首行标出来
  const comments = plan.anchors.map((anchor) => ({
    id: anchor.mark,
    author: '签前有数',
    initials: 'QS',
    date: new Date(),
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `${anchor.risk.level === 'must' ? '必须改' : anchor.risk.level === 'check' ? '建议确认' : '仅提醒'} · ${anchor.risk.cat || ''}`,
            bold: true,
            size: 20,
            font: FONT,
          }),
          ...(accepted[anchor.risk.id]
            ? [new TextRun({ text: '　（已采纳，见修订版）', size: 18, font: FONT, color: ACCENT })]
            : []),
        ],
      }),
      new Paragraph({ children: [new TextRun({ text: anchor.risk.consequence || anchor.risk.title || '', size: 20, font: FONT })] }),
      new Paragraph({
        children: [
          new TextRun({ text: '建议改为：', bold: true, size: 20, font: FONT }),
          new TextRun({ text: anchor.risk.suggestion || '', size: 20, font: FONT }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `依据：${anchor.risk.law?.name || '—'}（${anchor.risk.law?.version || ''}）`, size: 18, font: FONT }),
        ],
      }),
    ],
  }))

  // 正文：逐段摊平，遇到 anchor 段就插批注范围
  const bodyParas = []
  let buf = []
  let open = null
  const flush = () => {
    if (!buf.length) return
    bodyParas.push(buf)
    buf = []
  }

  plan.segments.forEach((segment) => {
    if (segment.kind === 'anchor') {
      if (open) {
        buf.push(new CommentRangeEnd(open))
        buf.push(new TextRun({ children: [new CommentReference(open)], font: FONT, size: 20 }))
        open = null
      }
      flush()
      open = segment.mark
      buf.push(new CommentRangeStart(open))
    }
    const pieces = String(segment.text).split('\n')
    pieces.forEach((piece, index) => {
      if (index > 0) {
        if (open) {
          buf.push(new CommentRangeEnd(open))
          buf.push(new TextRun({ children: [new CommentReference(open)], font: FONT, size: 20 }))
          open = null
        }
        flush()
      }
      if (piece) {
        buf.push(
          new TextRun({
            text: piece,
            font: FONT,
            size: 24,
            color: INK,
            bold: HEADING_RE.test(piece.trim()),
            highlight: segment.kind === 'anchor' ? 'yellow' : undefined,
          }),
        )
      }
    })
    if (segment.kind === 'anchor' && open) {
      buf.push(new CommentRangeEnd(open))
      buf.push(new TextRun({ children: [new CommentReference(open)], font: FONT, size: 20 }))
      open = null
    }
  })
  flush()

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: '房屋租赁合同（批注版）', font: FONT, size: 36, bold: true, color: INK })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
      children: [
        new TextRun({
          text: `${comments.length} 条批注 · 正文一字未改，黄色高亮处为被批注的原句 · ${new Date().toLocaleDateString('zh-CN')}`,
          font: FONT,
          size: 19,
          color: MUTED,
        }),
      ],
    }),
    ...bodyParas.map(
      (runs) =>
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 160, line: 444 },
          indent: { firstLine: 480 },
          children: runs,
        }),
    ),
  ]

  if (plan.missing.length) {
    children.push(
      new Paragraph({
        spacing: { before: 320, after: 100 },
        border: { top: { color: RULE, size: 6, space: 8, style: 'single' } },
        children: [new TextRun({ text: '以下条目没能在原文里定位到', font: FONT, size: 26, bold: true, color: INK })],
      }),
      ...plan.missing.map(
        (item) =>
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `第 ${item.mark} 条 · ${item.title || ''}：`, font: FONT, size: 20, bold: true, color: INK }),
              new TextRun({
                text: item.reason === 'overlap' ? '与另一条批注位置重叠，仅保留一条' : '原句可能在 OCR 时缺字，请手工核对',
                font: FONT,
                size: 20,
                color: MUTED,
              }),
            ],
          }),
      ),
    )
  }

  children.push(
    new Paragraph({
      spacing: { before: 260 },
      children: [
        new TextRun({
          text: `由「签前有数」生成${meta.fileName ? `（原件：${meta.fileName}）` : ''}· AI 初筛，不替代律师`,
          font: FONT,
          size: 18,
          color: MUTED,
        }),
      ],
    }),
  )

  const document = new Document({
    title: '签前有数-合同批注版',
    creator: '签前有数',
    comments: { children: comments },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.86),
              right: convertInchesToTwip(0.71),
              bottom: convertInchesToTwip(0.79),
              left: convertInchesToTwip(0.71),
            },
          },
        },
        children,
      },
    ],
  })

  return { blob: await Packer.toBlob(document), plan }
}
