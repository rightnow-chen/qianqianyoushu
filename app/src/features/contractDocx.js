// 合同原文导出（V0.2）：修订版与批注版。
//
// 两件事必须守住：
// 1. **原文一字不动地保留**。OCR 出来的文字里常混着多余空格（「标 准 由 甲 方 核 定」），
//    定位要忽略空白，但写进 docx 的必须是原文，不能把归一化后的版本当成合同发出去。
// 2. **改了什么要说清楚**。修订版把替换处标红加下划线，文末附修改清单；
//    批注版用 Word 原生批注挂到原句上，正文不改，并单列「没能在原文里定位到」的条目。
//
// 纯逻辑（定位 / 拼段 / 修改清单）与 docx 渲染分开，前者可以直接单测。
//
// V0.3：两版共用 contractDocxLayout 的页边距 / 字体 / 行距 / 页眉页码 / 段落样式，
// 保证批注版与修订版排版一致；按来源分 template / preserve 两种骨架。
import { LAYOUT, headerFooter, pageProperties, renderBodyPara, resolveProfile } from './contractDocxLayout.js'

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

/**
 * 批注版：原文不动，只把「用户勾选了批注」的风险挂到对应的原句上。
 * selected：{ [riskId]: true }；不传时默认全部（兼容老调用与单测）。
 */
export function planComments(text, risks = [], { selected = null } = {}) {
  const source = String(text || '')
  const indexMap = buildIndexMap(source)
  const spans = []
  const missing = []

  // 只有显式传了 selected 才按勾选筛选：一条都没勾时 anchors 为空，导出会给出空批注版。
  const wanted = (risk) => (selected === null ? true : selected[risk.id] === true)

  risks.forEach((risk, index) => {
    if (!wanted(risk)) return
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

/** 两版共用的段落渲染：样式全部交给共享版式模块，保证排版一致。 */
async function renderParagraphs(paras, profile) {
  const Api = await import('docx')
  return paras.map((para) => renderBodyPara(Api, para, profile))
}

/**
 * 两版共用的封面骨架。
 * template：合同编号 + 居中标题 + 副标题（参照住建/市场监管示范文本通用结构）。
 * preserve：只给「文件名 · 版本」一行小标题，其余保留原文自带结构。
 */
async function buildHeader(Api, { versionName, subtitle, profile, meta }) {
  const { Paragraph, TextRun, AlignmentType } = Api
  const out = []
  if (profile === 'template') {
    // 不在封面重复写「房屋租赁合同」：原文自带的标题行（type=title）会被
    // renderBodyPara 渲染成居中大字，合同编号行渲染成居中小字。封面只放版本标记，
    // 否则「房屋租赁合同」出现两次。批注版承诺正文一字不动，不能删正文的标题行。
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: `（${versionName}）`, font: LAYOUT.font, size: 24, bold: true, color: INK })],
      }),
    )
  } else {
    out.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: `${meta?.fileName || '合同'} · ${versionName}`, font: LAYOUT.font, size: 22, bold: true, color: INK }),
        ],
      }),
    )
  }
  out.push(
    new Paragraph({
      alignment: profile === 'template' ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 260 },
      border: profile === 'template' ? { bottom: { color: RULE, size: 4, space: 6, style: 'single' } } : undefined,
      children: [new TextRun({ text: subtitle, font: LAYOUT.font, size: LAYOUT.metaSize, color: MUTED })],
    }),
  )
  return out
}

/** 两版共用的文末署名：不编造数据，只写生成方式与来源文件名。 */
async function buildFooterNote(Api, { meta, extra = '' }) {
  const { Paragraph, TextRun } = Api
  const source = meta?.fileName ? `（原件：${meta.fileName}）` : ''
  return new Paragraph({
    spacing: { before: 260 },
    border: { top: { color: RULE, size: 4, space: 6, style: 'single' } },
    children: [
      new TextRun({
        text: `由「签前有数」生成${source} · AI 初筛，不替代律师${extra ? ` · ${extra}` : ''}`,
        font: LAYOUT.font,
        size: 18,
        color: MUTED,
      }),
    ],
  })
}

