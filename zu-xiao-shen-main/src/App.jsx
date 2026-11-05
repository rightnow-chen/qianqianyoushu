import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  FileText,
  ShieldCheck,
} from 'lucide-react'
import './App.css'
import { demoContracts } from './data/demoContracts.js'
import { STORAGE_KEYS, workflowLabels } from './constants/appConfig.js'
import { OCR_REVIEW_WARNING_CONFIDENCE } from './constants/contractImport.js'
import { defaultDepositInputs, providerPresets } from './constants/aiConfig.js'
import { knowledgeBaseItems } from './data/knowledgeBase.js'
import { calcFirstPayment, calcMonthlyCost, calculateDepositReturn, checkBudgetConflict } from './utils/money.js'
import {
  createDefaultListing,
  createDefaultNeeds,
  createDefaultSources,
  createDemoScenario,
  generateListingName,
  MUST_HAVES_LIMIT,
  validateListing,
  validateNeeds,
} from './features/decisionInput.js'
import { calcCommuteFit, calcHasMissingInfo, calcMustHaveFit, calcTrustSummary, resolveDecision } from './features/decision.js'
import { redactSensitiveText } from './utils/privacy.js'
import AiAssistantPanel from './components/AiAssistantPanel.jsx'
import AnnouncementStrip from './components/AnnouncementStrip.jsx'
import AppSidebar from './components/AppSidebar.jsx'
import AppTopbar from './components/AppTopbar.jsx'
import DecisionInputForms from './components/DecisionInputForms.jsx'
import DecisionResult from './components/DecisionResult.jsx'
import DecisionStepper from './components/DecisionStepper.jsx'
import { FindingItem, HighlightedContract } from './components/ReviewAtoms.jsx'
import ArtifactPreview from './components/ArtifactPreview.jsx'
import { DocumentView } from './components/DocumentView.jsx'
import NegotiationDesk from './components/NegotiationDesk.jsx'
import RevisionDraftPanel from './components/RevisionDraftPanel.jsx'
import ProposalHome from './components/ProposalHome.jsx'
import ReviewInputPanel from './components/ReviewInputPanel.jsx'
import RiskGuideModal from './components/RiskGuideModal.jsx'
import {
  buildAiResponseSkillPrompt,
  buildRagContextPrompt,
  buildRagSearchQuery,
  buildSystemAiContext,
  createAiReviewPrompt,
  createAiWelcomeMessage,
  createEmptyAiFeedback,
  createLocalAiFallbackReply,
  createMessageId,
  extractAssistantChatContent,
  getPlatformApiEndpoint,
  normalizeAiFeedback,
  normalizeAiReplyText,
  parseAiReviewResponse,
  searchAiKnowledge,
} from './features/aiAssistant.js'
import { getAssistantStatus } from './features/assistantUi.js'
import {
  analyzeContract,
  applyRevisionItem,
  cleanContractTextForReview,
  createRevisedContractDraft,
  enrichFindingsWithLegalBasis,
  getRiskSummary,
  mergeFindings,
  mergeRevisionItems,
  resolveReviewProfile,
} from './features/contractReview.js'
import { extractContractFacts } from './features/contractFacts.js'
import { getReviewQualityGate } from './features/reviewQualityUi.js'

// 业务页：房源与预算 / 审合同 / 谈判台 / 签约判断（用于 AI 上下文判断与返回业务页逻辑）
const BUSINESS_CONTEXT_TABS = new Set(['needs', 'contract', 'negotiation', 'verdict'])
const MAX_REVIEW_CHARS = 200_000
const VALID_TABS = new Set(['proposal', 'needs', 'contract', 'negotiation', 'verdict', 'ai'])
// 旧链接 ?module=review 兼容：统一落到「签约判断」页
const LEGACY_TAB_ALIASES = { review: 'contract', verdict: 'contract', needs: 'contract' }

function normalizeTab(value) {
  return LEGACY_TAB_ALIASES[value] || value
}

function getInitialTab() {
  try {
    const value = new URLSearchParams(window.location.search).get('module') || window.location.hash.slice(1)
    const normalized = normalizeTab(value)
    return VALID_TABS.has(normalized) ? normalized : 'proposal'
  } catch {
    return 'proposal'
  }
}

function loadBoolean(key) {
  try { return localStorage.getItem(key) === 'true' } catch { return false }
}

