import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './styles/app.css'
import TopBar from './components/TopBar.jsx'
import Toast from './components/Toast.jsx'
import PrivacyModal from './components/PrivacyModal.jsx'
import LandingScreen from './screens/LandingScreen.jsx'
import UploadScreen from './screens/UploadScreen.jsx'
import ConfirmScreen from './screens/ConfirmScreen.jsx'
import AnalyzingScreen from './screens/AnalyzingScreen.jsx'
import WorkbenchScreen from './screens/WorkbenchScreen.jsx'
import {
  DEMO_CHECKS,
  DEMO_META,
  DEMO_PAGES,
  DEMO_QUALITY,
  DEMO_RISKS,
  getContractText,
} from './data/demoCase.js'
import { computeAmounts, computeVerdict, computeWorstCase } from './features/amountEngine.js'
import { countByLevel } from './features/riskModel.js'
import { analyzeContract } from './features/contractReview.js'
import { extractContractFacts } from './features/contractFacts.js'
import { describeDegradation, metaFromFacts, toRiskModel } from './features/riskMapper.js'
import { buildContractPages, estimatePages } from './features/contractPages.js'
import {
  MAX_ANALYZE_CHARS,
  countSentences,
  looksLikeLease,
  qualityForFile,
} from './features/uploadQuality.js'
import { buildCommentDocxBlob, buildRevisionDocxBlob } from './features/contractDocx.js'
import { buildPlainText, buildReportHtml } from './features/reportText.js'
import { track } from './features/track.js'
import { downloadBlob } from './utils/docxExport.js'
import { extractContractTextFromFile } from './utils/fileImport.js'

const SCREENS = ['landing', 'upload', 'confirm', 'analyzing', 'work']

