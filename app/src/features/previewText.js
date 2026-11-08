/**
 * 拍照识别 / 文本粘贴得到的合同正文，怎么在「识别文字」里分段。
 *
 * 原则：不假装还原了版式，但也不能把几千字连成一片——人要能一眼找到条款。
 * 三类：标题（居中）、条款标题（加粗）、正文。
 */
import { relayoutContractText, tidyContractText } from '../utils/text.js'

// 「第X条」「一、」「（一）」开头，都是合同里天然的段落边界
const CLAUSE_LINE = /^(第[一二三四五六七八九十百0-9]{1,4}条|[一二三四五六七八九十]{1,3}、|（[一二三四五六七八九十]{1,3}）)/

// 首行是标题的判据：短、没有句读。太严格会漏，太松会把正文首段当标题。
const TITLE_MAX = 24

/** @returns {{ type: 'title'|'clause'|'body', text: string }[]} */
export function layoutContractLines(text = '') {
  // 先 tidy：OCR 常在汉字之间塞空格（「押 金」），读起来费劲；
  // 再 relayout：把挤在一行里的条款重新断开。
  const lines = relayoutContractText(tidyContractText(text))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.map((line, index) => {
    if (index === 0 && line.length <= TITLE_MAX && !/[。；：]/.test(line)) {
      return { type: 'title', text: line }
    }
    if (CLAUSE_LINE.test(line)) {
      // 「第一条房屋基本情况」挤在一起难读，条款号后补一个全角空格
      return { type: 'clause', text: line.replace(/^(第[一二三四五六七八九十百0-9]{1,4}条)(?=\S)/, '$1　') }
    }
    return { type: 'body', text: line }
  })
}
