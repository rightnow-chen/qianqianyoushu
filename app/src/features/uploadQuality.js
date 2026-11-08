// 上传后的「质检」数据。抽成独立模块，一是为了能单测（App.jsx 是 JSX，Node 直接 import 不了），
// 二是这条规则值得单独写清楚：**PDF 没有「识别率」这回事**。
import { estimatePages } from './contractPages.js'

// 一份租房合同不可能完全不出现这些词。没有就提醒「可能传错了」，但不拦。
const LEASE_HINTS = /租赁|出租|承租|房东|租金|押金|租期|房屋/

// 超长文本只审前 6 万字：再长也不是一份租房合同，反而会把逐句比对拖垮。
export const MAX_ANALYZE_CHARS = 60000

export function looksLikeLease(text = '') {
  return LEASE_HINTS.test(text)
}

export function countSentences(text = '') {
  return Math.max(1, (String(text).match(/[。；;！!？?]/g) || []).length)
}

function countMasked(text = '') {
  const source = String(text)
  const ids = (source.match(/\d{17}[\dXx]/g) || []).length
  // 必须带前后边界：18 位身份证号里含有形似手机号的 11 位子串，
  // 不加边界会把一个身份证号同时算成一个手机号（实测会报出「3 个手机号」）。
  const phones = (source.match(/(?<!\d)1[3-9]\d{9}(?!\d)/g) || []).length
  return { ids, phones }
}

/**
 * 真实文件没有「手写好的质检结果」，这里按来源生成一份。
 *
 * 关键区分：**「识别率」只对拍照 OCR 成立**。
 * PDF / Word 自带文字层，是逐字提取，不存在识别损耗，跟「反光、重拍、置信度」无关；
 * 把 OCR 的质检模板套到 PDF 上，等于给用户编造一个不存在的问题。
 * 三种来源各自的关注点：
 *   - text（PDF / Word）：读到了多少字、文字从哪来、提取结果有没有串行
 *   - ocr（图片）：识别率多少、哪页不清楚、要不要补拍
 *   - plain（TXT / 粘贴）：读到多少字、是否完整
 */
export function qualityForFile({ text, source, confidence, pageCount }) {
  const clean = String(text || '')
  const chars = clean.replace(/\s/g, '').length
  const masked = countMasked(clean)
  const ocr = source === '图片 OCR'
  const hasTextLayer = source === 'PDF' || source === 'Word'
  const mode = ocr ? 'ocr' : hasTextLayer ? 'text' : 'plain'
  const notLease = !looksLikeLease(clean)
  const tooLong = chars > MAX_ANALYZE_CHARS

  // 一张照片就是一页；有文字层的文件用真实页数；纯文本没有页的概念
  const totalPages = ocr ? 1 : pageCount || estimatePages(clean)
  const rate = Math.round(Number(confidence) || 0)
  const lowConfidence = ocr && rate > 0 && rate < 80

  const pages =
    mode === 'plain'
      ? []
      : Array.from({ length: totalPages }, (_, index) => ({
          n: index + 1,
          state: lowConfidence && index === 0 ? 'retake' : 'ok',
          label: ocr ? `识别 ${rate}%` : '文字层完整',
        }))

  const pagesCountLabel =
    mode === 'plain'
      ? ''
      : ocr
        ? `${totalPages} 页图片`
        : source === 'Word'
          ? `按排版估算约 ${totalPages} 页`
          : `共 ${totalPages} 页`

  const integrityDetail =
    mode === 'plain'
      ? `读到 ${chars.toLocaleString('zh-CN')} 个字`
      : `${totalPages} 页，${ocr ? '识别出' : '提取到'} ${chars.toLocaleString('zh-CN')} 个字`

  const checks = [
    {
      key: 'integrity',
      title: '文件完整性',
      status: chars < 300 ? 'warn' : 'ok',
      detail:
        chars < 300
          ? `${integrityDetail}。偏少，可能不是完整合同，受影响条款会标为「需人工核对」。`
          : integrityDetail,
    },
  ]

  if (mode === 'ocr') {
    checks.push({
      key: 'ocr',
      title: '文字识别率',
      status: lowConfidence ? 'warn' : 'ok',
      badge: `${rate}%`,
      detail: lowConfidence
        ? '照片有不清楚的地方，押金、退租这类长句容易出现错字。建议补拍或直接改下面的文字。'
        : '照片清楚，识别结果可以直接用。',
      bar: { value: rate },
    })
  } else {
    checks.push({
      key: 'source',
      title: '文字来源',
      status: 'ok',
      detail: hasTextLayer
        ? `${source === 'PDF' ? 'PDF' : 'Word'} 自带文字层，逐字提取，不经过 OCR，没有识别损耗`
        : '直接读取文本，不经过识别，没有损耗',
    })
  }

  checks.push({
    key: 'type',
    title: '合同类型',
    status: notLease ? 'warn' : 'ok',
    detail: notLease
      ? '没找到「租赁 / 出租 / 租金 / 押金」这类字样，可能不是租房合同。仍可继续，但结论大概率对不上。'
      : '识别为「房屋租赁合同」，将按 9 类条款审查',
  })

  checks.push({
    key: 'privacy',
    title: '隐私脱敏',
    status: 'ok',
    detail:
      masked.ids || masked.phones
        ? `${masked.ids} 个身份证号、${masked.phones} 个手机号已打码，不进模型`
        : '这份合同里没有检测到身份证号和手机号，无需脱敏',
  })

  const advice = lowConfidence
    ? [
        { label: '① 重新拍第 1 页', kind: 'retake', page: 1 },
        { label: '② 换一份文件', kind: 'replace' },
        { label: '③ 手动改下面的文字', kind: 'manual' },
      ]
    : []

  const footerHint = lowConfidence
    ? '识别不全的部分会标为「需人工核对」，但建议先重拍这一页。'
    : mode === 'ocr'
      ? '识别正常，可以继续。'
      : '文字已经完整提取，可以直接进入下一步。'

  return {
    mode,
    totalPages,
    pagesCountLabel,
    pages,
    checks,
    advice,
    footerHint,
    warn: notLease
      ? '这份文件里没有出现「租赁 / 出租 / 租金 / 押金」这类字样，可能不是租房合同。仍可以继续，但审查结论大概率对不上。'
      : tooLong
        ? `这份合同有 ${chars} 个字，超过单次审查上限（${MAX_ANALYZE_CHARS} 字）。这次只审前 ${MAX_ANALYZE_CHARS} 字，后面的部分请自己核对。`
        : chars < 300
          ? `这份文件只读出 ${chars} 个字，可能不是完整合同。可以先继续，但受影响条款会被标为「需人工核对」。`
          : `已读出 ${chars.toLocaleString('zh-CN')} 个字。押金、退租、维修三类条款会逐句比对。`,
    notLease,
    ocrSample: clean.slice(0, 80),
    // 文字层文件的「质检」不是看识别率，而是看提取结果对不对（多栏排版、表格、页眉页脚都可能串行）
    previewText: clean.replace(/\n{2,}/g, '\n').slice(0, 220),
    ocrBadChar: '',
    maskedIds: masked.ids,
    maskedPhones: masked.phones,
  }
}
