// 真实合同 → 左栏合同纸。
// 演示数据是手写的 blocks，真实合同只有一段文本，所以这一层负责：
// 1. 按行认块（条款标题 / 编号项 / 甲乙方 / 正文）；2. 把风险原句切出来挂上编号；3. 按行数分页。
// 切不出句子级时退到整段高亮，宁可粗一点，也不能让用户点不到原文。

const CLAUSE_RE = /^\s*(?:第[一二三四五六七八九十百]+条|[一二三四五六七八九十]+\s*、)/
const ITEM_RE = /^\s*(?:\d+[.、]|[（(]\d+[)）])\s*/
const PARTY_RE = /^\s*(?:出租方|承租方|甲方|乙方|出租人|承租人)[^：:]{0,6}[：:]/

function blockTypeOf(line, index) {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (index === 0 && trimmed.length <= 24 && !CLAUSE_RE.test(trimmed)) return 'title'
  if (PARTY_RE.test(trimmed)) return 'party'
  if (CLAUSE_RE.test(trimmed)) return 'clause'
  if (ITEM_RE.test(trimmed)) return 'item'
  return 'para'
}

/** 把 risk.original 压成能在单行里找到的片段。 */
export function sentenceNeedle(risk) {
  const raw = String(risk.original || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return ''
  const firstSentence = raw.split(/[。；;]/)[0].trim()
  const base = firstSentence.length >= 8 ? firstSentence : raw
  return base.length > 40 ? base.slice(0, 40) : base
}

/** 找出这一行里命中哪些风险，返回按位置排序的区间。 */
function hitsInLine(line, risks, lineNo) {
  const hits = []
  risks.forEach((risk) => {
    const needle = sentenceNeedle(risk)
    if (!needle) return
    let index = line.indexOf(needle)
    let length = needle.length
    if (index === -1) {
      // 原句被换行切断时，退一步用「这一行是否就是定位行」判断
      if (risk.location?.line !== lineNo) return
      index = 0
      length = line.length
    }
    hits.push({ riskId: risk.id, index, length })
  })
  return hits.sort((a, b) => a.index - b.index).filter((hit, i, arr) => i === 0 || hit.index >= arr[i - 1].index + arr[i - 1].length)
}

function runsFor(line, hits) {
  if (!hits.length) return [{ t: line }]
  const runs = []
  let cursor = 0
  hits.forEach((hit) => {
    if (hit.index > cursor) runs.push({ t: line.slice(cursor, hit.index) })
    runs.push({ t: line.slice(hit.index, hit.index + hit.length), risk: hit.riskId })
    cursor = hit.index + hit.length
  })
  if (cursor < line.length) runs.push({ t: line.slice(cursor) })
  return runs
}

/**
 * @param {string} text 合同全文
 * @param {Array} risks 映射后的风险（用 id / original / location.line）
 * @param {{linesPerPage?:number}} options
 * @returns {Array<{n:number, blocks:Array}>}
 */
export function buildContractPages(text = '', risks = [], options = {}) {
  const linesPerPage = options.linesPerPage || 18
  const lines = String(text).split(/\r?\n/)
  const pages = []
  let current = { n: 1, blocks: [], count: 0 }

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1
    const line = rawLine.replace(/\t/g, '  ')
    const type = blockTypeOf(rawLine, index)

    if (current.count >= linesPerPage) {
      pages.push(current)
      current = { n: pages.length + 1, blocks: [], count: 0 }
    }

    if (type) {
      const trimmed = line.trim()
      if (type === 'party') {
        const [name, ...rest] = trimmed.split(/[：:]/)
        current.blocks.push({ type: 'party', text: `${name}：`, mask: rest.join('：').trim() })
      } else if (type === 'item') {
        const no = trimmed.match(ITEM_RE)?.[0] || ''
        const body = trimmed.slice(no.length)
        current.blocks.push({ type: 'item', no, runs: runsFor(body, hitsInLine(body, risks, lineNo)) })
      } else if (type === 'clause' || type === 'title') {
        current.blocks.push({ type, text: trimmed })
      } else {
        current.blocks.push({ type: 'para', runs: runsFor(trimmed, hitsInLine(trimmed, risks, lineNo)) })
      }
      current.count += 1
    } else if (line.trim() === '') {
      current.count += 0.5
    }
  })

  if (current.blocks.length) pages.push(current)
  if (!pages.length) pages.push({ n: 1, blocks: [{ type: 'para', runs: [{ t: '（没有读到可显示的正文）' }] }] })
  return pages
}

/** 粗估页数：给不了真实分页时按每页 26 行折算，界面上标明「按行数折算」。 */
export function estimatePages(text = '') {
  const lines = String(text).split(/\r?\n/).filter((line) => line.trim()).length
  return Math.max(1, Math.ceil(lines / 18))
}
