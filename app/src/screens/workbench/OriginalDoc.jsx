import { useEffect, useMemo, useRef, useState } from 'react'
import { createImageUrl, openPdfPreview } from '../../features/filePreview.js'
import { fitDocxToWidth, renderDocx } from '../../features/officePreview.js'
import { sentenceNeedle } from '../../features/contractPages.js'
import {
  clearHighlights,
  rangeForText,
  scrollRangeIntoCenter,
  setHighlight,
} from '../../features/docHighlight.js'

const HIGHLIGHT_NAMES = ['risk-must', 'risk-check', 'risk-note', 'risk-active']

const SOURCE_LABEL = {
  pdf: 'PDF 原件',
  word: 'Word 原件',
  image: '合同照片',
  text: '合同原文',
}

const FAIL_COPY = {
  pdf: '这份 PDF 没能渲染出来（可能损坏或加密）。右边的内容仍是从文件里读出来的，可以导出一份带批注的 docx 对照。',
  word: '这份 Word 没能还原排版（可能加密、损坏，或本身是 .doc 改了后缀）。下面按段落显示文字。',
  image: '图片没能显示出来，重新上传一次试试。',
  text: '没有可显示的内容。',
}

/**
 * 在原件 DOM 上标出风险句，并把当前这条滚到视野中间。
 *
 * 两轮：先按等级铺一层淡色底（让人一眼看到「这份合同哪里有记号」），
 * 再把 activeId 那一条加深。找不到 range 就什么都不做——
 * 定位偏了比不定位更糟，右侧仍然有原句可以看。
 */
function useRiskHighlight({ rootRef, scrollRef, risks, activeId, locateSignal, ready, onPickRisk }) {
  const ranges = useRef(new Map())

  useEffect(() => {
    if (!ready) return undefined
    const root = rootRef.current
    if (!root) return undefined

    const bucket = { must: [], check: [], note: [] }
    const found = new Map()
    risks.forEach((risk) => {
      const range = rangeForText(root, sentenceNeedle(risk))
      if (!range) return
      found.set(risk.id, range)
      ;(bucket[risk.level] || bucket.note).push(range)
    })
    ranges.current = found

    setHighlight('risk-must', bucket.must)
    setHighlight('risk-check', bucket.check)
    setHighlight('risk-note', bucket.note)

    return () => clearHighlights(HIGHLIGHT_NAMES)
  }, [ready, risks, rootRef])

  useEffect(() => {
    if (!ready || !activeId) {
      clearHighlights(['risk-active'])
      return undefined
    }
    const range = ranges.current.get(activeId)
    if (!range) return undefined
    setHighlight('risk-active', [range])
    scrollRangeIntoCenter(scrollRef.current, range)
    return () => clearHighlights(['risk-active'])
  }, [activeId, locateSignal, ready, scrollRef])

  /**
   * 点原件上标过色的句子 → 跳到对应那条风险。
   * 高亮是浏览器画的，没有 DOM 节点可以挂 onClick，所以反过来：
   * 从点击位置取光标落点，再看它落在哪个已登记的 Range 里。
   * 用户正在框选文字时不触发，否则想复制一句话就被弹走了。
   */
  const handleClick = (event) => {
    if (!onPickRisk || !ranges.current.size) return
    if (window.getSelection()?.toString()) return
    const caret =
      document.caretRangeFromPoint?.(event.clientX, event.clientY) ||
      (() => {
        const pos = document.caretPositionFromPoint?.(event.clientX, event.clientY)
        if (!pos) return null
        const range = document.createRange()
        range.setStart(pos.offsetNode, pos.offset)
        range.collapse(true)
        return range
      })()
    if (!caret) return

    const node = caret.startContainer
    const offset = caret.startOffset
    for (const [riskId, range] of ranges.current) {
      if (range.isPointInRange(node, offset)) {
        onPickRisk(riskId)
        return
      }
    }
  }

  return handleClick
}

