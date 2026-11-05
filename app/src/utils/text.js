export function formatEvidenceDate(value) {
  if (!value) return '待确认'
  return value
}

const CJK_JOIN_RE = new RegExp(
  '([\\u3400-\\u9fff\\uf900-\\ufaff\\u3001-\\u303f\\uff01-\\uff5e\\u2018\\u2019\\u201c\\u201d\\u2026\\u2014\\u00b7])'
    + '[ \\t\\u3000]+'
    + '(?=[\\u3400-\\u9fff\\uf900-\\ufaff\\u3001-\\u303f\\uff01-\\uff5e\\u2018\\u2019\\u201c\\u201d\\u2026\\u2014\\u00b7])',
  'g',
)

/**
 * 剥离 Markdown / AI 生成文本的排版标记，只动「标记」不动正文：
 * - 行首标题井号（「# 房屋租赁合同」→「房屋租赁合同」，# 到 ###### 均支持）
 * - 行内加粗/斜体星号（「**押金**」→「押金」）
 * - 行首星号列表符（「* 条款」→「条款」）
 * - 整行分隔线（仅由 --- 或 === 组成的行）
 * 日期、编号中的连字符与签署栏下划线不受影响。
 */
export function stripMarkdownMarkers(text) {
  return String(text || '')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/\*{2,}([^*\n]+?)\*{2,}/g, '$1')
    .replace(/^[ \t]*\*[ \t]+/gm, '')
    .replace(/^[ \t]*(?:-{3,}|={3,})[ \t]*$/gm, '')
}

/**
 * 按合同固有结构重排文本，让「一整块」解析结果变成清晰的条款排版：
 * - 条款编号前断行：。/；之后跟「一、」「（一）」「第X条」时另起一行
 * - 当事人与签署字段前断行：甲方（出租人）、乙方（承租人）、甲方签字、
 *   签订日期、身份证号、联系电话、房屋坐落等字段另起一行
 * 只插入换行、不删内容；已经排好版的文本（标记位于行首）原样保留，可幂等重入。
 */
export function relayoutContractText(text) {
  return String(text || '')
    // 编号标记前断行；标记前已有换行（已排版）时保留原样，保证幂等
    .replace(/([。；！？])(\s*)(?=[一二三四五六七八九十]{1,3}、|（[一二三四五六七八九十]{1,3}）|第[一二三四五六七八九十百0-9]{1,4}条)/g,
      (_, punct, ws) => (ws.includes('\n') ? `${punct}${ws}` : `${punct}\n`))
    .replace(/(?!^)(?<!\n)((?:甲方|乙方|出租方|承租方)（(?:出租人|出租方|承租人|承租方|甲方|乙方)）|(?:甲方|乙方|出租方|承租方)[：:]|(?:甲方|乙方)(?:签字|签章|盖章)|签订日期|签约日期|签署日期|身份证号|联系电话|房屋坐落|房屋[：:])/g, '\n$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 整理 OCR / PDF 提取的合同文本：
 * - 剥离 Markdown 排版标记（AI 生成的合同常带 # 标题、**加粗**）
 * - 去掉被插入到汉字、中文标点之间的空格（如「身 份 证 号」→「身份证号」）
 * - 全角空格转普通空格，合并连续空白，去掉行尾空格与多余空行
 * - 数字、英文与中文之间的空格保持原样（如「星河湾 8 栋」）
 */
export function tidyContractText(text) {
  return stripMarkdownMarkers(
    String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u3000/g, ' '),
  )
    .replace(CJK_JOIN_RE, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function compactText(text, maxLength = 1200) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized

  return `${normalized.slice(0, maxLength)}...`
}
