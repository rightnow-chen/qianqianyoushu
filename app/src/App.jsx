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
import { analyzeContract, enrichFindingsWithLegalBasis, mergeFindings } from './features/contractReview.js'
import { reviewContractWithAi } from './features/aiReview.js'
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
import { resolveProfile } from './features/contractDocxLayout.js'
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
  // AI 深度审查状态：null（没跑）| running | done | failed。
  // 规则结果永远先落地，这个字段只描述「AI 那一路补到了哪」。
  aiReview: null,
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [session, setSession] = useState(EMPTY_SESSION)
  const [done, setDone] = useState({})
  const [accepted, setAccepted] = useState({})
  const [edited, setEdited] = useState({})
  // 批注版只导出用户勾选的条款：key=riskId，value=true。不勾就不导出批注。
  const [commented, setCommented] = useState({})
  const [checks, setChecks] = useState(DEMO_CHECKS)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [locateSignal, setLocateSignal] = useState(0)
  const [busy, setBusy] = useState(false)
  const toastTimer = useRef(null)
  // 每次开跑递增；AI 结果回来时比对，防止旧请求覆盖用户重新上传后的结果
  const analysisRunRef = useRef(0)

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
      // 离开结果页就等于退出演示态。否则内存里的 demo=1 会残留
      // （landing 的 hash 虽被清空，route state 没跟着清），下一次
      // 真实上传会被下面的 effect 整份打回演示数据。
      if (screen !== 'work') next.demo = false
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
  // 只跟 route.demo 走，不把 session.kind 放进依赖：用户上传真实文件时 kind 会从
  // 'empty'/'demo' 变成 'real'，若跟着它重跑，就会把刚读出来的合同整份覆盖掉。
  useEffect(() => {
    if (route.demo) {
      setSession((prev) =>
        prev.kind === 'demo'
          ? prev
          : { ...EMPTY_SESSION, kind: 'demo', fileName: DEMO_META.fileName, risks: DEMO_RISKS },
      )
      setChecks(DEMO_CHECKS)
    } else {
      setSession((prev) => (prev.kind === 'demo' ? EMPTY_SESSION : prev))
    }
  }, [route.demo])

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
        setCommented({})
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

  /** 进分析页就开跑：动画不等模型，模型也不挡动画。
   *  规则结果秒出，AI 审查异步补规则覆盖不到的写法；AI 那一路失败就停在规则结果，
   *  绝不能拿空数组冒充「这份合同没风险」。 */
  const runAnalysis = useCallback(() => {
    const full = session.fileText
    const text = full.length > MAX_ANALYZE_CHARS ? full.slice(0, MAX_ANALYZE_CHARS) : full
    const currentMeta = session.meta
    if (!text) return
    const runId = ++analysisRunRef.current
    const profile = {
      contractType: 'lease',
      partyRole: 'partyB',
      reviewDepth: currentMeta.scale === '标准' ? 'business' : 'strict',
    }

    window.setTimeout(async () => {
      const started = Date.now()
      let localFindings = []
      try {
        localFindings = analyzeContract(text, profile)
      } catch (error) {
        if (runId !== analysisRunRef.current) return
        setSession((prev) => ({
          ...prev,
          risks: [],
          findings: [],
          aiReview: null,
          degradation: {
            level: 'failed',
            message: error?.message || '分析没跑完，请重试或换一份合同',
          },
        }))
        return
      }

      // 第一段：规则结果立刻落地，界面不等模型
      const localRisks = toRiskModel(localFindings, {
        contractText: text,
        pages: currentMeta.filePages || 0,
        amounts: computeAmounts(currentMeta),
      })
      if (runId === analysisRunRef.current) {
        setSession((prev) => ({
          ...prev,
          findings: localFindings,
          risks: localRisks,
          degradation: describeDegradation(localFindings, localRisks, { text }),
          aiReview: { status: 'running', count: 0, message: '' },
        }))
      }
      track('analyze_done', {
        seconds: Math.round((Date.now() - started) / 1000),
        count: localRisks.length,
        truncated: full.length > MAX_ANALYZE_CHARS,
        stage: 'rules',
      })

      // 第二段：AI 补盲区，回来就地合并进同一份结果
      try {
        const { findings: aiFindings } = await reviewContractWithAi({
          text,
          localFindings,
          profile,
        })
        if (runId !== analysisRunRef.current) return
        // AI 补盲的风险若与本地某条证据指向同一句，继承本地已核实法条，
        // 避免它显示「未匹配到具体法条」——法条是本地规则算的，不是 AI 现编的。
        const enrichedAi = enrichFindingsWithLegalBasis(aiFindings, localFindings)
        const merged = enrichedAi.length ? mergeFindings(localFindings, enrichedAi) : localFindings
        const mergedRisks = toRiskModel(merged, {
          contractText: text,
          pages: currentMeta.filePages || 0,
          amounts: computeAmounts(currentMeta),
        })
        setSession((prev) => ({
          ...prev,
          findings: merged,
          risks: mergedRisks,
          degradation: describeDegradation(merged, mergedRisks, { text }),
          aiReview: { status: 'done', count: aiFindings.length, added: merged.length - localFindings.length, message: '' },
        }))
        track('analyze_done', {
          seconds: Math.round((Date.now() - started) / 1000),
          count: mergedRisks.length,
          aiCount: aiFindings.length,
          stage: 'ai',
        })
      } catch (error) {
        if (runId !== analysisRunRef.current) return
        setSession((prev) => ({
          ...prev,
          aiReview: {
            status: 'failed',
            count: 0,
            message: error?.message || 'AI 深度审查没跑完，下面是规则初筛的结果。',
          },
        }))
        track('analyze_ai_failed', { reason: String(error?.message || '').slice(0, 80) })
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
      // 批注版同样只导出用户勾选的条款，不能在用户没选择时偷偷给全部风险加批注。
      if (kind === 'comment' && Object.keys(commented).length === 0) {
        toast('还没勾选批注：到「修改」页点「添加批注」选好要批注的条款，再回来导出')
        return
      }
      const base = String(meta.fileName || '合同').replace(/\.[^.]+$/, '')
      const label = kind === 'revision' ? '修订版' : '批注版'
      const filename = `${base}_${label}_${new Date().toISOString().slice(0, 10)}.docx`
      setBusy(true)
      try {
        // 版式骨架按来源决定：演示/文本/图片套示范文本骨架；真实 Word/PDF 保留原件结构。
        const profile = resolveProfile({ isDemo, fileKind: meta?.fileKind })
        const result =
          kind === 'revision'
            ? await buildRevisionDocxBlob({ text: contractText, risks, accepted, edited, meta, profile })
            : await buildCommentDocxBlob({ text: contractText, risks, accepted, meta, selected: commented, profile })
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
        <AnalyzingScreen onDone={() => go('work', { tab: 'ov' })} />
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
          aiReview={session.aiReview}
          isDemo={isDemo}
          tab={route.tab}
          onTab={(tab) => go('work', { tab })}
          activeId={route.active}
          onActive={selectRisk}
          locateSignal={locateSignal}
          done={done}
          accepted={accepted}
          edited={edited}
          commented={commented}
          onDone={(riskId) => {
            setDone((prev) => ({ ...prev, [riskId]: !prev[riskId] }))
            toast(done[riskId] ? '已取消「已处理」' : '已标记为处理')
          }}
          onComment={(riskId) => {
            setCommented((prev) => ({ ...prev, [riskId]: !prev[riskId] }))
            toast(commented[riskId] ? '已取消批注：导出批注版时不再包含这条' : '已加批注：导出批注版时只导出勾选的条款')
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