function getOrCreateAccountId() {
  try {
    const existing = localStorage.getItem(STORAGE_KEYS.accountId)
    if (existing) return existing
    const id = `guest-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
    localStorage.setItem(STORAGE_KEYS.accountId, id)
    return id
  } catch {
    return 'guest-anonymous'
  }
}

function loadReviewHistory() {
  try {
    const savedHistory = localStorage.getItem(STORAGE_KEYS.history) || localStorage.getItem(STORAGE_KEYS.historyLegacy)
    if (!savedHistory) return []

    const parsed = JSON.parse(savedHistory)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item) => item && typeof item === 'object' && typeof item.contractText === 'string')
      .slice(0, 5)
      .map((item, index) => ({
        ...item,
        id: item.id || `restored-${index}`,
        title: typeof item.title === 'string' ? item.title : `审查记录 ${index + 1}`,
        score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,
        highCount: Number.isFinite(Number(item.highCount)) ? Number(item.highCount) : 0,
        mediumCount: Number.isFinite(Number(item.mediumCount)) ? Number(item.mediumCount) : 0,
        acceptedCount: Number.isFinite(Number(item.acceptedCount)) ? Number(item.acceptedCount) : 0,
      }))
  } catch {
    return []
  }
}

function loadAiFeedback() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.aiFeedback)
    return saved ? normalizeAiFeedback(JSON.parse(saved)) : createEmptyAiFeedback()
  } catch {
    return createEmptyAiFeedback()
  }
}

// 恢复「谈判工作台」会话：合同文本、已采纳项、谈判三态，让用户隔几天回来能接着记
function loadNegotiationSession() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.negotiationSession)
    if (!saved) return null
    const parsed = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object') return null

    const acceptedIds = Array.isArray(parsed.acceptedIds)
      ? new Set(parsed.acceptedIds.filter((id) => typeof id === 'string'))
      : new Set()

    return {
      contractText: typeof parsed.contractText === 'string' && parsed.contractText.trim() ? parsed.contractText : null,
      acceptedIds,
      acceptedRevisionItems: Array.isArray(parsed.acceptedRevisionItems) ? parsed.acceptedRevisionItems : [],
      negotiationStates: parsed.negotiationStates && typeof parsed.negotiationStates === 'object' ? parsed.negotiationStates : {},
      negotiationChats: parsed.negotiationChats && typeof parsed.negotiationChats === 'object' ? parsed.negotiationChats : {},
      contractStructure: Array.isArray(parsed.contractStructure) ? parsed.contractStructure : null,
    }
  } catch {
    return null
  }
}

// 模块级单例：谈判会话只在首次加载时从 localStorage 恢复一次
const restoredNegotiationSession = loadNegotiationSession()

function App() {
  const [contractText, setContractText] = useState(restoredNegotiationSession?.contractText ?? '')
  const [selectedDemoContractId, setSelectedDemoContractId] = useState(demoContracts[0].id)
  const [activeTab, setActiveTab] = useState(getInitialTab)
  const [lastBusinessTab, setLastBusinessTab] = useState('proposal')
  const [showGuide, setShowGuide] = useState(false)
  const [showAnnouncement, setShowAnnouncement] = useState(true)
  const [contractTouched, setContractTouched] = useState(false)
  const workspaceRef = useRef(null)
  const findingsListRef = useRef(null)
  const findingsPanelRef = useRef(null)
  const contractViewRef = useRef(null)
  const guideTriggerRef = useRef(null)
  const guideCloseRef = useRef(null)
  const pendingScrollRestoreRef = useRef(null)
  const pendingModuleEntryRef = useRef(null)
  const pendingModuleScrollRef = useRef(false)
  const pendingModuleScrollTargetRef = useRef(null)
  const moduleActivationTimerRef = useRef(null)
  const moduleTransitionTimerRef = useRef(null)
  const reviewRequestIdRef = useRef(0)
  const reviewAbortControllerRef = useRef(null)
  const importAbortControllerRef = useRef(null)
  const aiAbortControllerRef = useRef(null)
  const lastAiPromptRef = useRef('')
  const lastImportFileRef = useRef(null)
  const [localOnlyMode, setLocalOnlyMode] = useState(() => loadBoolean(STORAGE_KEYS.localOnlyMode))
  const [reviewStage, setReviewStage] = useState('idle')
  const [importStage, setImportStage] = useState('idle')
  const [aiStage, setAiStage] = useState('idle')
  const [quota, setQuota] = useState(null)
  const [importError, setImportError] = useState(false)
  const [acceptedIds, setAcceptedIds] = useState(() => restoredNegotiationSession?.acceptedIds ?? new Set())
  // 谈判三态状态机：findingId -> { status: pending|negotiating|resolved, reaction, compromise }
  const [negotiationStates, setNegotiationStates] = useState(() => restoredNegotiationSession?.negotiationStates ?? {})
  // 军师对话记录：findingId -> messages[]，与谈判会话一起持久化，隔几天回来能接着聊
  const [negotiationChats, setNegotiationChats] = useState(() => restoredNegotiationSession?.negotiationChats ?? {})
  // 从审合同卡片「问军师」深链进入谈判台时，要选中的条款
  const [deskFocusFindingId, setDeskFocusFindingId] = useState(null)
  const [acceptedRevisionItems, setAcceptedRevisionItems] = useState(() => restoredNegotiationSession?.acceptedRevisionItems ?? [])
  const [reviewHistory, setReviewHistory] = useState(loadReviewHistory)
  const [statusMessage, setStatusMessage] = useState('')
  const [isExportingDocx, setIsExportingDocx] = useState(false)
  const [aiMessages, setAiMessages] = useState(() => [createAiWelcomeMessage()])
  const [aiDraft, setAiDraft] = useState('')
  const [aiSending, setAiSending] = useState(false)
  const [aiKnowledgeHits, setAiKnowledgeHits] = useState([])
  const [aiFeedback, setAiFeedback] = useState(loadAiFeedback)
  const [aiConfig] = useState(() => {
    const defaultPreset = providerPresets.DeepSeek
    return {
      accessMode: 'platform',
      provider: 'DeepSeek',
      baseUrl: defaultPreset.baseUrl,
      model: defaultPreset.defaultModel,
      apiKey: '',
    }
  })
  const [aiFindings, setAiFindings] = useState(null)
  const [aiQualityReport, setAiQualityReport] = useState(null)
  const [findingListMinHeight, setFindingListMinHeight] = useState(0)
  const [moduleEntering, setModuleEntering] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const [isImportingContract, setIsImportingContract] = useState(false)
  const [importedContractMeta, setImportedContractMeta] = useState(null)
  const [reviewProfile, setReviewProfile] = useState({
    contractType: 'lease',
    partyRole: 'partyB',
    reviewDepth: 'strict',
  })
  const depositInputs = defaultDepositInputs
  const [needs, setNeeds] = useState(createDefaultNeeds)
  const [listing, setListing] = useState(createDefaultListing)
  const [sources, setSources] = useState(createDefaultSources)
  const needsValidation = useMemo(() => validateNeeds(needs), [needs])
  const listingValidation = useMemo(() => validateListing(listing), [listing])
  const monthlyCost = useMemo(
    () => calcMonthlyCost({ monthlyRent: listing.monthlyRent, monthlyFixedFees: listing.monthlyFixedFees, utilitiesEstimate: listing.utilitiesEstimate }),
    [listing.monthlyRent, listing.monthlyFixedFees, listing.utilitiesEstimate],
  )
  const firstPayment = useMemo(
    () => calcFirstPayment({ monthlyRent: listing.monthlyRent, prepaidMonths: listing.prepaidMonths, depositAmount: listing.depositAmount, agencyFee: listing.agencyFee }),
    [listing.monthlyRent, listing.prepaidMonths, listing.depositAmount, listing.agencyFee],
  )
  const budgetConflict = useMemo(
    () => checkBudgetConflict({ monthlyCostKnownTotal: monthlyCost.knownTotal, monthlyBudget: needs.monthlyBudget, hasUnknownCost: monthlyCost.hasUnknown }),
    [monthlyCost.knownTotal, monthlyCost.hasUnknown, needs.monthlyBudget],
  )
  const listingDisplayName = useMemo(() => generateListingName(listing), [listing])
  const commuteFit = useMemo(
    () => calcCommuteFit({ maxCommuteMinutes: needs.maxCommuteMinutes, listingCommuteMinutes: listing.commuteMinutes }),
    [needs.maxCommuteMinutes, listing.commuteMinutes],
  )
  const mustHaveFit = useMemo(
    () => calcMustHaveFit({ mustHaves: needs.mustHaves, listingText: listing.listingText }),
    [needs.mustHaves, listing.listingText],
  )
  const hasMissingInfo = useMemo(() => calcHasMissingInfo({ listing }), [listing])
  const trustSummary = useMemo(() => calcTrustSummary({ listing, sources }), [listing, sources])
  const deferredContractText = useDeferredValue(contractText)
  const reviewText = useMemo(() => cleanContractTextForReview(deferredContractText), [deferredContractText])
  const effectiveReviewProfile = useMemo(
    () => resolveReviewProfile(reviewProfile, reviewText),
    [reviewProfile, reviewText],
  )
  const localFindings = useMemo(() => analyzeContract(reviewText, effectiveReviewProfile), [reviewText, effectiveReviewProfile])
  const findings = useMemo(
    // 本地规则发现作为基底（确定性、带法条链接），AI 只补充本地没覆盖的线索；
    // 反过来以 AI 为基底时，AI 输出的细微抖动会把本地发现误判为重复，导致同一合同两次结论不同。
    () => (aiFindings ? mergeFindings(localFindings, aiFindings) : localFindings),
    [aiFindings, localFindings],
  )
  const [findingLevelFilter, setFindingLevelFilter] = useState('all')
  const [findingDimensionFilter, setFindingDimensionFilter] = useState('all')
  const [draftAccordionOpen, setDraftAccordionOpen] = useState(false)
  const [activeFindingId, setActiveFindingId] = useState(null)
  // 单开手风琴：当前展开的风险卡片 id（null = 全部收缩），配合左文右卡布局
  const [expandedFindingId, setExpandedFindingId] = useState(null)
  // 合同文件预览：null | 'annotated'（批注版合同）
  const [artifactPreview, setArtifactPreview] = useState(null)
  // 已有合同文本和审查结果时（含 localStorage 恢复的会话），默认显示原文审阅视图
  const [contractViewMode, setContractViewMode] = useState(
    () => (contractText && findings.length > 0 ? 'review' : 'input'),
  )
  // 审查时的原文快照：采纳建议不改写审阅视图，diff 以覆盖形式显示在原文上
  const [reviewBaseText, setReviewBaseText] = useState(contractText)
  // docx 导入时保留的结构化段落（{ type, text, level }），用于左栏保真渲染
  const [contractStructure, setContractStructure] = useState(restoredNegotiationSession?.contractStructure ?? null)
  // 维度筛选选项：仅列出当前确实有风险点的维度，避免空白筛选项
  const findingDimensionOptions = useMemo(() => {
    const counts = {}
    findings.forEach((finding) => {
      const dimension = finding.dimension || '其他'
      counts[dimension] = (counts[dimension] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([dimension, count]) => ({ dimension, count }))
  }, [findings])
  const visibleFindings = useMemo(() => {
    const filtered = findings.filter(
      (finding) =>
        !acceptedIds.has(finding.id)
        && (findingLevelFilter === 'all' || finding.level === findingLevelFilter)
        && (findingDimensionFilter === 'all' || (finding.dimension || '其他') === findingDimensionFilter),
    )
    const order = { high: 0, medium: 1, low: 2 }
    return filtered.slice().sort((a, b) => order[a.level] - order[b.level] || (a.priority || '').localeCompare(b.priority || ''))
  }, [findings, acceptedIds, findingLevelFilter, findingDimensionFilter])
  const reviewFacts = useMemo(() => extractContractFacts(reviewText), [reviewText])
  const reviewQualityGate = useMemo(() => getReviewQualityGate(reviewFacts), [reviewFacts])
  const summary = useMemo(() => getRiskSummary(findings, aiQualityReport, reviewQualityGate), [findings, aiQualityReport, reviewQualityGate])
  // 签约判断结论（供顶栏状态卡显示结论而非重复的风险计数）
  const decision = useMemo(
    () => resolveDecision({
      budgetConflict,
      highCount: summary.highCount,
      hasMissingInfo,
      needsFilled: Boolean(needs.monthlyBudget) && Boolean(needs.moveInDate),
      listingFilled: Boolean(listing.monthlyRent),
    }),
    [budgetConflict, summary.highCount, hasMissingInfo, needs.monthlyBudget, needs.moveInDate, listing.monthlyRent],
  )
  const revisionItems = acceptedRevisionItems
  // 原文审阅视图的高亮数据：当前 findings + 已采纳项（采纳后 findings 会因正文改写而失去该条，需从 revisionItems 补回）
  const highlightFindings = useMemo(() => {
    const map = new Map()
    findings.forEach((finding) => map.set(finding.id, finding))
    revisionItems.forEach((finding) => map.set(finding.id, finding))
    return [...map.values()]
  }, [findings, revisionItems])
  const revisedContractDraft = useMemo(() => createRevisedContractDraft(contractText, revisionItems), [contractText, revisionItems])
  const depositResult = useMemo(() => calculateDepositReturn(depositInputs), [depositInputs])
  const selectedDemoContract = useMemo(
    () => demoContracts.find((contract) => contract.id === selectedDemoContractId) || demoContracts[0],
    [selectedDemoContractId],
  )
  // 待采纳列表用未筛选的 findings 计算，避免「筛选到空等级」时误判已全部采纳
  const pendingFindings = useMemo(
    () => findings.filter((finding) => !acceptedIds.has(finding.id)),
    [findings, acceptedIds],
  )
  const pendingFindingsCount = pendingFindings.length
  const allFindingsAccepted = findings.length > 0 && pendingFindingsCount === 0
  // 谈判状态派生：已谈妥（可落稿）的风险点数量
  const resolvedCount = useMemo(
    () => findings.filter((f) => negotiationStates[f.id]?.status === 'resolved').length,
    [findings, negotiationStates],
  )
  const negotiationStarted = resolvedCount > 0 || Object.keys(negotiationStates).length > 0
  const updateNegotiationState = (findingId, patch) => {
    setNegotiationStates((current) => ({
      ...current,
      [findingId]: { ...current[findingId], ...patch },
    }))
  }
  // 军师对话落库：一次追加「用户消息 + 军师回复」两条
  const appendNegotiationChat = (findingId, newMessages) => {
    setNegotiationChats((current) => ({
      ...current,
      [findingId]: [...(current[findingId] || []), ...newMessages],
    }))
  }
  // 审合同卡片「问军师」：跳谈判台并选中该条款
  const openNegotiationDesk = (findingId) => {
    setDeskFocusFindingId(findingId)
    navigateToModule('negotiation')
  }
  const needsFilled = Boolean(needs.monthlyBudget) && Boolean(needs.moveInDate)
  const contractFilled = contractTouched && Boolean(contractText.trim())
  const aiContextTab = activeTab === 'ai' ? lastBusinessTab : activeTab
  const aiFeedbackText = `反馈：${aiFeedback.helpful} 有帮助 / ${aiFeedback.needsWork} 需改进`
  const assistantStatus = useMemo(
    () => getAssistantStatus({
      activeTab: aiContextTab,
      highCount: summary.highCount,
      pendingCount: pendingFindingsCount,
      resolvedCount,
      acceptedCount: acceptedIds.size,
      contractReviewed: contractTouched && findings.length > 0,
    }),
    [acceptedIds.size, aiContextTab, contractTouched, findings.length, pendingFindingsCount, resolvedCount, summary.highCount],
  )
  const importedIsOcr = Boolean(importedContractMeta?.source === '图片 OCR' || importedContractMeta?.type?.includes('OCR'))
  const importedConfidence = Number(importedContractMeta?.confidence || 0)
  const importedNeedsManualCheck = importedIsOcr && importedConfidence < OCR_REVIEW_WARNING_CONFIDENCE

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.localOnlyMode, String(localOnlyMode)) } catch { /* optional */ }
  }, [localOnlyMode])

  // 持久化「谈判工作台」会话：合同文本、已采纳项、谈判三态，隔几天回来能接着记
  useEffect(() => {
    try {
      if (!contractText.trim()) {
        localStorage.removeItem(STORAGE_KEYS.negotiationSession)
        return
      }
      localStorage.setItem(
        STORAGE_KEYS.negotiationSession,
        JSON.stringify({
          contractText,
          acceptedIds: [...acceptedIds],
          acceptedRevisionItems,
          negotiationStates,
          negotiationChats,
          contractStructure,
        }),
      )
    } catch { /* localStorage may be unavailable */ }
  }, [contractText, acceptedIds, acceptedRevisionItems, negotiationStates, negotiationChats, contractStructure])

  // 首次采纳建议时，自动展开「修订草案」折叠区，引导用户看到成果
  const hadRevisionsRef = useRef(false)
  useEffect(() => {
    if (!hadRevisionsRef.current && revisionItems.length > 0) {
      setDraftAccordionOpen(true)
    }
    hadRevisionsRef.current = revisionItems.length > 0
  }, [revisionItems.length])

  useEffect(() => {
    const syncUrl = () => {
      const params = new URLSearchParams(window.location.search)
      params.set('module', activeTab)
      window.history.replaceState({ module: activeTab }, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`)
    }
    syncUrl()
    const onPopState = () => setActiveTab(getInitialTab())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [activeTab])

  useEffect(() => {
    const loadQuota = async () => {
      try {
        const response = await fetch('/api/ai/quota', { headers: { 'x-rental-safe-account': getOrCreateAccountId() } })
        if (response.ok) setQuota(await response.json())
      } catch { /* offline is handled by local fallback */ }
    }
    loadQuota()
  }, [])
  const getStickyOffset = useCallback(() => ['.sidebar', '.announcement-strip'].reduce((total, selector) => {
    const element = document.querySelector(selector)
    if (!element) return total

    const style = window.getComputedStyle(element)
    const isVisible = style.display !== 'none' && style.visibility !== 'hidden'
    const isSticky = style.position === 'sticky' || style.position === 'fixed'

    return isVisible && isSticky ? total + element.getBoundingClientRect().height : total
  }, 0), [])

  const scrollPageTo = useCallback((top, behavior = 'auto') => {
    if (behavior === 'smooth') {
      window.scrollTo({ top, left: 0, behavior: 'smooth' })
      return
    }

    const previousScrollBehavior = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo({ top, left: 0, behavior: 'auto' })
    document.documentElement.style.scrollBehavior = previousScrollBehavior
  }, [])

  const alignWorkspaceTop = useCallback((behavior = 'auto') => {
    const anchor = workspaceRef.current?.querySelector('.topbar h1') || workspaceRef.current
    if (!anchor) return

    scrollPageTo(Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - getStickyOffset() - 16), behavior)
  }, [getStickyOffset, scrollPageTo])

  const alignElementBelowSticky = useCallback((selector, behavior = 'auto') => {
    const element = document.querySelector(selector)
    if (!element) return

    scrollPageTo(Math.max(0, element.getBoundingClientRect().top + window.scrollY - getStickyOffset() - 14), behavior)
  }, [getStickyOffset, scrollPageTo])

  useEffect(() => {
    try {
      if (reviewHistory.length) {
        localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(reviewHistory))
      } else {
        localStorage.removeItem(STORAGE_KEYS.history)
      }
    } catch {
      // localStorage may be unavailable in private browsing or restricted environments.
    }
  }, [reviewHistory])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.aiFeedback, JSON.stringify(aiFeedback))
    } catch {
      // Feedback persistence is optional in restricted storage environments.
    }
  }, [aiFeedback])

  useLayoutEffect(() => {
    const shouldAnimateModuleEntry = pendingModuleEntryRef.current === activeTab
    const shouldAlignModuleTop = pendingModuleScrollRef.current
    if (!shouldAnimateModuleEntry && !shouldAlignModuleTop) return undefined

    const moduleScrollTarget = pendingModuleScrollTargetRef.current
    pendingModuleEntryRef.current = null
    pendingModuleScrollRef.current = false
    pendingModuleScrollTargetRef.current = null
    let firstFrameId = 0
    let secondFrameId = 0
    let alignTimeoutId = 0
    const alignModuleView = () => {
      if (moduleScrollTarget) {
        alignElementBelowSticky(moduleScrollTarget)
        return
      }

      alignWorkspaceTop()
    }

    if (shouldAlignModuleTop) {
      alignModuleView()
      firstFrameId = window.requestAnimationFrame(() => {
        alignModuleView()
        secondFrameId = window.requestAnimationFrame(alignModuleView)
      })
      alignTimeoutId = window.setTimeout(alignModuleView, 260)
    }

    if (!shouldAnimateModuleEntry) return undefined

    setModuleEntering(true)

    window.clearTimeout(moduleTransitionTimerRef.current)
    moduleTransitionTimerRef.current = window.setTimeout(() => {
      setModuleEntering(false)
    }, 520)

    return () => {
      window.cancelAnimationFrame(firstFrameId)
      window.cancelAnimationFrame(secondFrameId)
      window.clearTimeout(alignTimeoutId)
      window.clearTimeout(moduleTransitionTimerRef.current)
    }
  }, [activeTab, alignElementBelowSticky, alignWorkspaceTop])

  useLayoutEffect(() => {
    const restore = pendingScrollRestoreRef.current
    if (!restore) return undefined

    const restoreScroll = () => {
      const anchor = findingsListRef.current
      if (!anchor) {
        window.scrollTo({
          top: restore.scrollY,
          left: restore.scrollX,
          behavior: 'auto',
        })
        return
      }

      const nextTop = anchor.getBoundingClientRect().top
      const delta = nextTop - restore.anchorTop

      if (Math.abs(delta) > 1) {
        window.scrollBy({
          top: delta,
          left: 0,
          behavior: 'auto',
        })
      }
    }

    restoreScroll()
    const firstFrameId = window.requestAnimationFrame(() => {
      restoreScroll()
      window.requestAnimationFrame(restoreScroll)
    })
    const timeoutId = window.setTimeout(restoreScroll, 120)

    pendingScrollRestoreRef.current = null

    return () => {
      window.cancelAnimationFrame(firstFrameId)
      window.clearTimeout(timeoutId)
    }
  }, [findingListMinHeight, visibleFindings.length])

  useEffect(() => {
    if (!showGuide) return undefined

    const previouslyFocused = document.activeElement
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    guideCloseRef.current?.focus({ preventScroll: true })

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setShowGuide(false)
        return
      }

      if (event.key === 'Tab') {
        const modal = document.querySelector('.guide-modal')
        const focusable = modal
          ? [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
          : []
        if (!focusable.length) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousBodyOverflow
      document.body.style.paddingRight = previousBodyPaddingRight
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [showGuide])

  const activeProviderPreset = providerPresets[aiConfig.provider] || providerPresets.DeepSeek
  const modelConnectionLabel = `${activeProviderPreset.label} 平台模型`
  const openRiskGuide = () => {
    setShowGuide(true)
  }

  const navigateToModule = (tab, options = {}) => {
    tab = normalizeTab(tab)
    const anchor = workspaceRef.current
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const visualGap = 0
    const top = anchor ? Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - getStickyOffset() - visualGap) : 0
    const shouldPrepareAtTop = anchor && window.scrollY > top + 24

    window.clearTimeout(moduleTransitionTimerRef.current)
    window.clearTimeout(moduleActivationTimerRef.current)

    const activateModule = () => {
      pendingModuleEntryRef.current = tab
      pendingModuleScrollRef.current = true
      pendingModuleScrollTargetRef.current = options.scrollTarget || null

      if (BUSINESS_CONTEXT_TABS.has(tab)) {
        setLastBusinessTab(tab)
      } else if (tab === 'ai' && BUSINESS_CONTEXT_TABS.has(activeTab)) {
        setLastBusinessTab(activeTab)
      }

      setActiveTab(tab)
    }

    if (shouldPrepareAtTop) {
      scrollPageTo(top)
    }

    activateModule()
    if (!shouldPrepareAtTop && anchor) {
      alignWorkspaceTop(prefersReducedMotion ? 'auto' : 'smooth')
    }

    if (options.closeGuide) {
      setShowGuide(false)
    }
    if (options.message) {
      setStatusMessage(options.message)
    }
  }

  const jumpFromGuide = (tab) => {
    navigateToModule(tab, {
      closeGuide: true,
      message: `已进入${workflowLabels[tab] || tab}首页，可以按签约决策流程继续操作`,
    })
  }

  const returnToDemoRoute = () => {
    navigateToModule('proposal', {
      message: '已返回首页演示路线，可继续选择下一步',
      scrollTarget: '.proposal-demo-route',
    })
  }

  const enterModuleFromCard = (tab) => {
    if (tab === 'contract') {
      replaceContractText('')
      setContractTouched(false)
      setStatusMessage('已开启新的合同审查，请上传或粘贴合同')
    }
    navigateToModule(tab, {
      message: `正在进入${workflowLabels[tab] || tab}首页`,
    })
  }

  const switchModuleFromNav = (tab) => {
    navigateToModule(tab)
  }

  const scrollToFindings = () => {
    const target = findingsPanelRef.current
    if (!target) return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const top = target.getBoundingClientRect().top + window.scrollY - getStickyOffset() - 8
    window.scrollTo({ top, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }

  // 收缩/展开风险卡片（单开手风琴）
  const toggleFindingExpanded = (id) => setExpandedFindingId((current) => (current === id ? null : id))

  // 点击原文高亮 → 定位到右侧对应风险卡片并闪烁
  const focusFinding = (findingId) => {
    setActiveFindingId(findingId)
    setExpandedFindingId(findingId)
    const panel = findingsPanelRef.current
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (panel) {
      const top = panel.getBoundingClientRect().top + window.scrollY - getStickyOffset() - 8
      window.scrollTo({ top, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
    }
    // 卡片闪烁：滚动完成后定位到具体卡片
    window.setTimeout(() => {
      const card = document.getElementById(`finding-${findingId}`)
      if (card) card.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' })
    }, prefersReducedMotion ? 0 : 320)
    window.setTimeout(() => setActiveFindingId(null), 2400)
  }

  // 点击风险卡片「定位原文」→ 滚动左栏并闪烁对应高亮
  const focusMark = (findingId) => {
    setContractViewMode('review')
    setActiveFindingId(findingId)
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => {
      const view = contractViewRef.current
      if (!view) return
      const mark = view.querySelector(`[data-finding-id="${findingId}"]`)
      if (mark) {
        mark.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' })
      } else {
        view.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' })
      }
    }, 30)
    window.setTimeout(() => setActiveFindingId(null), 2400)
  }

  const openAiExpert = () => {
    const sourceTab = BUSINESS_CONTEXT_TABS.has(activeTab) ? activeTab : lastBusinessTab

    navigateToModule('ai', {
      message: `已进入租房小助手，当前参考：${workflowLabels[sourceTab] || sourceTab}`,
    })
  }

  const resetAiChat = () => {
    setAiMessages([createAiWelcomeMessage()])
    setAiKnowledgeHits([])
  }

  const rateAiMessage = (messageId, rating) => {
    setAiFeedback((current) => {
      const nextByMessage = { ...current.byMessage, [messageId]: rating }
      return normalizeAiFeedback({ byMessage: nextByMessage })
    })
    setStatusMessage(`已记录 AI 回复反馈：${rating === 'helpful' ? '有帮助' : '需改进'}`)
  }

  const cancelPendingReview = () => {
    const hadPendingReview = Boolean(reviewAbortControllerRef.current) || isReviewing
    if (!hadPendingReview) return false

    reviewRequestIdRef.current += 1
    reviewAbortControllerRef.current?.abort()
    reviewAbortControllerRef.current = null
    setReviewStage('idle')
    setIsReviewing(false)
    setAiQualityReport({ status: 'failed', message: '审查已取消，不能据此判断合同安全。请重新审查。' })
    return true
  }

  const cancelAiChat = () => {
    if (!aiSending) return
    aiAbortControllerRef.current?.abort()
    aiAbortControllerRef.current = null
    setAiSending(false)
    setAiStage('idle')
    setStatusMessage('AI 对话已取消，可点击重试继续上一条问题')
  }

  const submitAiChat = async (rawPrompt) => {
    const prompt = String(rawPrompt || '').trim()
    if (!prompt || aiSending) return

    const nextUserMessage = { id: createMessageId('user'), role: 'user', content: prompt }
    const nextAssistantId = createMessageId('assistant')
    const nextMessages = [...aiMessages, nextUserMessage]

    setAiMessages([
      ...nextMessages,
      { id: nextAssistantId, role: 'assistant', content: '正在思考中…', pending: true },
    ])
    setAiDraft('')
    setAiSending(true)
    setAiStage(localOnlyMode ? 'local' : 'rag')
    lastAiPromptRef.current = prompt
    aiAbortControllerRef.current = new AbortController()
    setStatusMessage('租房小助手正在整理当前进度')

    let ragItems = []

    try {
      ragItems = localOnlyMode ? knowledgeBaseItems.slice(0, 5) : await searchAiKnowledge(
        buildRagSearchQuery({
          prompt,
          activeTab: aiContextTab,
          reviewText,
          findings,
        }),
        5,
        { signal: aiAbortControllerRef.current.signal },
      )
      setAiKnowledgeHits(ragItems)

      if (localOnlyMode) {
        const fallbackReply = createLocalAiFallbackReply({ prompt, activeTab: aiContextTab, findings, depositResult, ragItems })
        setAiMessages([...nextMessages, { id: nextAssistantId, role: 'assistant', content: fallbackReply }])
        setStatusMessage('仅本地分析模式已生成规则库回复，未发送任何远端请求')
        return
      }
      setAiStage('model')

      const systemContext = redactSensitiveText(buildSystemAiContext({
        activeTab: aiContextTab,
        reviewText: redactSensitiveText(reviewText),
        effectiveReviewProfile,
        findings,
        summary,
        acceptedIds,
        revisionItems,
        depositInputs,
        depositResult,
        reviewHistory,
      }))
      const response = await callAiModel(
        [
          {
            role: 'system',
            content:
              '你是“签前有数系统 AI”，已经接入整个签前有数产品。你可以使用系统上下文回答签约评估、合同风险、费用估算等问题。回答时优先结合当前模块、合同原文、证据状态和知识库命中条目，给出能直接执行的建议。保持简洁、准确、专业、可操作；不要输出与租房无关的内容；不要编造法律条文或政策口径。',
          },
          {
            role: 'system',
            content: buildAiResponseSkillPrompt(),
          },
          {
            role: 'system',
            content: systemContext,
          },
          {
            role: 'system',
            content: redactSensitiveText(buildRagContextPrompt(ragItems)),
          },
          ...nextMessages.slice(-12).map((message) => ({
            role: message.role,
            content: redactSensitiveText(message.content),
          })),
        ],
        { temperature: 0.2, maxTokens: 3000, signal: aiAbortControllerRef.current.signal },
      )

      const reply = normalizeAiReplyText(extractAssistantChatContent(response)) || '我暂时没有拿到明确回复，请再把问题说具体一点。'
      setAiMessages([...nextMessages, { id: nextAssistantId, role: 'assistant', content: reply }])
      setStatusMessage('租房小助手已结合当前进度回复')
    } catch (error) {
      if (error?.name === 'AbortError') {
        setAiMessages(nextMessages)
        return
      }
      const fallbackReply = createLocalAiFallbackReply({
        prompt,
        activeTab: aiContextTab,
        findings,
        depositResult,
        ragItems,
      })
      setAiMessages([
        ...nextMessages,
        {
          id: nextAssistantId,
          role: 'assistant',
          content: fallbackReply,
        },
      ])
      setStatusMessage(`模型暂时不可用，已切换本地知识库兜底：${error.message}`)
    } finally {
      aiAbortControllerRef.current = null
      setAiStage('idle')
      setAiSending(false)
    }
  }

  const sendAiDraft = () => {
    submitAiChat(aiDraft)
  }

  const retryAiChat = () => {
    if (lastAiPromptRef.current && !aiSending) submitAiChat(lastAiPromptRef.current)
  }

  const updateReviewProfile = (field, value) => {
    cancelPendingReview()
    setFindingListMinHeight(0)
    setReviewProfile((current) => ({ ...current, [field]: value }))
    setAiFindings(null)
    setAiQualityReport(null)
    setAcceptedIds(new Set())
    setAcceptedRevisionItems([])
    setNegotiationStates({})
    setNegotiationChats({})
    setStatusMessage('已切换为本地规则检查')
  }

  const callAiModel = async (messages, options = {}) => {
    const response = await fetch(getPlatformApiEndpoint(), {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-rental-safe-account': getOrCreateAccountId(),
      },
      body: JSON.stringify({
        provider: aiConfig.provider,
        model: aiConfig.model.trim(),
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 2200,
        ...(options.task ? { task: options.task } : {}),
        messages,
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (response.headers.get('x-ai-quota-limit')) {
      setQuota({
        used: Number(response.headers.get('x-ai-quota-limit')) - Number(response.headers.get('x-ai-quota-remaining') || 0),
        limit: Number(response.headers.get('x-ai-quota-limit')),
        remaining: Number(response.headers.get('x-ai-quota-remaining') || 0),
      })
    }

    if (!response.ok) {
      const message = data?.error?.message || data?.message || `接口请求失败：HTTP ${response.status}`
      throw new Error(message)
    }

    return data
  }

  const startReview = async () => {
    if (isReviewing) return

    const trimmedText = reviewText.trim()
    setAcceptedIds(new Set())
    setAcceptedRevisionItems([])
    setNegotiationStates({})
    setNegotiationChats({})

    if (!trimmedText) {
      setAiFindings(null)
      setAiQualityReport(null)
      setStatusMessage('请先粘贴合同正文')
      return
    }

    const requestId = reviewRequestIdRef.current + 1
    const controller = new AbortController()
    reviewRequestIdRef.current = requestId
    reviewAbortControllerRef.current?.abort()
    reviewAbortControllerRef.current = controller
    setIsReviewing(true)
    setAiFindings(null)
    setAiQualityReport({ status: 'running', message: '正在审查，完成前暂不评分。' })
    setReviewStage(localOnlyMode ? 'local' : 'rag')
    setReviewBaseText(trimmedText)
    setStatusMessage('正在检索知识库并调用平台 AI 模型审查合同')

    try {
      const aiReviewText = redactSensitiveText(trimmedText)
      const ragItems = localOnlyMode ? [] : await searchAiKnowledge(
        buildRagSearchQuery({
          prompt: '租房合同审查 押金 维修 涨租 解除 违约 入户 管辖',
          activeTab: 'contract',
          reviewText: aiReviewText,
          findings: localFindings,
        }),
        6,
        { signal: controller.signal },
      )
      if (reviewRequestIdRef.current !== requestId) return

      setAiKnowledgeHits(ragItems)

      if (localOnlyMode) {
        setAiFindings(null)
        setAiQualityReport(null)
        setStatusMessage(`本地规则审查完成，发现 ${localFindings.length} 个风险点；未发送合同内容`)
        setContractViewMode('review')
        return
      }

      setReviewStage('model')

      const data = await callAiModel(
        [
          {
            role: 'system',
            content:
              '你是严谨的租房合同解读助手，擅长识别押金、涨租、维修、入户、解除、违约金和管辖风险。必须只返回合法 JSON，且证据必须来自原文。',
          },
          { role: 'user', content: createAiReviewPrompt(aiReviewText, effectiveReviewProfile, ragItems) },
        ],
        // temperature 0：合同审查要可复现——同一份合同多次审查结论应一致
        { signal: controller.signal, task: 'contract-review', maxTokens: 6000, temperature: 0 },
      )
      if (reviewRequestIdRef.current !== requestId) return

      const { findings: nextFindings, qualityReport } = parseAiReviewResponse(data, aiReviewText)

      setAiFindings(enrichFindingsWithLegalBasis(nextFindings, localFindings))
      setAiQualityReport(qualityReport)
      setStatusMessage(
        qualityReport.status === 'incomplete'
          ? `审查未完成：${qualityReport.message}`
          : nextFindings.length
            ? `AI 审查完成，发现 ${nextFindings.length} 个风险点`
            : 'AI 审查完成，未发现明显风险',
      )
    } catch (error) {
      if (error?.name === 'AbortError' || reviewRequestIdRef.current !== requestId) return

      setAiFindings(null)
      const failureMessage = error.message || 'AI 请求失败'
      setAiQualityReport({ status: 'failed', message: `${failureMessage} 当前仅有本地规则线索，不能据此判断合同安全。` })
      setStatusMessage(`审查未完成：${failureMessage}；当前仅保留本地规则线索，不能据此判断合同安全`)
    } finally {
      if (reviewRequestIdRef.current === requestId) {
        reviewAbortControllerRef.current = null
        setReviewStage('idle')
        setIsReviewing(false)
        setContractViewMode('review')
      }
    }
  }

  const replaceContractText = (nextText, options = {}) => {
    const canceledReview = cancelPendingReview()
    const rawText = String(nextText || '')
    const boundedText = rawText.slice(0, MAX_REVIEW_CHARS)
    setFindingListMinHeight(0)
    setContractText(boundedText)
    setContractTouched(true)
    setAcceptedIds(new Set())
    setAcceptedRevisionItems([])
    setNegotiationStates({})
    setNegotiationChats({})
    setAiFindings(null)
    setAiQualityReport(null)
    setReviewBaseText(boundedText)
    setContractViewMode('input')

    if (options.importMeta) {
      setImportedContractMeta(options.importMeta)
    } else if (options.clearImportMeta !== false) {
      setImportedContractMeta(null)
    }

    // docx 导入时保留结构化段落；其它来源或手动编辑则清空，回退到伪排版
    if (options.importMeta?.source === 'Word' && options.structure?.length) {
      setContractStructure(options.structure)
    } else {
      setContractStructure(null)
    }

    if (boundedText.length < rawText.length) {
      setStatusMessage(`合同正文过长，已保留前 ${MAX_REVIEW_CHARS.toLocaleString('zh-CN')} 字`)
    } else if (options.statusMessage) {
      setStatusMessage(options.statusMessage)
    } else if (canceledReview) {
      setStatusMessage('合同内容已变化，已取消上一轮 AI 审查')
    }
  }

  const resetContractText = (nextText) => {
    replaceContractText(nextText, {
      statusMessage: '已重置合同版本和采纳状态',
    })
  }

  const handleContractTextChange = (nextText) => {
    replaceContractText(nextText, {
      statusMessage: importedContractMeta ? '已切换为手动编辑，导入状态已清除' : undefined,
    })
  }

  const updateNeedsField = (field, value) => {
    setNeeds((current) => ({ ...current, [field]: value }))
  }

  const addMustHave = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setNeeds((current) => {
      if (current.mustHaves.includes(trimmed)) return current
      if (current.mustHaves.length >= MUST_HAVES_LIMIT) return current
      return { ...current, mustHaves: [...current.mustHaves, trimmed] }
    })
  }

  const removeMustHave = (value) => {
    setNeeds((current) => ({ ...current, mustHaves: current.mustHaves.filter((item) => item !== value) }))
  }

  const updateListingField = (field, value) => {
    setListing((current) => ({ ...current, [field]: value }))
  }

  const updateSourceField = (field, value) => {
    setSources((current) => ({ ...current, [field]: value }))
  }

  const fillDemoScenario = () => {
    const scenario = createDemoScenario()
    setNeeds(scenario.needs)
    setListing(scenario.listing)
    setSources(scenario.sources)
    setStatusMessage('已填充演示需求与房源（预算 2500 / 月租 3200），可再载入演示合同查看完整判断')
  }

  const importContractFile = async (file) => {
    if (!file || isImportingContract) return

    setIsImportingContract(true)
    lastImportFileRef.current = file
    setImportError(false)
    const controller = new AbortController()
    importAbortControllerRef.current = controller
    setImportStage('解析文件')
    setStatusMessage(`正在解析合同文件：${file.name}`)

    try {
      const { extractContractTextFromFile } = await import('./utils/fileImport.js')
      setImportStage(file.type.startsWith('image/') ? (localOnlyMode ? '本地 OCR' : '上传 OCR') : '提取文本')
      const result = await extractContractTextFromFile(file, { signal: controller.signal, localOnly: localOnlyMode })
      const importedText = String(result.text || '').trim()

      if (!importedText) {
        throw new Error('没有识别到可用合同文字，请换一个更清晰的文件或直接粘贴正文')
      }

      replaceContractText(importedText, {
        importMeta: {
          name: file.name,
          source: result.source || result.type,
          type: result.type,
          size: importedText.length,
          confidence: result.confidence,
          mode: result.mode,
          importedAt: new Date().toISOString(),
        },
        structure: result.structure,
        statusMessage: `已导入${result.type}：${file.name}，共 ${importedText.length} 字`,
      })
      setReviewProfile((current) => ({ ...current, contractType: 'lease' }))
    } catch (error) {
      setImportError(true)
      setStatusMessage(`合同导入失败：${error.message}`)
    } finally {
      importAbortControllerRef.current = null
      setImportStage('idle')
      setIsImportingContract(false)
    }
  }

  const cancelContractImport = () => {
    importAbortControllerRef.current?.abort()
  }

  const retryContractImport = () => {
    if (lastImportFileRef.current && !isImportingContract) importContractFile(lastImportFileRef.current)
  }

  const handleContractFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    importContractFile(file)
  }

  const handleContractFileDrop = (event) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    importContractFile(file)
  }

  const loadDemoContract = (contract = selectedDemoContract) => {
    setSelectedDemoContractId(contract.id)
    resetContractText(contract.text)
    setReviewProfile((current) => ({ ...current, contractType: 'lease' }))
    setStatusMessage(`已载入演示合同：${contract.title}`)
  }

  const prepareReviewDemo = () => {
    const contract = selectedDemoContract || demoContracts[0]
    const scenario = createDemoScenario()
    setSelectedDemoContractId(contract.id)
    setNeeds(scenario.needs)
    setListing(scenario.listing)
    setSources(scenario.sources)
    replaceContractText(contract.text, {
      statusMessage: `已载入演示合同并准备本地规则审查：${contract.title}`,
    })
    setContractViewMode('review')
    setReviewProfile((current) => ({ ...current, contractType: 'lease' }))
    navigateToModule('contract', {
      message: '已载入演示合同，可查看风险和原文证据',
    })
  }

  const saveHistorySnapshot = () => {
    if (summary.incomplete) return
    const snapshot = {
      id: Date.now(),
      title: `审查记录 ${new Date().toLocaleTimeString()}`,
      score: summary.score,
      highCount: summary.highCount,
      mediumCount: summary.mediumCount,
      acceptedCount: acceptedIds.size,
      contractText,
    }

    setReviewHistory((current) => [snapshot, ...current].slice(0, 5))
    setStatusMessage('已保存到本地审查历史')
  }

  const clearReviewHistory = () => {
    if (!reviewHistory.length) {
      setStatusMessage('当前没有可清空的审查历史')
      return
    }

    if (!window.confirm('确定清空最近 5 次审查记录吗？清空后无法恢复。')) return

    setReviewHistory([])

    try {
      localStorage.removeItem(STORAGE_KEYS.history)
      localStorage.removeItem(STORAGE_KEYS.historyLegacy)
    } catch {
      // localStorage may be unavailable in private browsing or restricted environments.
    }

    setStatusMessage('已清空本地审查历史')
  }

  const exportAllLocalData = async () => {
    const localStorageData = {}
    try {
      Object.keys(localStorage).forEach((key) => { localStorageData[key] = localStorage.getItem(key) })
    } catch { /* restricted storage */ }
    const payload = { exportedAt: new Date().toISOString(), localStorage: localStorageData }
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `签前有数-本地数据-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setStatusMessage('全部本地数据已导出为 JSON 文件')
  }

  const clearAllLocalData = async () => {
    if (!window.confirm('确定清除全部本地合同和 AI 反馈吗？此操作无法撤销。')) return
    try { localStorage.clear() } catch { /* restricted storage */ }
    window.location.reload()
  }

  const restoreHistorySnapshot = (snapshot) => {
    replaceContractText(snapshot.contractText, {
      statusMessage: `已恢复 ${snapshot.title}`,
    })
  }

  const exportRevisedDraft = async () => {
    if (isExportingDocx) return

    setIsExportingDocx(true)
    setStatusMessage('正在生成 DOCX 优化合同')

    try {
      const { buildContractDocxBlob, downloadBlob } = await import('./utils/docxExport.js')
      const blob = await buildContractDocxBlob(revisedContractDraft)
      downloadBlob(blob, `签前有数-优化合同-${new Date().toISOString().slice(0, 10)}.docx`)
      setStatusMessage('优化版合同已生成 DOCX，可下载 Word')
    } catch (error) {
      setStatusMessage(`DOCX 生成失败：${error.message}`)
    } finally {
      setIsExportingDocx(false)
    }
  }

  const applySuggestion = (finding) => {
    if (acceptedIds.has(finding.id)) return
    // 只有「已谈妥」的项才能落稿到正式合同
    if (negotiationStates[finding.id]?.status !== 'resolved') return

    const result = applyRevisionItem(contractText, finding, { appendIfMissing: true })
    setContractText(result.text)
    setContractTouched(true)
    setAiFindings(null)
    setAiQualityReport(null)
    setAcceptedIds((current) => new Set(current).add(finding.id))
    setAcceptedRevisionItems((current) => mergeRevisionItems(current, [finding]))

    if (result.mode === 'appended') {
      setStatusMessage(`已采纳：${finding.title}，已作为补充修订条款加入草案`)
      return
    }

    setStatusMessage(`已采纳：${finding.title}`)
  }

  const applyAllSuggestions = () => {
    // 「全部落稿」只把已谈妥的风险点写进正式合同
    const resolvedFindings = pendingFindings.filter((f) => negotiationStates[f.id]?.status === 'resolved')
    if (!resolvedFindings.length) {
      setStatusMessage('还没有「已谈妥」的风险点，先把要谈的标记为已谈妥，再一键落稿。')
      return
    }

    const currentListHeight = findingsListRef.current?.getBoundingClientRect().height || 0
    const currentListTop = findingsListRef.current?.getBoundingClientRect().top || 0
    pendingScrollRestoreRef.current = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      anchorTop: currentListTop,
    }

    if (currentListHeight > 0) {
      setFindingListMinHeight(Math.ceil(currentListHeight))
    }

    let nextText = contractText
    let directCount = 0
    let appendedCount = 0
    let unchangedCount = 0

    resolvedFindings.forEach((finding) => {
      const result = applyRevisionItem(nextText, finding, { appendIfMissing: true })
      nextText = result.text

      if (result.mode === 'exact' || result.mode === 'loose') {
        directCount += 1
      } else if (result.mode === 'appended') {
        appendedCount += 1
      } else {
        unchangedCount += 1
      }
    })

    setContractText(nextText)
    setContractTouched(true)
    setAiFindings(null)
    setAiQualityReport(null)
    setAcceptedIds((current) => {
      const merged = new Set(current)
      resolvedFindings.forEach((finding) => merged.add(finding.id))
      return merged
    })
    setAcceptedRevisionItems((current) => mergeRevisionItems(current, resolvedFindings))

    const newAcceptedCount = resolvedFindings.length
    const detailText = [
      directCount ? `${directCount} 条直接改写` : '',
      appendedCount ? `${appendedCount} 条补充到修订条款` : '',
      unchangedCount ? `${unchangedCount} 条已在草案中` : '',
    ].filter(Boolean).join('，')

    setStatusMessage(
      detailText
        ? `已落稿 ${newAcceptedCount} 条，其中 ${detailText}`
        : `已落稿 ${newAcceptedCount} 条已谈妥的条款`,
    )
  }

  return (
    <main className={`app-shell ${activeTab === 'proposal' ? 'app-shell-home' : ''} app-shell-${activeTab}`}>
      <a className="skip-link" href="#main-workspace">跳到主内容</a>
      {activeTab !== 'proposal' && (
        <AppSidebar
          acceptedCount={acceptedIds.size}
          activeTab={activeTab}
          findingsCount={findings.length}
          localOnlyMode={localOnlyMode}
          onClearAllData={clearAllLocalData}
          onExportAllData={exportAllLocalData}
          onSwitchModule={switchModuleFromNav}
          onToggleLocalOnly={setLocalOnlyMode}
          pendingFindingsCount={pendingFindingsCount}
        />
      )}
      {showAnnouncement && (
        <AnnouncementStrip
          guideTriggerRef={guideTriggerRef}
          onOpenGuide={openRiskGuide}
          onDismiss={() => setShowAnnouncement(false)}
        />
      )}

      {showGuide && (
        <RiskGuideModal closeRef={guideCloseRef} onClose={() => setShowGuide(false)} onJump={jumpFromGuide} />
      )}

      <section
        className={`workspace ${moduleEntering ? 'module-entering' : ''}`}
        id="main-workspace"
        ref={workspaceRef}
        tabIndex={-1}
      >
        <AppTopbar
          activeTab={activeTab}
          findingsCount={findings.length}
          revisionItemsCount={revisionItems.length}
          verdictTitle={decision.title}
          onBackToDemoRoute={returnToDemoRoute}
        />

        {statusMessage && (
          <div className="status-toast" role="status" aria-live="polite">
            {statusMessage}
          </div>
        )}

        <div className="mobile-read-notice" role="note">
          <strong>移动端查看模式</strong>
          <span>签约评估属于重阅读场景，建议在电脑端完成填写、修改与导出，手机端更适合查看结论。</span>
        </div>

        {activeTab === 'ai' ? (
          <AiAssistantPanel
            activeTab={aiContextTab}
            aiConfig={aiConfig}
            aiDraft={aiDraft}
            aiFeedback={aiFeedback}
            aiFeedbackText={aiFeedbackText}
            aiKnowledgeHits={aiKnowledgeHits}
            aiMessages={aiMessages}
            aiSending={aiSending}
            aiStage={aiStage}
            localOnlyMode={localOnlyMode}
            quota={quota}
            modelConnectionLabel={modelConnectionLabel}
            onDraftChange={setAiDraft}
            onRateMessage={rateAiMessage}
            onResetChat={resetAiChat}
            onCancel={cancelAiChat}
            onRetry={retryAiChat}
            onSendDraft={sendAiDraft}
            assistantStatus={assistantStatus}
          />
        ) : activeTab === 'needs' ? (
          <>
            <DecisionInputForms
              needs={needs}
              needsValidation={needsValidation}
              listing={listing}
              listingValidation={listingValidation}
              sources={sources}
              onNeedsChange={updateNeedsField}
              onMustHaveAdd={addMustHave}
              onMustHaveRemove={removeMustHave}
              onListingChange={updateListingField}
              onSourceChange={updateSourceField}
              onFillDemo={fillDemoScenario}
            />
            <div className="step-cta">
              <button className="primary-button" type="button" onClick={() => navigateToModule('contract')}>
                下一步：审合同 →
              </button>
            </div>
          </>
        ) : activeTab === 'contract' ? (
          <>
            <DecisionStepper
              currentTab="contract"
              needsFilled={needsFilled}
              contractFilled={contractFilled}
              negotiationFilled={negotiationStarted}
              onStepClick={navigateToModule}
            />
            <div className="review-layout">
            {contractViewMode === 'review' && contractText ? (
              <section className="work-panel input-panel contract-review-panel">
                <div className="contract-view-head">
                  <div>
                    <h2>合同原文</h2>
                    <p>红色为高风险、琥珀为中、青为低；点击高亮定位到对应风险点，已采纳处显示修改对比。</p>
                  </div>
                  <button className="ghost-button compact-button" type="button" onClick={() => setContractViewMode('input')}>
                    重新输入合同
                  </button>
                </div>
                <div className="contract-view-scroll" ref={contractViewRef}>
                  {contractStructure?.length ? (
                    <DocumentView
                      structure={contractStructure}
                      findings={highlightFindings}
                      acceptedIds={acceptedIds}
                      activeFindingId={activeFindingId}
                      onFindingClick={focusFinding}
                    />
                  ) : (
                    <HighlightedContract
                      text={reviewBaseText || contractText}
                      findings={highlightFindings}
                      acceptedIds={acceptedIds}
                      activeFindingId={activeFindingId}
                      onFindingClick={focusFinding}
                    />
                  )}
                </div>
              </section>
            ) : (
              <ReviewInputPanel
                contractText={contractText}
                effectiveReviewProfile={effectiveReviewProfile}
                handleContractFileChange={handleContractFileChange}
                handleContractFileDrop={handleContractFileDrop}
                handleContractTextChange={handleContractTextChange}
                importedConfidence={importedConfidence}
                importedContractMeta={importedContractMeta}
                importedIsOcr={importedIsOcr}
                importedNeedsManualCheck={importedNeedsManualCheck}
                importError={importError}
                isImportingContract={isImportingContract}
                importStage={importStage}
                localOnlyMode={localOnlyMode}
                onCancelImport={cancelContractImport}
                onCancelReview={cancelPendingReview}
                onRetryImport={retryContractImport}
                isReviewing={isReviewing}
                reviewStage={reviewStage}
                loadDemoContract={loadDemoContract}
                onClearImportMeta={() => setImportedContractMeta(null)}
                resetContractText={resetContractText}
                reviewProfile={reviewProfile}
                reviewText={reviewText}
                selectedDemoContract={selectedDemoContract}
                selectedDemoContractId={selectedDemoContractId}
                setSelectedDemoContractId={setSelectedDemoContractId}
                startReview={startReview}
                updateReviewProfile={updateReviewProfile}
              />
            )}

            <div className="work-column">
            <section className="work-panel summary-panel">

              <div className={`summary-card ${summary.tone}`}>
                <div className="summary-copy">
                  <p className="eyebrow">合同风险概览</p>
                  <div className="score-line">
                    <strong>{summary.incomplete ? '—' : summary.highCount}</strong>
                    <span>{summary.incomplete ? '暂不评分' : '处高风险'}</span>
                  </div>
                  <h2>{summary.incomplete ? summary.label : `已识别 ${findings.length} 处风险点`}</h2>
                  <p className="summary-advice">{summary.incomplete ? `当前保留 ${findings.length} 条线索，不能据此判断合同安全。` : '先看高风险项，再决定哪些要和房东谈、哪些可以直接记录为修改建议。'}</p>
                  <button className="primary-button summary-action" type="button" onClick={scrollToFindings}>
                    逐条看风险点 ↓
                  </button>
                </div>
                <div className="score-ring" style={{ '--score': `${(summary.score ?? 0) * 3.6}deg` }} aria-label={summary.incomplete ? '风险暂未评分' : `风险分 ${summary.score}`}>
                  {summary.incomplete ? <AlertTriangle size={34} aria-hidden="true" /> : <ShieldCheck size={34} aria-hidden="true" />}
                </div>
              </div>

              <div className="summary-counts" role="group" aria-label="按风险等级筛选">
                <button
                  type="button"
                  className={`count-chip high ${findingLevelFilter === 'high' ? 'active' : ''}`}
                  onClick={() => { setFindingLevelFilter('high'); scrollToFindings() }}
                >
                  <strong>{summary.highCount}</strong>
                  <span>高风险</span>
                </button>
                <button
                  type="button"
                  className={`count-chip medium ${findingLevelFilter === 'medium' ? 'active' : ''}`}
                  onClick={() => { setFindingLevelFilter('medium'); scrollToFindings() }}
                >
                  <strong>{summary.mediumCount}</strong>
                  <span>中风险</span>
                </button>
                <button
                  type="button"
                  className={`count-chip low ${findingLevelFilter === 'low' ? 'active' : ''}`}
                  onClick={() => { setFindingLevelFilter('low'); scrollToFindings() }}
                >
                  <strong>{findings.length - summary.highCount - summary.mediumCount}</strong>
                  <span>低风险</span>
                </button>
                <div className="count-meta">
                  <strong>{acceptedIds.size}</strong>
                  <span>已采纳</span>
                </div>
              </div>
            </section>

            <section className="work-panel findings-panel" ref={findingsPanelRef}>
              <div className="panel-head">
                <div>
                  <h2>风险点与行动</h2>
                  <p>每条风险都绑定合同原文；优先处理高风险项，谈妥后再写入修订合同。</p>
                </div>
              </div>

              <div className="finding-filters" role="group" aria-label="筛选风险点">
                {[
                  { key: 'all', label: '全部' },
                  { key: 'high', label: '高风险' },
                  { key: 'medium', label: '中风险' },
                  { key: 'low', label: '低风险' },
                ].map(({ key, label }) => (
                  <button
                    className={`finding-filter-chip ${findingLevelFilter === key ? 'active' : ''}`}
                    key={key}
                    type="button"
                    onClick={() => setFindingLevelFilter(key)}
                  >
                    {label}
                  </button>
                ))}
                <span className="filters-divider" aria-hidden="true" />
                <button
                  className={`finding-filter-chip dimension ${findingDimensionFilter === 'all' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setFindingDimensionFilter('all')}
                >
                  全部维度
                </button>
                {findingDimensionOptions.map(({ dimension, count }) => (
                  <button
                    className={`finding-filter-chip dimension ${findingDimensionFilter === dimension ? 'active' : ''}`}
                    key={dimension}
                    type="button"
                    onClick={() => setFindingDimensionFilter(dimension)}
                  >
                    {dimension} {count}
                  </button>
                ))}
              </div>

              <div className="finding-progress" aria-label="谈判进度">
                <span>已谈妥 {resolvedCount}/{findings.length} 个风险点</span>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${findings.length ? Math.round((resolvedCount / findings.length) * 100) : 0}%` }} />
                </div>
              </div>

              <div
                className={`finding-list ${findingListMinHeight ? 'height-locked' : ''}`}
                ref={findingsListRef}
                style={findingListMinHeight ? { minHeight: findingListMinHeight } : undefined}
              >
                {visibleFindings.length ? (
                  visibleFindings.map((finding) => (
                    <FindingItem
                      accepted={false}
                      active={activeFindingId === finding.id}
                      expanded={expandedFindingId === finding.id}
                      finding={finding}
                      key={finding.id}
                      onApply={applySuggestion}
                      onAskAdvisor={openNegotiationDesk}
                      onLocate={focusMark}
                      onStateChange={updateNegotiationState}
                      onToggle={toggleFindingExpanded}
                      state={negotiationStates[finding.id]}
                    />
                  ))
                ) : findings.length ? (
                  <p className="empty-note empty-findings">
                    {(findingLevelFilter !== 'all' || findingDimensionFilter !== 'all') && pendingFindingsCount > 0
                      ? '当前筛选下没有对应风险点，试试切换筛选条件。'
                      : '当前建议已全部落稿，已写入内容可在谈判台下方修订草案中查看和导出。'}
                  </p>
                ) : (
                  <p className="empty-note empty-findings">{summary.incomplete ? '审查尚未完成，不能据此判断合同安全。请重新审查或人工复核。' : '暂无风险点。建议仍由人工复核关键金额、期限、解除和争议解决条款。'}</p>
                )}
              </div>

            </section>

            <div className="step-cta">
              <button className="primary-button" type="button" onClick={() => navigateToModule('negotiation')}>
                去谈判台处理条款 →
              </button>
              <span className="step-cta-note">针对具体条款沟通，修改后返回审合同复查。</span>
            </div>

            {findings.length > 0 && (
              <section className="work-panel contract-files-panel">
                <div className="contract-files-copy">
                  <p className="eyebrow">审查产物</p>
                  <h2>合同文件</h2>
                  <p>需要发给家人把关或带去现场时，再打开批注版合同。</p>
                </div>
                <button className="contract-file-action" type="button" onClick={() => setArtifactPreview('annotated')}>
                  <span className="contract-file-icon">
                    <FileText size={18} aria-hidden="true" />
                  </span>
                  <span className="contract-file-body">
                    <strong>批注版合同</strong>
                    <span>高亮风险并附随文批注</span>
                    <em>预览 · 打印 / 存 PDF</em>
                  </span>
                </button>
              </section>
            )}
            </div>
            </div>

            <section className="work-panel reference-panel history-panel">
              <details className="ref-accordion">
                <summary>
                  <span className="ref-title">审查历史</span>
                  <span className="ref-sub">本地保留最近 5 次</span>
                </summary>
                <div className="ref-body">
                  <div className="ref-actions ref-actions-top">
                    <button
                      className="ghost-button compact-button"
                      type="button"
                      onClick={clearReviewHistory}
                      disabled={!reviewHistory.length}
                    >
                      清空历史
                    </button>
                    <button className="ghost-button compact-button" type="button" onClick={saveHistorySnapshot} disabled={summary.incomplete}>
                      保存当前
                    </button>
                  </div>
                  {reviewHistory.length ? (
                    <div className="history-list">
                      {reviewHistory.map((item) => (
                        <button type="button" key={item.id} onClick={() => restoreHistorySnapshot(item)}>
                          <strong>{item.title}</strong>
                          <span>{item.score} 分 · 高风险 {item.highCount} · 已采纳 {item.acceptedCount}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-note">暂无历史记录，点击「保存当前」后会自动出现。</p>
                  )}
                </div>
              </details>
            </section>

            <ArtifactPreview
              acceptedIds={acceptedIds}
              findings={highlightFindings}
              kind={artifactPreview}
              negotiationStates={negotiationStates}
              onClose={() => setArtifactPreview(null)}
              summary={summary}
              text={reviewBaseText || contractText}
            />
          </>
        ) : activeTab === 'negotiation' ? (
          <>
            <DecisionStepper
              currentTab="negotiation"
              needsFilled={needsFilled}
              contractFilled={contractFilled}
              negotiationFilled={negotiationStarted}
              onStepClick={navigateToModule}
            />
            <NegotiationDesk
              acceptedIds={acceptedIds}
              callAi={callAiModel}
              findings={findings}
              focusFindingId={deskFocusFindingId}
              localOnlyMode={localOnlyMode}
              negotiationChats={negotiationChats}
              negotiationStates={negotiationStates}
              resolvedCount={resolvedCount}
              searchKnowledge={searchAiKnowledge}
              onAppendChat={appendNegotiationChat}
              onApplyResolved={applyAllSuggestions}
              onChangeNegotiationState={updateNegotiationState}
              onFocusConsumed={() => setDeskFocusFindingId(null)}
              onGoReview={() => navigateToModule('contract')}
            />
            <RevisionDraftPanel
              isExporting={isExportingDocx}
              onExport={exportRevisedDraft}
              onGoReview={() => navigateToModule('contract')}
              onToggle={setDraftAccordionOpen}
              open={draftAccordionOpen}
              revisedContractDraft={revisedContractDraft}
              revisionItems={revisionItems}
            />
          </>
        ) : activeTab === 'verdict' ? (
          <>
            <DecisionStepper
              currentTab="verdict"
              needsFilled={needsFilled}
              contractFilled={contractFilled}
              negotiationFilled={negotiationStarted}
              onStepClick={navigateToModule}
            />
            <DecisionResult
              needs={needs}
              listing={listing}
              monthlyCost={monthlyCost}
              firstPayment={firstPayment}
              budgetConflict={budgetConflict}
              highCount={summary.highCount}
              hasMissingInfo={hasMissingInfo}
              commuteFit={commuteFit}
              mustHaveFit={mustHaveFit}
              listingDisplayName={listingDisplayName}
              findings={findings}
              trustSummary={trustSummary}
              contractProvided={contractTouched}
              acceptedIds={acceptedIds}
              negotiationStates={negotiationStates}
              onGoNegotiation={() => navigateToModule('negotiation')}
              onGoContract={() => navigateToModule('contract')}
            />
          </>
        ) : (
          <ProposalHome
            onEnterModule={enterModuleFromCard}
            onOpenGuide={openRiskGuide}
            onOpenAiExpert={openAiExpert}
            onPrepareReviewDemo={prepareReviewDemo}
          />
        )}
      </section>
    </main>
  )
}

export default App