/** 装配 section：页边距 / 页眉页码两版完全一致。 */
function sectionOf(Api, { children, versionName }) {
  return {
    properties: pageProperties(Api),
    ...headerFooter(Api, { versionName }),
    children,
  }
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

export async function buildRevisionDocxBlob({ text, risks = [], accepted = {}, edited = {}, meta = {}, forceAll = false, profile }) {
  const Api = await import('docx')
  const { Document, Packer, Paragraph, TextRun } = Api
  const resolvedProfile = profile || resolveProfile(meta)
  const composed = composeRevision(text, risks, { accepted, edited, forceAll })
  const paras = segmentsToParas(composed.segments)

  const header = await buildHeader(Api, {
    versionName: '修订版',
    profile: resolvedProfile,
    meta,
    subtitle: `共替换 ${composed.appliedCount} 处 · 红色下划线为已按建议修改的文字 · ${new Date().toLocaleDateString('zh-CN')}`,
  })

  const body = await renderParagraphs(paras, resolvedProfile)

  const appendix = [
    new Paragraph({
      spacing: { before: 360, after: 140 },
      border: { top: { color: RULE, size: 6, space: 8, style: 'single' } },
      children: [new TextRun({ text: '修改清单', font: LAYOUT.font, size: 28, bold: true, color: INK })],
    }),
  ]

  const applied = composed.changes.filter((item) => item.applied)
  const skipped = composed.changes.filter((item) => !item.applied)

  applied.forEach((item, index) => {
    appendix.push(
      new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [
          new TextRun({ text: `${index + 1}. 第 ${item.mark} 条 · ${item.cat || ''}`, font: LAYOUT.font, size: 22, bold: true, color: INK }),
          new TextRun({ text: `　${item.title || ''}`, font: LAYOUT.font, size: 20, color: MUTED }),
        ],
      }),
      new Paragraph({
        spacing: { after: 40 },
        indent: { left: 240 },
        children: [new TextRun({ text: `原：${item.from}`, font: LAYOUT.font, size: 20, color: MUTED })],
      }),
      new Paragraph({
        spacing: { after: 120 },
        indent: { left: 240 },
        children: [new TextRun({ text: `改：${item.to}`, font: LAYOUT.font, size: 20, color: ACCENT })],
      }),
    )
  })

  if (skipped.length) {
    appendix.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: '未替换的条目', font: LAYOUT.font, size: 22, bold: true, color: INK })],
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
            new TextRun({ text: `第 ${item.mark} 条 · ${item.title || ''}：`, font: LAYOUT.font, size: 20, bold: true, color: INK }),
            new TextRun({ text: why, font: LAYOUT.font, size: 20, color: MUTED }),
          ],
        })
      }),
    )
  }

  const footerNote = await buildFooterNote(Api, {
    meta,
    extra: '修改是否被对方接受由双方协商决定',
  })

  const document = new Document({
    title: '签前有数-合同修订版',
    creator: '签前有数',
    sections: [sectionOf(Api, { children: [...header, ...body, ...appendix, footerNote], versionName: '修订版' })],
  })

  return { blob: await Packer.toBlob(document), composed }
}

