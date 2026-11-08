import { useEffect, useMemo, useRef, useState } from 'react'
import { createImageUrl, openPdfPreview } from '../../features/filePreview.js'
import { layoutContractLines } from '../../features/previewText.js'

/** PDF 原页渲染：一次解析，翻页复用；卸载时释放 pdf 文档。 */
function PdfPages({ file, pageCount }) {
  const [page, setPage] = useState(1)
  // 用「失败的是第几页」而不是一个布尔值：翻页后旧错误自动失效，不用在 effect 里清状态
  const [failure, setFailure] = useState({ page: 0, message: '' })
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const docRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const draw = async () => {
      try {
        if (!docRef.current) {
          const opened = await openPdfPreview(file)
          // 解析期间用户切走了：这时不能把句柄留在 ref 里，直接销毁，否则 worker 泄漏
          if (cancelled) {
            opened.destroy()
            return
          }
          docRef.current = opened
        }
        if (cancelled || !canvasRef.current) return
        const width = wrapRef.current?.clientWidth || 520
        await docRef.current.render(page, canvasRef.current, Math.min(width, 620))
      } catch {
        if (!cancelled) setFailure({ page, message: '这一页没能渲染出来，可以切到「识别文字」看提取结果。' })
      }
    }

    draw()
    return () => {
      cancelled = true
    }
  }, [file, page])

  useEffect(
    () => () => {
      docRef.current?.destroy()
      docRef.current = null
    },
    [],
  )

  const total = pageCount || 1

  return (
    <div className="pdf-preview" ref={wrapRef}>
      {pageCount > 1 && (
        <div className="pdf-pager">
          <button className="btn xs" type="button" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
            ←
          </button>
          <span>
            第 {page} / {total} 页
          </span>
          <button
            className="btn xs"
            type="button"
            disabled={page >= total}
            onClick={() => setPage((n) => Math.min(total, n + 1))}
          >
            →
          </button>
        </div>
      )}
      {failure.page === page ? <div className="warn-strip">{failure.message}</div> : null}
      <canvas ref={canvasRef} className="pdf-canvas" />
    </div>
  )
}

function ImagePreview({ file }) {
  const url = useMemo(() => (file ? createImageUrl(file) : ''), [file])

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )

  if (!url) return null
  return (
    <div className="pdf-preview">
      <img src={url} alt="上传的合同照片" className="pdf-canvas" />
    </div>
  )
}

// 「第X条」「一、」「（一）」开头的行当成小标题；合同正文几乎都是这个结构。

/**
 * 纯文字稿：OCR 结果和 TXT 都走这里。
 * 不假装有版式，但至少把标题、条款标题和正文分开——一坨密密麻麻的字没人看。
 */
function TextPaper({ text, emptyHint }) {
  const lines = useMemo(() => layoutContractLines(text), [text])

  if (!lines.length) return <div className="mini-paper"><div className="mp-plain">{emptyHint}</div></div>

  return (
    <div className="mini-paper">
      {lines.map((line, index) => {
        const key = `${index}-${line.text.slice(0, 8)}`
        if (line.type === 'title') return <div className="mp-title" key={key}>{line.text}</div>
        if (line.type === 'clause') return <div className="mp-clause" key={key}>{line.text}</div>
        return <p key={key}>{line.text}</p>
      })}
    </div>
  )
}

/** Word 的排版还原不了，但标题 / 段落 / 列表层级还是原样。 */
function WordText({ structure, text }) {
  if (!structure?.length) return <TextPaper text={text} emptyHint="（这份文件里没有提取到文字）" />
  return (
    <div className="mini-paper word-paper">
      {structure.map((node, index) => {
        const key = `${node.type}-${index}`
        if (node.type === 'heading') return <div className="mp-clause" key={key}>{node.text}</div>
        if (node.type === 'list') return <p className="mp-li" key={key}>· {node.text}</p>
        if (node.type === 'table') return <pre className="mp-table" key={key}>{node.text}</pre>
        return <p key={key}>{node.text}</p>
      })}
    </div>
  )
}

export default function PaperPreview({ kind, file, text, structure, pageCount, mode }) {
  // 拍照才有「原件 / 识别文字」两档：第二档是 OCR 出来的字，排好给人核对
  if (mode === 'text') return <TextPaper text={text} emptyHint="这张照片没识别出文字，换一张更清晰的照片，或直接粘贴合同文字。" />
  if (kind === 'pdf' && file) return <PdfPages file={file} pageCount={pageCount} />
  if (kind === 'image' && file) return <ImagePreview file={file} />
  if (kind === 'word') return <WordText structure={structure} text={text} />
  return <TextPaper text={text} emptyHint="（这份文件里没有提取到文字）" />
}