function readRoute() {
  const raw = (window.location.hash || '').replace(/^#/, '')
  if (!raw) return { screen: 'landing', tab: 'ov', active: 'r1', demo: false }
  const [path, query] = raw.split('?')
  const params = new URLSearchParams(query || '')
  const screen = SCREENS.includes(path) ? path : 'landing'
  return {
    screen,
    tab: params.get('tab') || 'ov',
    active: params.get('active') || 'r1',
    demo: params.get('demo') === '1',
    mobile: params.get('m') === '1',
  }
}

function routeToHash({ screen, tab, active, demo, mobile }) {
  const keep = new URLSearchParams()
  if (demo) keep.set('demo', '1')
  if (mobile) keep.set('m', '1')
  const suffix = keep.toString() ? `?${keep.toString()}` : ''
  if (screen !== 'work') return screen === 'landing' ? '' : `#${screen}${suffix}`
  const params = new URLSearchParams({ tab, active })
  if (demo) params.set('demo', '1')
  if (mobile) params.set('m', '1')
  return `#work?${params.toString()}`
}

const EMPTY_SESSION = {
  kind: 'empty', // empty | real | demo
  fileName: '',
  fileSize: '',
  fileText: '',
  source: '',
  confidence: null,
  meta: DEMO_META,
  facts: null,
  quality: DEMO_QUALITY,
  rawFile: null, // 原始文件，确认页要拿它渲染 PDF 原件 / 原图
  structure: null, // Word 的段落层级，用来还原「接近原件」的排版
  risks: [],
  findings: [],
  degradation: null,
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [session, setSession] = useState(EMPTY_SESSION)
  const [done, setDone] = useState({})
  const [accepted, setAccepted] = useState({})
  const [edited, setEdited] = useState({})
  const [checks, setChecks] = useState(DEMO_CHECKS)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [locateSignal, setLocateSignal] = useState(0)
  const [busy, setBusy] = useState(false)
  const toastTimer = useRef(null)

  const isDemo = session.kind === 'demo'
  const meta = session.meta
  const risks = session.risks
  const quality = session.quality

  const toast = useCallback((message) => {
    setToastMessage(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMessage(''), 2600)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  useEffect(() => {
    document.documentElement.classList.toggle('m-mode', !!route.mobile)
  }, [route.mobile])

  const go = useCallback((screen, extra = {}) => {
    setRoute((prev) => {
      const next = { ...prev, ...extra, screen }
      const hash = routeToHash(next)
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', `${window.location.pathname}${hash}`)
      }
      return next
    })
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 直接开 ?demo=1：装载演示数据，不用重新走一遍上传。
  // 依赖里必须带 route.demo：否则在同一会话里从真实合同跳到演示链接，界面会沿用真实结果。
  useEffect(() => {
    if (route.demo && session.kind !== 'demo') {
      setSession({ ...EMPTY_SESSION, kind: 'demo', fileName: DEMO_META.fileName, risks: DEMO_RISKS })
      setChecks(DEMO_CHECKS)
    } else if (!route.demo && session.kind === 'demo') {
      setSession(EMPTY_SESSION)
    }
  }, [route.demo, session.kind])

  const amounts = useMemo(() => computeAmounts(meta), [meta])
  const counts = useMemo(() => countByLevel(risks), [risks])
  const worst = useMemo(() => computeWorstCase(risks, amounts), [risks, amounts])
  const verdict = useMemo(
    () => computeVerdict(risks, amounts, { checklistCount: checks.length }),
    [risks, amounts, checks.length],
  )
  const pages = useMemo(
    () => (isDemo ? DEMO_PAGES : buildContractPages(session.fileText, risks)),
    [isDemo, session.fileText, risks],
  )

  useEffect(() => {
    if (route.screen === 'work') track('page_view', { screen: 'work', tab: route.tab })
    else if (route.screen !== 'landing') track('page_view', { screen: route.screen })
  }, [route.screen, route.tab])

  const selectRisk = useCallback((riskId) => {
    setRoute((prev) => {
      const next = { ...prev, active: riskId }
      const hash = routeToHash(next)
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', `${window.location.pathname}${hash}`)
      }
      return next
    })
    setLocateSignal((value) => value + 1)
    track('locate_click', { riskId })
  }, [])

  const changeMeta = useCallback((patch) => {
    setSession((prev) => ({ ...prev, meta: { ...prev.meta, ...patch } }))
    track('field_corrected', patch)
  }, [])

  /** 读文件：真实解析（PDF / Word / 图片 OCR / 文本），失败就明说，不悄悄塞演示数据。 */
  const handleFile = useCallback(
    async (file) => {
      if (!file) return
      setBusy(true)
      try {
        const result = await extractContractTextFromFile(file)
        const text = result.text || ''
        const facts = extractContractFacts(text)
        const extracted = metaFromFacts(facts)
        const pagesCount = result.pageCount || result.structure?.pageCount || estimatePages(text)
        const sizeText = `${(file.size / 1024 / 1024).toFixed(1)} MB`
        setSession({
          ...EMPTY_SESSION,
          kind: 'real',
          fileName: file.name,
          fileSize: sizeText,
          fileText: text,
          source: result.source || result.type || '文本',
          confidence: result.confidence ?? null,
          rawFile: file,
          structure: Array.isArray(result.structure) ? result.structure : null,
          facts,
          quality: qualityForFile({
            text,
            source: result.source,
            confidence: result.confidence,
            pageCount: pagesCount,
          }),
          meta: {
            ...DEMO_META,
            fileName: file.name,
            fileSize: sizeText,
            filePages: pagesCount,
            fileKind: (file.name.split('.').pop() || '').toUpperCase(),
            fileNote: `${result.source || '文件'} · 已脱敏`,
            source: result.source || '文件',
            type: looksLikeLease(text) ? '房屋租赁合同' : '疑似非租赁合同',
            city: '待确认',
            rent: extracted.rent ?? 0,
            deposit: extracted.deposit ?? 0,
            months: extracted.months ?? 12,
            scale: '严格 · 逐句',
            sentenceCount: countSentences(text),
          },
        })
        setDone({})
        setAccepted({})
        setEdited({})
        setChecks(DEMO_CHECKS.map((item) => ({ ...item, done: false })))
        track('upload_success', { name: file.name, size: file.size, source: result.source })
        toast(`已读出「${file.name}」· ${result.source || '文本'}，检查一下识别结果`)
        go('upload')
      } catch (error) {
        toast(error?.message || '这份文件没读出来，换一份或直接粘贴文字')
      } finally {
        setBusy(false)
      }
    },
    [go, toast],
  )

  const handlePaste = useCallback(async () => {
    let text
    try {
      text = await navigator.clipboard.readText()
    } catch {
      text = ''
    }
    if (!text || text.trim().length < 40) {
      toast('没读到剪贴板里的合同：先复制文字再点这里，或直接上传文件')
      return
    }
    const facts = extractContractFacts(text)
    const extracted = metaFromFacts(facts)
    setSession({
      ...EMPTY_SESSION,
      kind: 'real',
      fileName: '粘贴的合同文字',
      fileText: text,
      source: '粘贴文本',
      facts,
      quality: qualityForFile({ text, source: '粘贴文本' }),
      meta: {
        ...DEMO_META,
        fileName: '粘贴的合同文字',
        fileSize: '',
        filePages: estimatePages(text),
        fileKind: 'TXT',
        fileNote: '粘贴文本 · 已脱敏',
        city: '待确认',
        rent: extracted.rent ?? 0,
        deposit: extracted.deposit ?? 0,
        months: extracted.months ?? 12,
        scale: '严格 · 逐句',
        sentenceCount: countSentences(text),
      },
    })
    setChecks(DEMO_CHECKS.map((item) => ({ ...item, done: false })))
    track('upload_success', { source: 'paste' })
    toast('已按粘贴的文字继续，检查一下六个字段')
    go('confirm')
  }, [go, toast])

  const loadDemo = useCallback(() => {
    setSession({
      ...EMPTY_SESSION,
      kind: 'demo',
      fileName: DEMO_META.fileName,
      fileText: getContractText(DEMO_PAGES),
      source: '演示数据',
      risks: DEMO_RISKS,
    })
    setChecks(DEMO_CHECKS)
    track('upload_success', { source: 'demo' })
    go('work', { tab: 'ov', demo: true })
  }, [go])

  /** 进分析页就开跑：动画不等模型，模型也不挡动画。 */
  const runAnalysis = useCallback(() => {
    const full = session.fileText
    const text = full.length > MAX_ANALYZE_CHARS ? full.slice(0, MAX_ANALYZE_CHARS) : full
    const currentMeta = session.meta
    if (!text) return
    window.setTimeout(() => {
      const started = Date.now()
      try {
        const depth = currentMeta.scale === '标准' ? 'business' : 'strict'
        const findings = analyzeContract(text, {
          contractType: 'lease',
          partyRole: 'partyB',
          reviewDepth: depth,
        })
        const mapped = toRiskModel(findings, {
          contractText: text,
          pages: currentMeta.filePages || 0,
          amounts: computeAmounts(currentMeta),
        })
        const degradation = describeDegradation(findings, mapped, { text })
        setSession((prev) => ({ ...prev, findings, risks: mapped, degradation }))
        track('analyze_done', {
          seconds: Math.round((Date.now() - started) / 1000),
          count: mapped.length,
          truncated: full.length > MAX_ANALYZE_CHARS,
        })
      } catch (error) {
        setSession((prev) => ({
          ...prev,
          risks: [],
          findings: [],
          degradation: {
            level: 'failed',
            message: error?.message || '分析没跑完，请重试或换一份合同',
          },
        }))
      }
    }, 60)
  }, [session.fileText, session.meta])

  const handleExport = async (kind) => {
    track('export', { kind })
    if (kind === 'report') {
      const html = buildReportHtml({ meta, risks, amounts, worst, verdict, checks })
      const win = window.open('', '_blank')
      if (!win) {
        toast('浏览器拦了弹窗，允许后重试')
        return
      }
      win.document.write(html)
      win.document.close()
      toast('已打开打印预览，选「另存为 PDF」就能带走')
      return
    }

    if (kind === 'revision' || kind === 'comment') {
      const contractText = isDemo ? getContractText(DEMO_PAGES) : session.fileText
      if (!contractText) {
        toast('没有合同原文可导出，先重新上传一份')
        return
      }
      if (kind === 'revision' && Object.keys(accepted).length === 0) {
        toast('还没采纳任何修改：到「修改」页点「接受建议并添加修订」，再回来导出')
        return
      }
      const base = String(meta.fileName || '合同').replace(/\.[^.]+$/, '')
      const label = kind === 'revision' ? '修订版' : '批注版'
      const filename = `${base}_${label}_${new Date().toISOString().slice(0, 10)}.docx`
      setBusy(true)
      try {
        const result =
          kind === 'revision'
            ? await buildRevisionDocxBlob({ text: contractText, risks, accepted, edited, meta })
            : await buildCommentDocxBlob({ text: contractText, risks, accepted, meta })
        downloadBlob(result.blob, filename)
        if (kind === 'revision') {
          const skipped = result.composed.changes.filter((item) => !item.applied).length
          toast(
            `已导出修订版：替换 ${result.composed.appliedCount} 处${skipped ? `，${skipped} 条列在文末清单` : ''}`,
          )
        } else {
          toast(`已导出批注版：${result.plan.anchors.length} 条批注挂在原句上`)
        }
      } catch (error) {
        toast(`导出失败：${error?.message || '请重试'}`)
      } finally {
        setBusy(false)
      }
      return
    }

    const text = buildPlainText({ risks, amounts, checks })
    try {
      await navigator.clipboard.writeText(text)
      toast('已复制建议与话术，可直接粘进微信')
    } catch {
      toast('复制失败，长按选中也可以')
    }
  }

  return (
    <>
      <TopBar screen={route.screen} onPrivacy={() => setPrivacyOpen(true)} />

      {route.screen === 'landing' && (
        <LandingScreen
          onFile={handleFile}
          onPaste={handlePaste}
          onDemo={loadDemo}
        />
      )}

      {route.screen === 'upload' && (
        <UploadScreen
          meta={meta}
          quality={quality}
          onRetake={(page) => {
            track('repage_retake', { page })
            toast(page ? `只替换第 ${page} 页，不重走流程（V0.2）` : '补拍或加页（V0.2）')
          }}
          onReplace={() => {
            toast('换一份文件')
            go('landing')
          }}
          onManual={() => {
            track('ocr_edit', { page: 1 })
            go('confirm')
          }}
          onContinue={() => {
            const warnPages = quality.pages.filter((page) => page.state !== 'ok').length
            track('quality_warn', { warnPages, totalPages: quality.pages.length })
            go('confirm')
          }}
          onBack={() => go('landing')}
        />
      )}

      {route.screen === 'confirm' && (
        <ConfirmScreen
          meta={meta}
          onChangeMeta={changeMeta}
          file={session.rawFile}
          text={session.fileText}
          structure={session.structure}
          onNext={() => {
            go('analyzing')
            if (!isDemo) runAnalysis()
          }}
          onBack={() => go('upload')}
        />
      )}

      {route.screen === 'analyzing' && (
        <AnalyzingScreen
          onDone={() => go('work', { tab: 'ov' })}
          onSkip={() => go('work', { tab: 'ov' })}
        />
      )}

      {route.screen === 'work' && (
        <WorkbenchScreen
          meta={meta}
          pages={pages}
          file={session.rawFile}
          risks={risks}
          amounts={amounts}
          counts={counts}
          worst={worst}
          verdict={verdict}
          checks={checks}
          degradation={session.degradation}
          isDemo={isDemo}
          tab={route.tab}
          onTab={(tab) => go('work', { tab })}
          activeId={route.active}
          onActive={selectRisk}
          locateSignal={locateSignal}
          done={done}
          accepted={accepted}
          edited={edited}
          onDone={(riskId) => {
            setDone((prev) => ({ ...prev, [riskId]: !prev[riskId] }))
            toast(done[riskId] ? '已取消「已处理」' : '已标记为处理')
          }}
          onAccept={(riskId) => {
            setAccepted((prev) => ({ ...prev, [riskId]: true }))
            setDone((prev) => ({ ...prev, [riskId]: true }))
            track('suggestion_accept', { riskId })
            toast('已接受修订：导出修订版会把这句替换掉')
          }}
          onSaveEdit={(riskId, text) => {
            setEdited((prev) => ({ ...prev, [riskId]: text }))
            track('suggestion_edit', { riskId })
            toast('已按你的措辞保存')
          }}
          onToggleCheck={(checkId) => {
            setChecks((prev) =>
              prev.map((item) => (item.id === checkId ? { ...item, done: !item.done } : item)),
            )
            track('checklist_check', { checkId })
          }}
          onReupload={() => go('landing')}
          onExport={handleExport}
          onToast={toast}
          onCopy={(event, payload) => track(event, payload)}
          onTrack={(event, payload) => track(event, payload)}
        />
      )}

      {busy && <div className="busy-mask">正在处理…</div>}
      <Toast message={toastMessage} />
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </>
  )
}
