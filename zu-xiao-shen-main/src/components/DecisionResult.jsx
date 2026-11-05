import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronDown, Clock3, Copy, Info, ShieldAlert } from 'lucide-react'
import { formatMoney } from '../utils/money.js'
import { buildConfirmationQuestions, formatQuestionsForCopy, resolveDecision } from '../features/decision.js'
import { getDecisionOutcomeLabel, getDecisionStageCopy, getTrustDisplayLabel } from '../features/decisionUi.js'
import { copyTextToClipboard } from '../utils/clipboard.js'

const DECISION_ICONS = {
  incomplete: Info,
  pause: ShieldAlert,
  confirm: AlertTriangle,
  'more-info': Clock3,
  go: CheckCircle2,
}

// 触发因素：说明当前判定是被哪个条件触发的
function resolveTriggers({ decision, budgetConflict, commuteFit, mustHaveFit, highCount, hasMissingInfo, needsFilled, listingFilled }) {
  if (!needsFilled || !listingFilled) return []
  const triggers = []
  if (decision.key === 'pause' && budgetConflict.status === 'over') {
    triggers.push({ key: 'budget', label: `预算超支 ${formatMoney(budgetConflict.gap)}` })
  }
  if (commuteFit.fail) {
    triggers.push({ key: 'commute', label: `通勤 ${commuteFit.detail}` })
  }
  if (mustHaveFit.fail) {
    triggers.push({ key: 'musthave', label: '底线不满足' })
  }
  if (highCount >= 1) {
    triggers.push({ key: 'risk', label: `${highCount} 处合同高风险` })
  }
  if (hasMissingInfo) {
    triggers.push({ key: 'missing', label: '关键信息待补' })
  }
  return triggers.slice(0, 3)
}

// 费用明细（可折叠；预算超支时默认展开）
function CostBreakdown({ monthlyCost, firstPayment, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details className="decision-ref" open={open} onToggle={(event) => setOpen(event.target.open)}>
      <summary>
        <span>费用测算</span>
        <em>
          每月 {monthlyCost.knownTotal > 0 ? formatMoney(monthlyCost.knownTotal) : '—'} · 第一个月{' '}
          {firstPayment.knownTotal > 0 ? formatMoney(firstPayment.knownTotal) : '—'}
        </em>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="decision-cost">
        <div className="decision-cost-col">
          <span className="decision-cost-label">每月大概要付</span>
          <strong>{monthlyCost.knownTotal > 0 ? formatMoney(monthlyCost.knownTotal) : '—'}</strong>
          <small>{monthlyCost.hasUnknown ? '有费用未知，此为已明确部分' : '月租 + 月固定费用 + 水电估算'}</small>
        </div>
        <div className="decision-cost-col">
          <span className="decision-cost-label">第一个月要准备</span>
          <strong>{firstPayment.knownTotal > 0 ? formatMoney(firstPayment.knownTotal) : '—'}</strong>
          <small>{firstPayment.hasUnknown ? '部分费用未知，实际会更高' : '预付租金 + 押金 + 中介费'}</small>
        </div>
      </div>
    </details>
  )
}

// 条件核对：一行紧凑，触发项标红
function FitChecks({ budgetConflict, commuteFit, mustHaveFit, triggers }) {
  const triggerKeys = new Set(triggers.map((t) => t.key))
  const items = [
    {
      key: 'budget',
      label: '预算',
      tone: budgetConflict.status === 'over' ? 'fail' : budgetConflict.status === 'watch' ? 'warn' : budgetConflict.status === 'unknown' ? 'na' : 'ok',
      detail:
        budgetConflict.status === 'unknown'
          ? '未填写预算'
          : budgetConflict.status === 'over'
            ? `超 ${formatMoney(budgetConflict.gap)}`
            : budgetConflict.status === 'watch'
              ? '在预算内，有费用未知'
              : '在预算内',
    },
    {
      key: 'commute',
      label: '通勤',
      tone: commuteFit.fail ? 'fail' : commuteFit.ok ? 'ok' : 'na',
      detail: commuteFit.detail,
    },
    {
      key: 'musthave',
      label: '底线',
      tone: mustHaveFit.fail ? 'fail' : mustHaveFit.ok ? 'ok' : 'na',
      detail: mustHaveFit.detail,
    },
  ]

  return (
    <div className="decision-fits-compact" role="list">
      {items.map((item) => (
        <span className={`decision-fit-pill ${item.tone}${triggerKeys.has(item.key) ? ' triggered' : ''}`} key={item.key} role="listitem">
          <strong>{item.label}</strong>
          <span>{item.detail}</span>
        </span>
      ))}
    </div>
  )
}

