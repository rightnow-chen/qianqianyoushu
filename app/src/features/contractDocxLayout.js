// 合同导出统一版式（V0.3）：批注版与修订版共用，保证两版排版一致。
//
// 两条规则：
// 1. **两版同版式**：页边距 / 字体 / 行距 / 页眉页码 / 标题栏 / 签署栏 / 段落样式
//    全部走这里，批注版与修订版只有「正文标记」不同（红字下划线 vs 黄色高亮+批注锚点）。
// 2. **按来源分骨架**：
//    - template（文本 / 图片 / 粘贴 / 演示数据）：原文没有可依赖的排版，套规范骨架——
//      合同编号、居中标题、甲乙方信息栏、条款、文末双方签章栏、页脚页码。结构参照
//      住建部门与市场监管部门发布的《房屋租赁合同》示范文本通用做法，不宣称是某一具体地方法定版本。
//    - preserve（真实 Word / PDF 上传）：原文通常自带结构，保留原文段落顺序与自带编号 /
//      甲乙方行，不重复套模板、不补签章栏，只统一字体 / 页边距 / 页眉页码。
//
// 诚实边界：PDF 是固定版式，docx 无法逐像素还原；Word 当前是提取文字后重建，
// 「保持一致」指段落结构层面，不是字节级复刻。

export const LAYOUT = {
  font: 'SimSun', // 宋体
  bodySize: 24, // 小四 = 12pt
  titleSize: 34, // 小二偏小，居中标题
  metaSize: 19, // 合同编号 / 副标题 / 免责声明
  partySize: 22,
  lineBody: 360, // 1.5 倍行距（docx: 240 = 单倍）
  lineTight: 300,
  firstLineIndent: 480, // 首行缩进 2 字符（小四 24 × 2）
  marginMm: { top: 25, right: 26, bottom: 25, left: 28 },
}

const CONTRACT_NO_RE = /^\s*合同编号\s*[:：]/
const TITLE_RE = /^\s*(房屋租赁合同|租赁合同|房屋租赁协议)\s*$/
// 甲乙方信息行须是「甲方：」「甲方（出租方）：」「出租人（甲方）：」这类带冒号/括号的标识行，
// 不能只凭开头两个字符——否则「甲方将房屋出租给乙方」这种正文也会被误判成信息行。
const PARTY_RE = /^\s*(?:共同出租人|共同承租人|共有出租人|出租人|出租方|承租人|承租方|甲方|乙方|委托代理人)\s*(?:[（(][^）)]*[）)])?\s*[:：]/
const HEADING_RE = /^\s*(?:第[一二三四五六七八九十百零]+条|[一二三四五六七八九十]+\s*[、.．]|[（(][一二三四五六七八九十]+[)）])/
const ANNEX_RE = /^\s*(?:附件|附表|附录)\b/

/** 判定骨架类型。isDemo 或 fileKind 决定；演示数据一律按 template 展示规范效果。 */
export function resolveProfile({ isDemo = false, fileKind = '' } = {}) {
  if (isDemo) return 'template'
  const kind = String(fileKind || '').toUpperCase()
  if (/^(DOC|DOCX|PDF)$/.test(kind)) return 'preserve'
  return 'template' // TXT / MD / 图片 OCR / 粘贴
}

/** 分类一行的角色，供 template 提取合同编号 / 标题 / 甲乙方栏，供段落统一样式。 */
export function classifyLine(line) {
  const t = String(line || '')
  if (CONTRACT_NO_RE.test(t)) return 'contractNo'
  if (TITLE_RE.test(t)) return 'title'
  if (PARTY_RE.test(t)) return 'party'
  if (HEADING_RE.test(t) || ANNEX_RE.test(t)) return 'heading'
  return 'body'
}

/** 页面设置：两版、两种 profile 完全一致。 */
export function pageProperties(Api) {
  const { convertMillimetersToTwip } = Api
  const m = LAYOUT.marginMm
  return {
    page: {
      margin: {
        top: convertMillimetersToTwip(m.top),
        right: convertMillimetersToTwip(m.right),
        bottom: convertMillimetersToTwip(m.bottom),
        left: convertMillimetersToTwip(m.left),
      },
    },
  }
}

/** 页眉页脚：两版一致。页脚居中页码，页眉右侧标版本，不编造任何数字。 */
export function headerFooter(Api, { versionName = '' } = {}) {
  const { Header, Footer, Paragraph, TextRun, PageNumber, AlignmentType } = Api
  return {
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: versionName ? `签前有数 · 合同${versionName}` : '签前有数 · 合同审查',
                font: LAYOUT.font,
                size: 18,
                color: '8A887E',
              }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                children: ['第 ', PageNumber.CURRENT, ' 页 / 共 ', PageNumber.TOTAL_PAGES, ' 页'],
                font: LAYOUT.font,
                size: 18,
                color: '8A887E',
              }),
            ],
          }),
        ],
      }),
    },
  }
}

/**
 * 段落外壳属性（对齐 / 缩进 / 行距）：段落样式的唯一来源。
 * 修订版与批注版都调用它，保证正文段落排版完全一致。
 */
export function bodyParaProps(Api, role) {
  const { AlignmentType } = Api
  const isHeading = role === 'heading'
  const isParty = role === 'party'
  const isContractNo = role === 'contractNo'
  const isTitle = role === 'title'
  return {
    alignment: isTitle || isContractNo ? AlignmentType.CENTER : isParty ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
    indent: isParty || isHeading || isTitle || isContractNo ? undefined : { firstLine: LAYOUT.firstLineIndent },
    spacing: isHeading || isTitle
      ? { before: 200, after: 100, line: LAYOUT.lineTight }
      : isParty || isContractNo
        ? { after: 60, line: LAYOUT.lineTight }
        : { after: 120, line: LAYOUT.lineBody },
  }
}

/**
 * 正文段落统一样式：两版、两种 profile 共用同一个函数，只有 runs 内容不同。
 * para.runs 元素形如 { text, options } 或 { node }（ CommentRangeStart / CommentReference 等原生组件）。
 */
export function renderBodyPara(Api, para, profile) {
  const { Paragraph, TextRun } = Api
  const trimmed = String(para.text || '').trim()
  const role = para.role || classifyLine(trimmed)
  const isHeading = role === 'heading'
  const isParty = role === 'party'
  const isContractNo = role === 'contractNo'
  const isTitle = role === 'title'

  const children = []
  para.runs.forEach((item) => {
    if (item.node) {
      children.push(item.node)
      return
    }
    const o = item.options || {}
    children.push(
      new TextRun({
        text: item.text,
        font: LAYOUT.font,
        size: o.size || (isTitle ? LAYOUT.titleSize : isParty ? LAYOUT.partySize : LAYOUT.bodySize),
        bold: o.bold != null ? o.bold : isHeading || isTitle,
        color: o.color || (isContractNo ? '8A887E' : '171713'),
        underline: o.underline ? { type: 'single' } : undefined,
        highlight: o.highlight,
        strike: o.strike || false,
      }),
    )
  })

  return new Paragraph({ ...bodyParaProps(Api, role), children })
}

