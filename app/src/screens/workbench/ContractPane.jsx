import { useEffect, useRef, useState } from 'react'

function PageBlock({ block, risks, onPickRisk }) {
  if (block.type === 'kicker') return <div className="kicker">{block.text}</div>
  if (block.type === 'title') return <h1 className="chtitle">{block.text}</h1>
  if (block.type === 'party') {
    return (
      <div className="party">
        <span>{block.text}</span>
        <span className="idt">{block.mask}</span>
      </div>
    )
  }
  if (block.type === 'clause') return <h2 className="clause">{block.text}</h2>
  if (block.type === 'sign') {
    return (
      <div className="sign">
        <div>甲方（签字）：＿＿＿＿＿＿</div>
        <div>乙方（签字）：＿＿＿＿＿＿</div>
      </div>
    )
  }

  const runs = block.runs?.map((run, index) => {
    if (!run.risk) return <span key={index}>{run.t}</span>
    const risk = risks.find((item) => item.id === run.risk)
    const mark = risks.findIndex((item) => item.id === run.risk) + 1
    return (
      <span
        key={index}
        className={`sn ${risk?.level || 'note'}`}
        data-risk={run.risk}
        role="button"
        tabIndex={0}
        onClick={() => onPickRisk(run.risk)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onPickRisk(run.risk)
        }}
      >
        {run.t}
        <span className="mark">{mark}</span>
      </span>
    )
  })

  if (block.type === 'item') {
    return (
      <p className="item">
        <span className="no">{block.no}</span>
        <span>{runs}</span>
      </p>
    )
  }
  return <p className="para">{runs}</p>
}

export default function ContractPane({ pages, risks, activeId, locateSignal, onPickRisk }) {
  const scrollRef = useRef(null)
  const pageRefs = useRef({})
  const firstRun = useRef(true)
  const rafRef = useRef(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return undefined
    }
    if (!activeId) return undefined
    const el = scrollRef.current?.querySelector(`[data-risk="${activeId}"]`)
    if (!el) return undefined
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
    const timer = window.setTimeout(() => el.classList.remove('flash'), 1200)
    return () => window.clearTimeout(timer)
  }, [activeId, locateSignal, risks])

  useEffect(() => () => window.cancelAnimationFrame(rafRef.current), [])

  // 页码跟着滚动走：不靠 effect 写 state，避免级联渲染。
  const handleScroll = () => {
    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0
      const container = scrollRef.current
      if (!container) return
      const base = container.getBoundingClientRect().top
      let current = 1
      pages.forEach((item) => {
        const node = pageRefs.current[item.n]
        if (node && node.getBoundingClientRect().top - base <= 90) current = item.n
      })
      setPage(current)
    })
  }

  const goPage = (n) => {
    setPage(n)
    pageRefs.current[n]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <aside className="docpane" aria-label="合同原文">
      <div className="doc-tools">
        <span className="m on">开始</span>
        <span className="m">插入</span>
        <span className="m">页面</span>
        <span className="m">批注 {risks.length}</span>
        <span className="m">定位</span>
        <span className="r">
          <span>
            第 {page} / {pages.length} 页
          </span>
          <span>·</span>
          <span>100%</span>
        </span>
      </div>

      <div className="doc-main">
        <div className="pagerail">
          {pages.map((item) => (
            <button
              className={page === item.n ? 'on' : ''}
              key={item.n}
              type="button"
              onClick={() => goPage(item.n)}
              title={`第 ${item.n} 页`}
            >
              {item.n}
            </button>
          ))}
        </div>

        <div className="doc-scroll" ref={scrollRef} onScroll={handleScroll}>
          <article className="paper">
            {pages.map((item) => (
              <div
                className="page"
                key={item.n}
                ref={(node) => {
                  pageRefs.current[item.n] = node
                }}
              >
                {item.blocks.map((block, index) => (
                  <PageBlock block={block} key={index} risks={risks} onPickRisk={onPickRisk} />
                ))}
                <div className="pgft">— 第 {item.n} 页 / 共 {pages.length} 页 —</div>
              </div>
            ))}
          </article>
        </div>
      </div>
    </aside>
  )
}
