import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'

const STEPS = [
  { t: '读取原文 · 切分条款', s: '4 页，识别 10 条 / 38 句' },
  { t: '按 9 类条款逐句比对', s: '押金、退租、维修、涨租…' },
  { t: '生成修改建议与话术', s: '正在读取第 1 页…' },
  { t: '单列合同外待核实事项', s: '产权、转租、费用、设施…' },
]

const PAGE_HINTS = ['正在读取第 1 页…', '正在读取第 2 页…', '正在读取第 3 页…', '正在比对第 4 页…']

export default function AnalyzingScreen({ onDone, onSkip }) {
  const [pct, setPct] = useState(8)
  const doneRef = useRef(onDone)

  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPct((prev) => {
        if (prev >= 100) return 100
        return Math.min(100, prev + 4 + Math.random() * 5)
      })
    }, 300)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (pct < 100) return undefined
    const timer = window.setTimeout(() => doneRef.current?.(), 700)
    return () => window.clearTimeout(timer)
  }, [pct])

  const step = pct < 30 ? 0 : pct < 64 ? 1 : pct < 92 ? 2 : 3
  const pageHint = PAGE_HINTS[Math.min(3, Math.floor(pct / 26))]

  return (
    <section className="task" style={{ paddingTop: 34 }}>
      <div className="task-inner">
        <div className="crumb">
          <span>新建审查</span>
          <span className="dot" />
          <b>正在审查</b>
          <span className="dot" />
          <span>看结果</span>
        </div>

        <div className="analyze">
          <div className="scan">
            <div className="scan-title">房屋租赁合同</div>
            <div className="scan-line t" />
            <div className="scan-line m" />
            <div className="scan-line s" />
            <div className="scan-line t" />
            <div className="scan-line m" />
            <div className="scan-line" />
            <div className="scan-line s" />
            <div className="scan-line t" />
            <div className="scan-line m" />
            <div className="scan-line s" />
            <div className="scan-line" />
            <div className="scan-line t" />
            <div className="scan-line" />
            <div className="scan-line m" />
            <div className="scan-line s" />
            <div className="scan-foot">
              正在逐句切分 · 已读 {Math.min(4, Math.floor(pct / 26) + 1)} / 4 页
            </div>
          </div>

          <div className="panel">
            <div className="panel-bd">
              <div className="progress-head">
                <span className="t">审查进行中</span>
                <span className="pct">{Math.round(pct)}%</span>
              </div>
              <div className="progress">
                <i style={{ width: `${pct}%` }} />
              </div>

              {STEPS.map((item, index) => (
                <div
                  className={`a-step ${index === step ? 'on' : ''} ${index < step ? 'done' : ''}`}
                  key={item.t}
                >
                  <div className="n">
                    {index < step ? <Check size={11} aria-hidden="true" /> : index + 1}
                  </div>
                  <div>
                    <div className="t">{item.t}</div>
                    <div className="s">{index === 2 ? pageHint : item.s}</div>
                  </div>
                </div>
              ))}

              <div className="blue-note">
                等的时候可以做点别的：
                <button type="button" onClick={onSkip} style={{ color: 'var(--blue)' }}>
                  先看已完成的部分 →
                </button>
              </div>
              <div className="hint" style={{ marginTop: 9 }}>
                平均 28 秒；20 页以上会拆成多段逐段审查，不会卡住。
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
