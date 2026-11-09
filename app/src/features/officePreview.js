/**
 * Word（.docx）的原样式渲染。
 *
 * 为什么不用 Office Online / WPS WebOffice：
 * 那两套都要文件有公网可访问的 HTTPS 地址（微软或金山得先把文件抓走），
 * 我们做的是「不存储、本地审查」，把合同传给第三方是最不能碰的红线；
 * 而且它们要后端签名 + 商业授权，纯静态站根本起不来。
 *
 * docx-preview 是纯前端：读 OOXML、还原字体/字号/缩进/表格/分页/页眉页脚，
 * 输出的是真 DOM——这意味着后面「点右侧风险 → 左侧高亮第几段」能直接做，
 * 而 canvas 画出来的 PDF 做不到这件事。
 *
 * 代价：字体得靠本机有（宋体/仿宋 Windows 自带，macOS 会 fallback）。
 */

const DOCX_OPTIONS = {
  className: 'docx',
  inWrapper: true,
  breakPages: true,
  // 保留原始页面尺寸（A4 / Letter），宽度靠 fitDocxToWidth 整体缩放。
  // 设成 true 会把页面压成 100% 宽，行宽变了分页也就乱了
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: false,
  // 合同里带着修订痕迹（甲乙方来回改的那种）时，原样显示更有说服力
  renderChanges: true,
  renderComments: false,
  experimental: false,
  useBase64URL: true,
  trimXmlDeclaration: true,
  hideWrapperOnPrint: true,
}

/** 渲染 docx 到容器。返回页数、wrapper 与释放方法。 */
export async function renderDocx(host, file) {
  // 动态导入：只有真的上传了 Word 才下载这个 parser（解压 + 解析 OOXML 不轻）
  const { renderAsync } = await import('docx-preview')
  const buffer = await file.arrayBuffer()
  // styleContainer 传 host：docx 自带的样式表（字号、行距、列表编号）
  // 只作用于这个容器，不会污染全局
  await renderAsync(buffer, host, host, DOCX_OPTIONS)

  const wrapper = host.querySelector('.docx-wrapper')
  const pages = wrapper ? [...wrapper.querySelectorAll('section.docx')] : []

  return {
    pageCount: pages.length,
    wrapper,
    destroy() {
      host.innerHTML = ''
    },
  }
}

/**
 * 等比缩放到容器宽度内。
 *
 * 用 CSS zoom 而不是 transform scale：zoom 会真实改变布局尺寸，
 * 页面居中、容器高度都自动正确；transform 只改绘制，得手动补高度、
 * 还会让居中失效。zoom 在 Chrome / Edge / Safari 早已支持，Firefox 126+ 也有。
 */
export function fitDocxToWidth(host, wrapper) {
  if (!host || !wrapper) return 1
  const page = wrapper.querySelector('section.docx')
  if (!page) return 1

  // 先清掉上一次的 zoom，否则量到的是缩放后的宽度，会越缩越小
  wrapper.style.zoom = ''
  const available = host.clientWidth
  const natural = page.offsetWidth
  if (!available || !natural) return 1

  const scale = Math.min(1, available / natural)
  if (scale < 0.999) wrapper.style.zoom = String(Number(scale.toFixed(4)))
  return scale
}

/** 滚到第 n 页（1 起）。用 getBoundingClientRect 换算，zoom 与否都准。 */
export function scrollToDocxPage(host, wrapper, pageNumber) {
  const page = wrapper?.querySelectorAll('section.docx')[pageNumber - 1]
  if (!page || !host) return
  const hostTop = host.getBoundingClientRect().top
  host.scrollTo({ top: host.scrollTop + page.getBoundingClientRect().top - hostTop - 8, behavior: 'smooth' })
}

/** 当前露得最多的那一页（1 起）。滚动时调用。 */
export function currentDocxPage(host, wrapper) {
  const pages = wrapper ? [...wrapper.querySelectorAll('section.docx')] : []
  if (!pages.length || !host) return 1
  const hostRect = host.getBoundingClientRect()
  const middle = hostRect.top + hostRect.height / 2

  let best = 1
  let bestOverlap = -1
  pages.forEach((page, index) => {
    const rect = page.getBoundingClientRect()
    const overlap = Math.min(rect.bottom, hostRect.bottom) - Math.max(rect.top, hostRect.top)
    if (rect.top <= middle && rect.bottom >= middle) {
      best = index + 1
      bestOverlap = Infinity
    } else if (bestOverlap !== Infinity && overlap > bestOverlap) {
      best = index + 1
      bestOverlap = overlap
    }
  })
  return best
}
