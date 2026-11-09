/**
 * 在「真原件」的 DOM 上做句子级定位与高亮。
 *
 * 背景：结果页左侧以前是「把文本重新排成一张纸」，所以能自己切 span 包高亮；
 * 换成真原件（PDF 文本层 / docx-preview 渲染出来的 DOM）以后，这套就没了。
 *
 * 为什么不往 DOM 里插 <span>：
 * PDF 文本层的每个 span 都是绝对定位的（left/top/transform 全靠 pdf.js 算好的），
 * docx 的表格、页码、段落也是它自己排的。插节点会打断这些结构，
 * 轻则错位，重则表格塌掉。Custom Highlight API 只描述「哪一段文字」，
 * 渲染交给浏览器，DOM 一个节点都不动。
 *
 * 为什么要做空白归一化：
 * 审查用的正文是提取后再清洗过的，而 PDF 文本层里可能多空格、少空格，
 * 甚至把一句话拆进好几个 span。两边都去掉空白再匹配，命中率最高；
 * 命中后再把字符下标映射回原始的 (文本节点, 偏移)，高亮范围就精确了。
 */

const BLANK = /\s/

/** 把容器里的可见文字压成「无空白字符串 + 每个字符落在哪个节点的第几位」。 */
function indexText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.data || !node.data.trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const nodes = []
  const chars = []
  // 扁平存 [节点下标, 偏移, 节点下标, 偏移, ...]：几千个字也不会造出几千个对象
  const spots = []

  let node = walker.nextNode()
  while (node) {
    const nodeIndex = nodes.length
    nodes.push(node)
    const data = node.data
    for (let i = 0; i < data.length; i += 1) {
      const ch = data[i]
      if (BLANK.test(ch)) continue
      chars.push(ch)
      spots.push(nodeIndex, i)
    }
    node = walker.nextNode()
  }

  return { text: chars.join(''), nodes, spots }
}

/** 无空白版本：只用来比对，不用来显示。 */
export function squash(text) {
  return String(text || '').replace(/\s+/g, '')
}

function makeRange(nodes, spots, at, length) {
  const startNode = nodes[spots[at * 2]]
  const startOffset = spots[at * 2 + 1]
  const last = at + length - 1
  const endNode = nodes[spots[last * 2]]
  const endOffset = spots[last * 2 + 1]
  if (!startNode || !endNode) return null

  try {
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    // 结束位置要 +1：Range 的 end 是开区间
    range.setEnd(endNode, endOffset + 1)
    return range
  } catch {
    // 节点在查找之后被 React 换掉了（重新渲染 / 翻页），这一条就放弃
    return null
  }
}

/**
 * 在 root 里找 needle 对应的 Range。
 *
 * 从整句开始试，找不到再逐步缩短——原句常常被跨页、跨单元格切断，
 * 而前 16 个字几乎总能落在同一个文本节点里。缩短只在「完全找不到」时发生，
 * 不会把定位偏移到别的句子上（前提是这 16 个字在合同里不重复）。
 */
export function rangeForText(root, needle) {
  const target = squash(needle)
  if (!root || target.length < 4) return null

  const { text, nodes, spots } = indexText(root)
  if (!text) return null

  const tries = [target.length, 40, 24, 16].filter((len, i, arr) => len <= target.length && arr.indexOf(len) === i)

  for (const len of tries) {
    const probe = target.slice(0, len)
    const at = text.indexOf(probe)
    if (at !== -1) return makeRange(nodes, spots, at, len)
  }

  return null
}

/** 浏览器支不支持 Custom Highlight API（Chrome 105+ / Safari 17.2+ / Firefox 140+）。 */
export function supportsHighlight() {
  return typeof CSS !== 'undefined' && typeof CSS.highlights?.set === 'function' && typeof Highlight === 'function'
}

export function setHighlight(name, ranges) {
  if (!supportsHighlight()) return
  if (!ranges?.length) {
    CSS.highlights.delete(name)
    return
  }
  CSS.highlights.set(name, new Highlight(...ranges))
}

export function clearHighlights(names = []) {
  if (!supportsHighlight()) return
  names.forEach((name) => CSS.highlights.delete(name))
}

/** 把这段文字滚到视野中间。highlight 不支持也能用，因为 Range 本身就有位置。 */
export function scrollRangeIntoCenter(host, range) {
  if (!host || !range) return
  const rect = range.getBoundingClientRect()
  if (!rect.width && !rect.height) return
  const hostRect = host.getBoundingClientRect()
  const target = host.scrollTop + (rect.top - hostRect.top) - hostRect.height / 2 + rect.height / 2
  host.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
}
