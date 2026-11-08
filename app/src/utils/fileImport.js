import {
  CONTRACT_IMAGE_MIME_PATTERN,
  CONTRACT_IMPORT_MAX_BYTES,
  CONTRACT_PDF_EXTENSIONS,
  CONTRACT_TEXT_EXTENSIONS,
  CONTRACT_WORD_EXTENSIONS,
} from '../constants/contractImport.js'
import { relayoutContractText, tidyContractText } from './text.js'

/**
 * 面向用户的导入错误：message 一定是人话，可以直接弹出来。
 * 底层库抛的异常（mammoth / pdfjs / tesseract）一律不进 UI，
 * 否则用户看到的是 `hashOriginal.toHex is not a function` 这种只有开发者看得懂的东西。
 */
export class ContractImportError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ContractImportError'
  }
}

const fail = (message) => {
  throw new ContractImportError(message)
}

function getFileExtension(fileName) {
  return String(fileName || '').split('.').pop()?.toLowerCase() || ''
}

/** 兜底文案：按文件类型给出「下一步能做什么」，而不是只说一句读不出来。 */
function fallbackMessageFor(file) {
  const extension = getFileExtension(file?.name)
  if (CONTRACT_PDF_EXTENSIONS.includes(extension)) {
    return '这份 PDF 没能读出来。扫描件或加密 PDF 常见这种情况——可以改成截图上传，或直接把合同文字粘贴进来。'
  }
  if (CONTRACT_WORD_EXTENSIONS.includes(extension)) {
    return '这份 Word 没能读出来。可以另存为 PDF 再试，或直接把合同文字粘贴进来。'
  }
  if (CONTRACT_IMAGE_MIME_PATTERN.test(String(file?.type || ''))) {
    return '这张图片没能识别出来。换一张更清晰、正对合同正文的照片，或直接粘贴文字。'
  }
  return '这份文件没能读出来。换一份文件，或直接把合同文字粘贴进来。'
}

function isSupportedContractFile(file) {
  if (!file) return false

  const extension = getFileExtension(file.name)
  return (
    CONTRACT_TEXT_EXTENSIONS.includes(extension)
    || CONTRACT_WORD_EXTENSIONS.includes(extension)
    || CONTRACT_PDF_EXTENSIONS.includes(extension)
    || CONTRACT_IMAGE_MIME_PATTERN.test(file.type)
  )
}

function isUsableOcrText(text, confidence) {
  const normalized = String(text || '').trim()
  const readableChars = normalized.match(/[\p{Script=Han}A-Za-z]/gu) || []
  const digitOnly = normalized && /^[\d\s.,:;/-]+$/.test(normalized)

  return normalized.length >= 12 && readableChars.length >= 6 && !digitOnly && Number(confidence || 0) >= 35
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError')
}

async function extractPdfText(file, signal) {
  throwIfAborted(signal)
  // 必须用 legacy 构建：pdfjs-dist 6.x 的标准构建依赖 Uint8Array.prototype.toHex
  // （ES2026 新方法，Chrome/Edge 133+ 才原生支持）。在更旧的浏览器里，
  // 解析 PDF 时会在 pdf.worker 内部抛 `hashOriginal.toHex is not a function`，
  // 表现为「文件根本传不上去」。legacy 构建自带同等功能的 polyfill，代价是包略大。
  const [{ default: pdfWorkerUrl }, pdfjsLib] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
    import('pdfjs-dist/legacy/build/pdf.mjs'),
  ])

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const buffer = await file.arrayBuffer()
  throwIfAborted(signal)
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, index) => {
      throwIfAborted(signal)
      const page = await pdf.getPage(index + 1)
      const content = await page.getTextContent()
      return content.items.map((item) => item.str).join(' ')
    }),
  )

  const text = tidyContractText(pages.join('\n\n'))

  // 扫描件（拍照转成的 PDF）没有文字层，pdf.js 只能抽出零星页码。
  // 这种情况必须明说，否则用户会拿着一份空合同走到确认页，以为产品坏了。
  const readable = text.match(/[\p{Script=Han}A-Za-z]/gu) || []
  if (readable.length < 30) {
    fail('这份 PDF 里没有可以选中的文字，应该是扫描件或拍照转的 PDF。请改用「拍照上传」，或把合同截图后上传，会走文字识别。')
  }

  return text
}

async function extractDocxText(file, signal) {
  throwIfAborted(signal)
  const mammoth = await import('mammoth/mammoth.browser')
  const buffer = await file.arrayBuffer()
  throwIfAborted(signal)
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })

  return String(result.value || '').trim()
}