export async function buildCommentDocxBlob({ text, risks = [], accepted = {}, meta = {}, selected = null, profile }) {
  const Api = await import('docx')
  const {
    CommentRangeEnd,
    CommentRangeStart,
    CommentReference,
    Document,
    Packer,
    Paragraph,
    TextRun,
  } = Api
  const resolvedProfile = profile || resolveProfile(meta)
  const plan = planComments(text, risks, { selected })

  // 每条被勾选的风险一条批注：等级 · 类别 / 结论 / 建议改为 / 依据；已采纳的在首行标出来
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
            font: LAYOUT.font,
          }),
          ...(accepted[anchor.risk.id]
            ? [new TextRun({ text: '　（已采纳，见修订版）', size: 18, font: LAYOUT.font, color: ACCENT })]
            : []),
        ],
      }),
      new Paragraph({ children: [new TextRun({ text: anchor.risk.consequence || anchor.risk.title || '', size: 20, font: LAYOUT.font })] }),
      new Paragraph({
        children: [
          new TextRun({ text: '建议改为：', bold: true, size: 20, font: LAYOUT.font }),
          new TextRun({ text: anchor.risk.suggestion || '', size: 20, font: LAYOUT.font }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `依据：${anchor.risk.law?.name || '—'}（${anchor.risk.law?.version || ''}）`, size: 18, font: LAYOUT.font }),
        ],
      }),
    ],
  }))

  // 正文：逐段摊平，遇到 anchor 段就插批注范围。
  // 每段同时记录纯文本，交给共享的 classifyLine 判角色 → 与修订版段落样式一致。
  const { classifyLine } = await import('./contractDocxLayout.js')
  const bodyParas = []
  let buf = []
  let plain = ''
  let open = null
  const flush = () => {
    if (!buf.length) return
    bodyParas.push({ runs: buf, role: classifyLine(plain.trim()) })
    buf = []
    plain = ''
  }

  plan.segments.forEach((segment) => {
    if (segment.kind === 'anchor') {
      if (open) {
        buf.push(new CommentRangeEnd(open))
        buf.push(new TextRun({ children: [new CommentReference(open)], font: LAYOUT.font, size: 20 }))
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
          buf.push(new TextRun({ children: [new CommentReference(open)], font: LAYOUT.font, size: 20 }))
          open = null
        }
        flush()
      }
      if (piece) {
        const role = classifyLine(piece.trim())
        buf.push(
          new TextRun({
            text: piece,
            font: LAYOUT.font,
            size: role === 'title' ? LAYOUT.titleSize : role === 'party' ? LAYOUT.partySize : LAYOUT.bodySize,
            color: role === 'contractNo' ? '8A887E' : INK,
            bold: role === 'heading' || role === 'title',
            highlight: segment.kind === 'anchor' ? 'yellow' : undefined,
          }),
        )
        plain += piece
      }
    })
    if (segment.kind === 'anchor' && open) {
      buf.push(new CommentRangeEnd(open))
      buf.push(new TextRun({ children: [new CommentReference(open)], font: LAYOUT.font, size: 20 }))
      open = null
    }
  })
  flush()

  const { bodyParaProps } = await import('./contractDocxLayout.js')
  const header = await buildHeader(Api, {
    versionName: '批注版',
    profile: resolvedProfile,
    meta,
    subtitle: `${comments.length} 条批注 · 正文一字未改，黄色高亮处为被批注的原句 · ${new Date().toLocaleDateString('zh-CN')}`,
  })

  const children = [
    ...header,
    ...bodyParas.map(({ runs, role }) => new Paragraph({ ...bodyParaProps(Api, role), children: runs })),
  ]

  if (plan.missing.length) {
    children.push(
      new Paragraph({
        spacing: { before: 320, after: 100 },
        border: { top: { color: RULE, size: 6, space: 8, style: 'single' } },
        children: [new TextRun({ text: '以下条目没能在原文里定位到', font: LAYOUT.font, size: 26, bold: true, color: INK })],
      }),
      ...plan.missing.map(
        (item) =>
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `第 ${item.mark} 条 · ${item.title || ''}：`, font: LAYOUT.font, size: 20, bold: true, color: INK }),
              new TextRun({
                text: item.reason === 'overlap' ? '与另一条批注位置重叠，仅保留一条' : '原句可能在 OCR 时缺字，请手工核对',
                font: LAYOUT.font,
                size: 20,
                color: MUTED,
              }),
            ],
          }),
      ),
    )
  }

  const footerNote = await buildFooterNote(Api, { meta })

  const document = new Document({
    title: '签前有数-合同批注版',
    creator: '签前有数',
    comments: { children: comments },
    sections: [sectionOf(Api, { children: [...children, footerNote], versionName: '批注版' })],
  })

  return { blob: await Packer.toBlob(document), plan }
}
