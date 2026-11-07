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
} from './data/demoCase.js'
import { computeAmounts, computeVerdict, computeWorstCase } from './features/amountEngine.js'
import { countByLevel } from './features/riskModel.js'
import { buildPlainText, buildReportHtml } from './features/reportText.js'
import { track } from './features/track.js'

const SCREENS = ['landing', 'upload', 'confirm', 'analyzing', 'work']

function readRoute() {
  const raw = (window.location.hash || '').replace(/^#/, '')
  if (!raw) return { screen: 'landing', tab: 'ov', active: 'r1' }
  const [path, query] = raw.split('?')
  const params = new URLSearchParams(query || '')
  const screen = SCREENS.includes(path) ? path : 'landing'
  return {
    screen,
    tab: params.get('tab') || 'ov',
    active: params.get('active') || 'r1',
  }
}

function routeToHash({ screen, tab, active }) {
  if (screen === 'landing') return ''
  if (screen !== 'work') return `#${screen}`
  const params = new URLSearchParams({ tab, active })
  return `#work?${params.toString()}`
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [meta, setMeta] = useState(DEMO_META)
  const [done, setDone] = useState({})
  const [accepted, setAccepted] = useState({})
  const [edited, setEdited] = useState({})
  const [checks, setChecks] = useState(DEMO_CHECKS)
  const [quality] = useState(DEMO_QUALITY)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [locateSignal, setLocateSignal] = useState(0)
  const toastTimer = useRef(null)

  const toast = useCallback((message) => {
    setToastMessage(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMessage(''), 2600)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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

  const amounts = useMemo(() => computeAmounts(meta), [meta])
  const counts = useMemo(() => countByLevel(DEMO_RISKS), [])
  const worst = useMemo(() => computeWorstCase(DEMO_RISKS, amounts), [amounts])
  const verdict = useMemo(() => computeVerdict(DEMO_RISKS, amounts), [amounts])

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
    setMeta((prev) => ({ ...prev, ...patch }))
    track('field_corrected', patch)
  }, [])

  const handleExport = async (kind) => {
    track('export', { kind })
    if (kind === 'report') {
      const html = buildReportHtml({ meta, risks: DEMO_RISKS, amounts, worst, verdict, checks })
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
    const text = buildPlainText({ risks: DEMO_RISKS, amounts, checks })
    try {
      await navigator.clipboard.writeText(text)
      toast('已复制 3 条建议 + 3 段话术，可直接粘进微信')
    } catch {
      toast('复制失败，长按选中也可以')
    }
  }

  return (
    <>
      <TopBar screen={route.screen} onPrivacy={() => setPrivacyOpen(true)} />

      {route.screen === 'landing' && (
        <LandingScreen
          onFile={(file) => {
            track('upload_success', { name: file.name, size: file.size })
            toast(`已读取「${file.name}」· 演示环境用示例合同继续`)
            go('upload')
          }}
          onCamera={() => {
            track('upload_success', { source: 'camera' })
            go('upload')
          }}
          onPaste={() => go('confirm')}
          onDemo={() => go('work')}
        />
      )}

      {route.screen === 'upload' && (
        <UploadScreen
          meta={meta}
          quality={quality}
          onRetake={(page) => {
            track('repage_retake', { page })
            toast(page ? `演示：只替换第 ${page} 页，不重走流程` : '演示：补拍或加页')
          }}
          onReplace={() => {
            toast('演示：换一份更清晰的文件')
            go('landing')
          }}
          onManual={() => {
            track('ocr_edit', { page: 2 })
            go('confirm')
          }}
          onContinue={() => {
            track('quality_continue', { warnPages: 1 })
            go('confirm')
          }}
          onBack={() => go('landing')}
        />
      )}

      {route.screen === 'confirm' && (
        <ConfirmScreen
          meta={meta}
          onChangeMeta={changeMeta}
          onNext={() => go('analyzing')}
          onBack={() => go('upload')}
        />
      )}

      {route.screen === 'analyzing' && (
        <AnalyzingScreen
          onDone={() => {
            track('analyze_done', { seconds: 28 })
            go('work', { tab: 'ov' })
          }}
          onSkip={() => go('work', { tab: 'ov' })}
        />
      )}

      {route.screen === 'work' && (
        <WorkbenchScreen
          meta={meta}
          pages={DEMO_PAGES}
          risks={DEMO_RISKS}
          amounts={amounts}
          counts={counts}
          worst={worst}
          verdict={verdict}
          checks={checks}
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
            toast('已接受修订：导出批注版时会带上这条（V0.2）')
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
          onReupload={() => go('upload')}
          onExport={handleExport}
          onToast={toast}
          onCopy={(event, payload) => track(event, payload)}
        />
      )}

      <Toast message={toastMessage} />
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </>
  )
}