// 把 mammoth convertToHtml 的 HTML 解析成结构化段落，保真 Word 的标题/段落/列表层级
function parseDocxHtmlToStructure(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const nodes = []

  const pushText = (type, text, extra = {}) => {
    const trimmed = String(text || '').trim()
    if (trimmed) nodes.push({ type, text: trimmed, ...extra })
  }

  const walkList = (container) => {
    [...container.children].forEach((child) => {
      if (child.tagName.toLowerCase() === 'li') {
        // 嵌套列表：li 里可能还有 ul/ol
        const nested = child.querySelector('ul,ol')
        if (nested) {
          pushText('list', child.textContent)
          walkList(nested)
        } else {
          pushText('list', child.textContent)
        }
      } else if (/^(UL|OL)$/.test(child.tagName)) {
        walkList(child)
      } else {
        pushText('para', child.textContent)
      }
    })
  }

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText('para', node.textContent)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const tag = node.tagName.toLowerCase()
    const text = node.textContent.trim()
    if (!text) return

    if (/^h[1-6]$/.test(tag)) {
      nodes.push({ type: 'heading', text, level: Number(tag[1]) })
    } else if (tag === 'li') {
      pushText('list', text)
    } else if (tag === 'table') {
      // 表格转成带分隔的行，保持可读
      const rows = [...node.querySelectorAll('tr')].map((tr) =>
        [...tr.querySelectorAll('td,th')].map((cell) => cell.textContent.trim()).join('  |  '),
      )
      pushText('table', rows.join('\n'))
    } else if (/^(ul|ol)$/.test(tag)) {
      walkList(node)
    } else {
      pushText('para', text)
    }
  })
  return nodes
}

async function extractDocxStructure(file, signal) {
  throwIfAborted(signal)
  const mammoth = await import('mammoth/mammoth.browser')
  const buffer = await file.arrayBuffer()
  throwIfAborted(signal)
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })

  return parseDocxHtmlToStructure(String(result.value || ''))
}

async function extractImageTextWithOcr(file, { signal, localOnly = false } = {}) {
  throwIfAborted(signal)
  if (localOnly) {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker(['chi_sim', 'eng'], 1, {
      logger: () => {},
    })
    const abort = () => worker.terminate()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const result = await worker.recognize(file)
      throwIfAborted(signal)
      const text = tidyContractText(result?.data?.text)
      const confidence = Number(result?.data?.confidence || 0)
      if (!isUsableOcrText(text, confidence)) {
        fail(`本地 OCR 结果过弱，置信度 ${confidence || 0}%，请换更清晰的照片或改用文本粘贴`)
      }
      return { text, confidence, mode: 'browser-local-tesseract' }
    } finally {
      signal?.removeEventListener('abort', abort)
      await worker.terminate()
    }
  }
  const formData = new FormData()
  formData.append('image', file)

  const response = await fetch('/api/ocr/image', {
    method: 'POST',
    signal,
    body: formData,
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    fail(data?.message || '图片识别失败，请稍后重试，也可以直接粘贴合同文字')
  }

  const text = tidyContractText(data.text)
  const confidence = Number(data.confidence || 0)

  if (!isUsableOcrText(text, confidence)) {
    fail(`图片 OCR 结果过弱，置信度 ${confidence || 0}%，请换更清晰的照片或改用文本粘贴`)
  }

  return {
    text,
    confidence,
    mode: data.mode || 'offline-tesseract',
  }
}

async function runImport(file, options = {}) {
  if (!file) {
    fail('请选择要导入的合同文件')
  }
  if (file.size > CONTRACT_IMPORT_MAX_BYTES) {
    fail('文件超过 8MB，请压缩后再上传')
  }
  if (!isSupportedContractFile(file)) {
    fail('当前支持 TXT、MD、DOCX、PDF 和图片格式')
  }

  const extension = getFileExtension(file.name)

  if (CONTRACT_TEXT_EXTENSIONS.includes(extension)) {
    return {
      // TXT/MD 也要走归一化 + 重排：源文件可能是无换行的整块文本或带 Markdown 标记
      text: relayoutContractText(tidyContractText((await file.text()).trim())),
      type: '文本文件',
      source: 'TXT / MD',
    }
  }

  if (CONTRACT_WORD_EXTENSIONS.includes(extension)) {
    const [text, structure] = await Promise.all([
      extractDocxText(file, options.signal),
      extractDocxStructure(file, options.signal),
    ])
    return {
      // Word 单段落源文件（AI 生成内容直接粘进 Word）会解析成一整块，重排出条款结构
      text: relayoutContractText(tidyContractText(text)),
      structure,
      type: 'Word 合同',
      source: 'Word',
    }
  }

  if (CONTRACT_PDF_EXTENSIONS.includes(extension)) {
    return {
      text: relayoutContractText(await extractPdfText(file, options.signal)),
      type: 'PDF 合同',
      source: 'PDF',
    }
  }

  if (CONTRACT_IMAGE_MIME_PATTERN.test(file.type)) {
    const result = await extractImageTextWithOcr(file, options)

    return {
      text: relayoutContractText(result.text),
      type: `图片 OCR 合同（置信度 ${result.confidence || 0}%）`,
      source: '图片 OCR',
      confidence: result.confidence || 0,
      mode: result.mode,
    }
  }

  fail('当前支持 TXT、MD、DOCX、PDF 和图片格式')
}

/**
 * 对外入口：把「用户可读的错误」和「底层异常」分开。
 * 主动 fail() 的中文提示原样带出；解析库抛出的任何异常都收敛成一句人话，
 * 原始异常只写进控制台，方便定位而不吓到用户。
 */
export async function extractContractTextFromFile(file, options = {}) {
  try {
    return await runImport(file, options)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (error instanceof ContractImportError) throw error
    console.error('[contract-import] 解析失败，原始异常：', error)
    throw new ContractImportError(fallbackMessageFor(file))
  }
}
