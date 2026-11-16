/**
 * 确认页左侧「原文预览」的数据源。
 *
 * 原则：能显示原件就显示原件，不能显示原件就说清为什么。
 * - PDF：交给 pdf.js 渲染成图片，就是用户上传的那一页（能看出印章、表格、排版）
 * - 图片：直接显示原图
 * - Word：浏览器无法还原 Word 排版，退而渲染最接近原文层级的标题/段落/列表
 * - TXT / 粘贴：没有版式，显示提取文本
 *
 * 之前这一栏是写死的示例合同，跟用户传什么文件无关——这是 bug，不是设计。
 */

const PDF_EXTENSIONS = ['pdf']
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'heic']

function extensionOf(fileName = '') {
  return String(fileName).split('.').pop()?.toLowerCase() || ''
}

/**
 * @param {{ fileName?: string, source?: string, mime?: string }} input
 * @returns {'pdf'|'image'|'word'|'text'}
 */
export function previewKindOf({ fileName = '', source = '', mime = '' } = {}) {
  const extension = extensionOf(fileName)
  if (PDF_EXTENSIONS.includes(extension) || source === 'PDF') return 'pdf'
  if (IMAGE_EXTENSIONS.includes(extension) || String(mime).startsWith('image/')) return 'image'
  if (source === 'Word' || ['docx', 'doc'].includes(extension)) return 'word'
  return 'text'
}

/**
 * 打开 PDF 并返回渲染句柄。同一个文件只解析一次，翻页时复用。
 * 用 legacy 构建的理由与 fileImport.js 相同：标准构建在旧内核里会直接抛异常。
 */
export async function openPdfPreview(file) {
  const [{ default: workerUrl }, pdfjsLib] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
    import('pdfjs-dist/legacy/build/pdf.mjs'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const buffer = await file.arrayBuffer()
  // pdfjs 6 的 PDFDocumentProxy 没有 destroy()，只有 cleanup()；
  // 要真正释放 worker 必须留着 loadingTask 再销毁它。
  // 之前直接调 pdf.destroy()，卸载这个组件时抛 TypeError，整页 React 树被带走→白屏。
  const task = pdfjsLib.getDocument({ data: buffer })
  const pdf = await task.promise

  return {
    numPages: pdf.numPages,
    async render(pageNumber, canvas, maxWidth = 560) {
      const page = await pdf.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      // 上限 2 倍：再高只是浪费内存，屏幕上分辨不出来
      const scale = Math.min(maxWidth / base.width, 2)
      const viewport = page.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)

      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      const context = canvas.getContext('2d')
      context.save()
      context.scale(ratio, ratio)
      // 白底：PDF 背景透明时，深色模式下不铺白会看不清黑字
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, viewport.width, viewport.height)
      await page.render({ canvasContext: context, viewport }).promise
      context.restore()
    },
    /**
     * 把一页装进容器：先是空白画布 + 透明文本层，返回一个 draw() 用来补画面。
     *
     * 为什么拆成两步：一份 22 页的合同如果「画完一页再画下一页」，
     * 要等五六秒才能看到全部文字，中间左边一直是白的。
     * 文本层是纯 DOM，建起来快，所以先把所有页的文字层搭好——
     * 这样定位、高亮、选中复制立刻可用，canvas 再一页一页慢慢补。
     *
     * 只有 canvas 不行：画得再像也只是张图，点哪儿都定位不了。
     */
    async preparePage(pageNumber, host, maxWidth = 720) {
      const page = await pdf.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(maxWidth / base.width, 3)
      const viewport = page.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.floor(viewport.width)
      const height = Math.floor(viewport.height)

      host.textContent = ''
      host.style.width = `${width}px`
      host.style.height = `${height}px`
      // pdf.js 的文本层靠这两个变量换算字号，少一个文字就会挤成一团
      host.style.setProperty('--scale-factor', String(scale))
      host.style.setProperty('--total-scale-factor', String(scale))

      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      // 先铺白：深浅色主题下透明画布会透出容器底色，字就糊在灰里了
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      host.appendChild(canvas)

      const textContent = await page.getTextContent()
      const textHost = document.createElement('div')
      textHost.className = 'textLayer'
      host.appendChild(textHost)

      const layer = new pdfjsLib.TextLayer({ textContentSource: textContent, container: textHost, viewport })
      await layer.render()
      // setLayerDimensions 用的是 CSS round()，万一内核不支持会算出 0 宽，兜个底
      textHost.style.width = `${width}px`
      textHost.style.height = `${height}px`

      let drawn = false
      return {
        width,
        height,
        hasText: textContent.items.some((item) => item.str?.trim()),
        async draw() {
          if (drawn) return
          drawn = true
          context.save()
          context.scale(ratio, ratio)
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, viewport.width, viewport.height)
          await page.render({ canvasContext: context, viewport }).promise
          context.restore()
        },
      }
    },
    /** 卸载时释放：销毁 loadingTask（proxy 本身没有 destroy）。失败不影响界面。 */
    destroy() {
      try {
        const pending = task.destroy()
        if (pending?.catch) pending.catch(() => {})
      } catch {
        // 文档还没加载完就卸载了，worker 会自己回收
      }
    },
  }
}

/** 图片预览用的临时 URL，组件卸载时要 revoke。 */
export function createImageUrl(file) {
  return URL.createObjectURL(file)
}
