import { tidyContractText } from '../utils/text.js'

const CLAUSE_HEADER_RE = /^(第\s*([一二三四五六七八九十百千万零\d]+)\s*条|([一二三四五六七八九十百千万零]+)\s*[、.]|[（(]\s*([一二三四五六七八九十百千万零\d]+)\s*[)）]|(\d+)\s*[、.)])\s*/
const DATE_RE = /\d{4}\s*(?:年|[./-])\s*\d{1,2}\s*(?:月|[./-])\s*\d{1,2}\s*日?/g
const AMOUNT_RE = /(?:人民币|￥|¥)?\s*\d+(?:\.\d+)?\s*(?:万元|元|%)/g
const TERM_RE = /\d+\s*(?:个?月|日内|个?工作日|小时|天)/g
const ARTICLE_REF_RE = /第\s*([一二三四五六七八九十百千万零\d]+)\s*条/g
const DEFINITION_RE = /(?:本合同(?:中|所)?(?:所称|称)|以下简称)\s*[“"「]?([^”"」：:，,。；;\s]+)[”"」]?\s*(?:是指|指|为|有效)?/g
const ATTACHMENT_RE = /附件\s*[一二三四五六七八九十百千万零\d]+\s*(?:[：:、.．]?\s*)?(?:《[^》]+》|[^\n；。]+)/g
const NEGATION_RE = /(?:不承担|不负责|不得|无权|禁止|未经|未(?:经|在|按|提供|约定)|不应|不视为|不包括|不予|无需)/g
const FACT_LABEL_RE = /(月租金|租金|押金|违约金|服务费|维修费|租期|期限|提前通知期|宽限期)/g

const CJK_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

function parseCjkNumber(value) {
  const source = String(value || '')
  if (/^\d+$/.test(source)) return Number(source)
  if (source === '十') return 10
  if (source.includes('十')) {
    const [left, right] = source.split('十')
    return (left ? CJK_DIGITS[left] * 10 : 10) + (right ? CJK_DIGITS[right] : 0)
  }
  return [...source].reduce((total, char) => total * 10 + (CJK_DIGITS[char] ?? 0), 0)
}

function parseClauseHeader(line) {
  const match = String(line || '').trim().match(CLAUSE_HEADER_RE)
  if (!match) return null
  const rawMarker = match[1]
  const number = parseCjkNumber(match[2] || match[3] || match[4] || match[5])
  const rest = String(line).trim().slice(match[0].length).trim()
  const title = (rest.match(/^[^，。；：,:;]+/)?.[0] || rest).trim()
  return { rawMarker, number, title }
}

function makeClauseId(number, title, fallback) {
  return `clause-${number || fallback}-${title || '未命名'}`
}

export function extractContractFacts(inputText) {
  const text = tidyContractText(inputText)
  const lines = text.split(/\r?\n/)
  const clauses = []
  let offset = 0

  lines.forEach((line, index) => {
    const header = parseClauseHeader(line)
    if (header) {
      clauses.push({
        ...header,
        id: makeClauseId(header.number, header.title, clauses.length + 1),
        start: offset,
        line: index + 1,
      })
    }
    offset += line.length + 1
  })

  if (!clauses.length && text.trim()) {
    clauses.push({ id: 'clause-1-未分段', number: 1, title: '未分段', start: 0, line: 1 })
  }

  clauses.forEach((clause, index) => {
    const next = clauses[index + 1]
    const end = next ? next.start - 1 : text.length
    clause.end = end
    clause.text = text.slice(clause.start, end).trim()
    clause.location = { line: clause.line, start: clause.start, end: clause.end }
  })

  const clauseForOffset = (offsetValue) => [...clauses].reverse().find((clause) => clause.start <= offsetValue)?.id || clauses[0]?.id || null
  const facts = (regex) => [...text.matchAll(regex)].map((match) => {
    const sentenceStart = Math.max(text.lastIndexOf('。', match.index - 1), text.lastIndexOf('；', match.index - 1), text.lastIndexOf('\n', match.index - 1)) + 1
    const context = text.slice(sentenceStart, match.index)
    const labels = [...context.matchAll(FACT_LABEL_RE)]
    return {
      raw: match[0].replace(/\s+/g, ''),
      value: Number(match[0].replace(/[^\d.]/g, '')) || null,
      key: labels.at(-1)?.[1] || null,
      clauseId: clauseForOffset(match.index),
    }
  })

  const references = []
  clauses.forEach((clause) => {
    for (const match of clause.text.matchAll(ARTICLE_REF_RE)) {
      const targetNumber = parseCjkNumber(match[1])
      if (targetNumber === clause.number) continue
      const target = clauses.find((item) => item.number === targetNumber)
      references.push({
        fromClauseId: clause.id,
        target: `第${match[1]}条`,
        targetClauseId: target?.id || null,
      })
    }
  })

  const definitions = []
  for (const match of text.matchAll(DEFINITION_RE)) {
    definitions.push({
      term: match[1],
      raw: match[0].trim(),
      clauseId: clauseForOffset(match.index),
    })
  }

  const attachments = []
  for (const match of text.matchAll(ATTACHMENT_RE)) {
    attachments.push({
      title: match[0].replace(/\s+/g, ' ').trim(),
      raw: match[0].trim(),
      clauseId: clauseForOffset(match.index),
    })
  }

  const tables = []
  let tableRows = []
  let tableStart = -1
  const flushTable = () => {
    if (tableRows.length < 2) {
      tableRows = []
      tableStart = -1
      return
    }
    tables.push({
      rowCount: tableRows.length,
      columnCount: Math.max(...tableRows.map((row) => row.split('|').length)),
      quality: new Set(tableRows.map((row) => row.split('|').length)).size > 1 ? 'inconsistent_columns' : 'ok',
      raw: tableRows.join('\n'),
      clauseId: clauseForOffset(tableStart),
    })
    tableRows = []
    tableStart = -1
  }

  const allLabeledFacts = [...facts(AMOUNT_RE), ...facts(TERM_RE)].filter((item) => item.key)
  const conflicts = Array.from(new Set(allLabeledFacts.map((item) => item.key))).flatMap((key) => {
    const items = allLabeledFacts.filter((item) => item.key === key)
    const values = Array.from(new Set(items.map((item) => item.raw)))
    if (values.length < 2) return []
    return [{
      key,
      values,
      clauseIds: Array.from(new Set(items.map((item) => item.clauseId))),
      evidence: items.map((item) => `${item.raw}（${item.clauseId}）`),
    }]
  })

  const qualityWarnings = []
  if (/[�□]{1,}|[?？]{2,}/.test(text)) {
    qualityWarnings.push({ type: 'ocr_suspect', message: '文本包含疑似 OCR 替换字符或连续不确定字符，相关事实需人工回看原文件。' })
  }
  tables.filter((table) => table.quality === 'inconsistent_columns').forEach((table) => {
    qualityWarnings.push({ type: 'table_misaligned', message: `表格列数不一致：${table.clauseId}` })
  })
  lines.forEach((line, index) => {
    if ((line.match(/\|/g) || []).length >= 1) {
      if (tableStart < 0) tableStart = lines.slice(0, index).reduce((total, item) => total + item.length + 1, 0)
      tableRows.push(line.trim())
      return
    }
    flushTable()
  })
  flushTable()

  const negations = []
  for (const match of text.matchAll(NEGATION_RE)) {
    const sentenceStart = Math.max(text.lastIndexOf('。', match.index - 1), text.lastIndexOf('\n', match.index - 1)) + 1
    const sentenceEndCandidates = [text.indexOf('。', match.index), text.indexOf('\n', match.index)].filter((value) => value >= 0)
    const sentenceEnd = sentenceEndCandidates.length ? Math.min(...sentenceEndCandidates) : text.length
    negations.push({
      raw: match[0],
      sentence: text.slice(sentenceStart, sentenceEnd).trim(),
      clauseId: clauseForOffset(match.index),
    })
  }

  return {
    sourceText: text,
    clauses,
    amounts: facts(AMOUNT_RE),
    dates: facts(DATE_RE),
    terms: facts(TERM_RE),
    references,
    definitions,
    attachments,
    tables,
    negations,
    conflicts,
    qualityWarnings,
  }
}