export default function OriginalDoc({ kind, file, risks, activeId, locateSignal, onPickRisk }) {
  const scrollRef = useRef(null)
  const rootRef = useRef(null)
  const docRef = useRef(null)
  const pageRefs = useRef([])
  const rafRef = useRef(0)

  const [width, setWidth] = useState(0)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(1)
  const [status, setStatus] = useState('loading')
  const [ready, setReady] = useState(false)

  const handleClick = useRiskHighlight({ rootRef, scrollRef, risks, activeId, locateSignal, ready, onPickRisk })

  // 图片的 objectURL 要在卸载时释放，但创建本身是纯计算，放 useMemo 里就不用 setState
  const imageUrl = useMemo(() => (kind === 'image' && file ? createImageUrl(file) : ''), [kind, file])
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    },
    [imageUrl],
  )

  // 栏宽决定每页画多大：宽度变了得重画，否则字会糊
  useEffect(() => {
    const host = scrollRef.current
    if (!host) return undefined
    const measure = () => {
      const next = host.clientWidth - 28
      if (next < 120) return
      setWidth((prev) => (Math.abs(prev - next) < 16 ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  // 释放 pdf worker（这一点在确认页踩过坑：pdfjs 6 只有 loadingTask.destroy）
  useEffect(
    () => () => {
      docRef.current?.destroy()
      docRef.current = null
    },
    [],
  )

  useEffect(() => {
    if (!file || !width) return undefined
    const host = rootRef.current
    if (!host) return undefined
    let cancelled = false

    setReady(false)
    clearHighlights(HIGHLIGHT_NAMES)

    const paint = async () => {
      try {
        if (kind === 'pdf') {
          if (!docRef.current) {
            const opened = await openPdfPreview(file)
            if (cancelled) {
              opened.destroy()
              return
            }
            docRef.current = opened
          }
          const doc = docRef.current
          host.textContent = ''
          const holders = []
          for (let i = 0; i < doc.numPages; i += 1) {
            const holder = document.createElement('div')
            holder.className = 'orig-page'
            host.appendChild(holder)
            holders.push(holder)
          }
          pageRefs.current = holders
          setTotal(doc.numPages)

          // 先把每一页的文字层搭出来（快），文字能选中、能定位、能高亮；
          // 画面（canvas）随后一页页补，长合同也不用干等。
          const preps = []
          for (let i = 1; i <= doc.numPages; i += 1) {
            if (cancelled) return
            preps.push(await doc.preparePage(i, holders[i - 1], width))
          }
          if (cancelled) return
          const hasText = preps.some((prep) => prep.hasText)
          setStatus(hasText ? 'ready' : 'scanned')
          setReady(hasText)

          for (const prep of preps) {
            if (cancelled) return
            await prep.draw().catch(() => {})
          }
          return
        }

        if (kind === 'word') {
          host.textContent = ''
          const handle = await renderDocx(host, file)
          if (cancelled) {
            handle.destroy()
            return
          }
          fitDocxToWidth(host, handle.wrapper)
          pageRefs.current = handle.wrapper ? [...handle.wrapper.querySelectorAll('section.docx')] : []
          setTotal(handle.pageCount || 1)
          setStatus('ready')
          setReady(true)
          return
        }

        pageRefs.current = []
        setTotal(1)
        setStatus(kind === 'image' ? 'image' : 'empty')
        setReady(false)
      } catch {
        if (!cancelled) {
          setStatus('failed')
          setReady(false)
        }
      }
    }

    paint()
    return () => {
      cancelled = true
    }
  }, [file, kind, width])

  useEffect(() => () => window.cancelAnimationFrame(rafRef.current), [])

  // 页码跟着滚动走：不写 effect 里发 state，避免滚动时级联渲染
  const handleScroll = () => {
    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0
      const host = scrollRef.current
      const nodes = pageRefs.current
      if (!host || !nodes.length) return
      const base = host.getBoundingClientRect().top
      let current = 1
      nodes.forEach((node, index) => {
        if (node && node.getBoundingClientRect().top - base <= 110) current = index + 1
      })
      setPage((prev) => (prev === current ? prev : current))
    })
  }

  const goPage = (n) => {
    const node = pageRefs.current[n - 1]
    if (!node) return
    const host = scrollRef.current
    const offset = node.getBoundingClientRect().top - host.getBoundingClientRect().top
    host.scrollTo({ top: host.scrollTop + offset - 8, behavior: 'smooth' })
  }

  const label = useMemo(() => SOURCE_LABEL[kind] || '合同原文', [kind])

  return (
    <aside className="docpane orig" aria-label="合同原件">
      <div className="doc-tools">
        <span className="m on">{label}</span>
        {status === 'scanned' ? <span className="m warn">扫描件 · 无文字层</span> : null}
        {status === 'ready' && risks.length ? <span className="m">已标 {risks.length} 条</span> : null}
        <span className="r">
          {total > 1 ? (
            <>
              <span>
                第 {page} / {total} 页
              </span>
              <span>·</span>
            </>
          ) : null}
          <span>{status === 'loading' ? '载入中' : status === 'ready' ? '文字可选中' : '原件'}</span>
        </span>
      </div>

      <div className="doc-main">
        {total > 1 ? (
          <div className="pagerail">
            {Array.from({ length: total }, (_, index) => index + 1).map((n) => (
              <button className={page === n ? 'on' : ''} key={n} type="button" onClick={() => goPage(n)} title={`第 ${n} 页`}>
                {n}
              </button>
            ))}
          </div>
        ) : null}

        <div className="doc-scroll" ref={scrollRef} onScroll={handleScroll}>
          {status === 'failed' ? <div className="warn-strip">{FAIL_COPY[kind] || FAIL_COPY.text}</div> : null}
          {kind === 'image' && imageUrl ? (
            <div className="orig-page orig-image">
              <img src={imageUrl} alt="上传的合同照片" />
            </div>
          ) : null}
          {status === 'scanned' ? (
            <div className="orig-note">
              这份 PDF 是扫描件，页面上没有可以定位的文字层。右边每条风险都附了原句，可以对着页码自己找。
            </div>
          ) : null}
          <div className={`orig-host ${kind === 'word' ? 'is-docx' : ''}`} ref={rootRef} onClick={handleClick} />
        </div>
      </div>
    </aside>
  )
}