// 信息可信度（可折叠）
function TrustSummary({ trustSummary }) {
  const total = trustSummary.reduce((sum, group) => sum + group.count, 0)
  if (total === 0) return null

  return (
    <details className="decision-ref">
      <summary>
        <span>这些信息有多可靠？</span>
        <em>{trustSummary.map((group) => `${getTrustDisplayLabel(group.key)} ${group.count}`).join(' · ')}</em>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="trust-bars">
        {trustSummary.map((group) => (
          <div className={`trust-bar ${group.tone}`} key={group.key}>
            <div className="trust-bar-head">
              <span className="trust-bar-label">{getTrustDisplayLabel(group.key)}</span>
              <span className="trust-bar-count">{group.count} 项</span>
            </div>
            <div className="trust-bar-track">
              <div className="trust-bar-fill" style={{ width: total ? `${(group.count / total) * 100}%` : '0%' }} />
            </div>
            <div className="trust-bar-items">{group.items.length > 0 ? group.items.join('、') : '无'}</div>
          </div>
        ))}
      </div>
    </details>
  )
}

// 待确认问题清单：可复制发给房东
function ConfirmationQuestions({ questions, listingDisplayName }) {
  const [copied, setCopied] = useState(false)

  if (questions.length === 0) {
    return (
      <div className="decision-questions">
        <div className="panel-head compact">
          <div>
            <h2>签之前一定要问清楚</h2>
            <p>目前没有新增问题，可以继续核对合同和谈判结果。</p>
          </div>
        </div>
      </div>
    )
  }

  const handleCopy = async () => {
    const text = formatQuestionsForCopy(questions, { listingName: listingDisplayName })
    const ok = await copyTextToClipboard(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="decision-questions">
      <div className="panel-head">
        <div>
          <h2>签之前一定要问清楚</h2>
          <p>这些问题可以直接发给房东或中介，先把影响签约的关键事项问清楚。</p>
        </div>
        <button className="ghost-button compact-button" type="button" onClick={handleCopy}>
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied ? '已复制' : '复制全部问题'}
        </button>
      </div>

      <ol className="question-list">
        {questions.map((question, index) => (
          <li className={`question-item ${question.source}`} key={question.id}>
            <div className="question-ask">
              <span className="question-index">{index + 1}</span>
              <p>{question.ask}</p>
            </div>
            <p className="question-why">{question.why}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function NegotiationProgress({ findings, negotiationStates, acceptedIds, onGoNegotiation, onGoContract }) {
  if (!findings.length) return null

  const resolvedCount = findings.filter((finding) => negotiationStates?.[finding.id]?.status === 'resolved').length
  const acceptedCount = findings.filter((finding) => acceptedIds?.has(finding.id)).length
  const pendingDraftCount = Math.max(resolvedCount - acceptedCount, 0)
  const highPendingCount = findings.filter((finding) => finding.level === 'high' && negotiationStates?.[finding.id]?.status !== 'resolved').length

  let note
  if (highPendingCount > 0) {
    note = `还有 ${highPendingCount} 个高风险没谈，建议优先处理。`
  } else if (pendingDraftCount > 0) {
    note = `还有 ${pendingDraftCount} 条谈妥结果没写进修订合同。`
  } else if (resolvedCount > 0) {
    note = '关键问题已谈妥，记得写进合同——口头承诺不能替代合同文字。'
  } else {
    note = '合同已看过，还没开始谈。谈妥的结果会同步到这里。'
  }

  return (
    <section className="decision-negotiation-progress" aria-label="谈判进展">
      <div className="decision-section-head">
        <div>
          <h2>谈判进展</h2>
          <p>{note}</p>
        </div>
        {pendingDraftCount > 0 ? (
          <button className="ghost-button compact-button" type="button" onClick={onGoContract}>
            查看修订合同
          </button>
        ) : (
          <button className="ghost-button compact-button" type="button" onClick={onGoNegotiation}>
            去谈判台
          </button>
        )}
      </div>
    </section>
  )
}

export default function DecisionResult({
  needs,
  listing,
  monthlyCost,
  firstPayment,
  budgetConflict,
  highCount,
  hasMissingInfo,
  commuteFit,
  mustHaveFit,
  listingDisplayName,
  findings,
  trustSummary,
  contractProvided = false,
  negotiationStates = {},
  acceptedIds = new Set(),
  onGoNegotiation,
  onGoContract,
}) {
  const needsFilled = Boolean(needs.monthlyBudget) && Boolean(needs.moveInDate)
  const listingFilled = Boolean(listing.monthlyRent)
  const decision = resolveDecision({ budgetConflict, highCount, hasMissingInfo, needsFilled, listingFilled })
  const DecisionIcon = DECISION_ICONS[decision.key] || Info
  const questions = useMemo(() => buildConfirmationQuestions({ findings, listing }), [findings, listing])
  const fullyFilled = needsFilled && listingFilled
  const contractReviewed = contractProvided && findings.length > 0
  const stageCopy = getDecisionStageCopy({ fullyFilled, contractReviewed })
  const triggers = resolveTriggers({ decision, budgetConflict, commuteFit, mustHaveFit, highCount, hasMissingInfo, needsFilled, listingFilled })

  if (!fullyFilled) {
    const missing = []
    if (!needs.monthlyBudget) missing.push('月度预算')
    if (!needs.moveInDate) missing.push('计划入住日期')
    if (!listing.monthlyRent) missing.push('房源月租')
    return (
      <section className="work-panel decision-result decision-result-pending" aria-label="签约判断">
        <div className="panel-head compact">
          <div>
            <h2>这套房，现在适合签吗？</h2>
            <p>{stageCopy.note}</p>
          </div>
        </div>
        <div className="pending-hint">
          <Info size={18} aria-hidden="true" />
          <span>
            还差：{missing.length ? missing.join('、') : '关键信息'}
            {missing.length ? '。' : '已满足基本条件。'}
          </span>
        </div>
      </section>
    )
  }

  return (
    <section className="work-panel decision-result" aria-label="签约判断">
      <div className="panel-head">
        <div>
          <h2>这套房，现在适合签吗？</h2>
          <p>{stageCopy.note}</p>
          <span className="decision-stage-badge">{stageCopy.label}</span>
        </div>
      </div>

      <div className={`decision-verdict ${decision.tone}`}>
        <DecisionIcon size={28} aria-hidden="true" />
        <div>
          <h3>{getDecisionOutcomeLabel(decision.key)}</h3>
          <p>{decision.subtitle}</p>
        </div>
      </div>

      <FitChecks budgetConflict={budgetConflict} commuteFit={commuteFit} mustHaveFit={mustHaveFit} triggers={triggers} />

      {budgetConflict.status === 'over' && (
        <CostBreakdown monthlyCost={monthlyCost} firstPayment={firstPayment} defaultOpen />
      )}

      {(!contractReviewed || highCount > 0) && (
        <div className="decision-next-action">
          <div>
            <strong>{contractReviewed ? '下一步先处理合同风险' : '下一步先补上合同信息'}</strong>
            <span>{contractReviewed ? '高风险条款需要先和房东谈清楚，再回来看最终判断。' : '没有合同风险，签约判断只能算初步判断。'}</span>
          </div>
          <button className="primary-button compact-button" type="button" onClick={contractReviewed ? onGoNegotiation : onGoContract}>
            {contractReviewed ? '去谈判台' : '去审合同'}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      <NegotiationProgress
        acceptedIds={acceptedIds}
        findings={findings}
        negotiationStates={negotiationStates}
        onGoContract={onGoContract}
        onGoNegotiation={onGoNegotiation}
      />

      <ConfirmationQuestions questions={questions} listingDisplayName={listingDisplayName} />

      <div className="decision-refs">
        {budgetConflict.status !== 'over' && (
          <CostBreakdown monthlyCost={monthlyCost} firstPayment={firstPayment} />
        )}
        <TrustSummary trustSummary={trustSummary} />
      </div>
    </section>
  )
}
