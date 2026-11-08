// 金额引擎：所有金额都由「月租 / 押金 / 租期」算出来，界面里不允许出现硬编码数字。
// PRD 9.5 把这条列为 V0.1 开发第一优先，因为它决定首页「会坑你多少钱」站不站得住。

// 估值口径（原型假设值，不是法定或统计值，界面必须标「估算」）
export const AMOUNT_CONFIG = {
  depositDeductRate: 0.4, // 押金扣款上限：押金 × 40%
  terminationMonths: 2, // 退租违约金：月租 × 2
  repairEstimate: 3000, // 大件维修单次估值
  utilityDeltaPerMonth: 180, // 商用与民用水电月差价
  rentHikeRate: 0.08, // 年涨租上限 8%
}

export const AMOUNT_SPECS = {
  depositDeduct: { kind: 'loss', unit: 'total', label: '押金扣款', includeInWorst: true },
  termination: { kind: 'loss', unit: 'total', label: '退租违约金', includeInWorst: true },
  repair: { kind: 'loss', unit: 'total', label: '维修费用', includeInWorst: true },
  utility: { kind: 'gain', unit: 'monthly', label: '水电差价', includeInWorst: false },
  rentHike: { kind: 'gain', unit: 'yearly', label: '涨租上限', includeInWorst: false },
}

export function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Math.round(value).toLocaleString('en-US')
}

/**
 * @param {{rent:number, deposit:number, months:number}} meta
 */
export function computeAmounts(meta = {}) {
  const rent = Number(meta.rent) || 0
  const deposit = Number(meta.deposit) || 0
  const months = Number(meta.months) || 0
  const cfg = AMOUNT_CONFIG

  const values = {
    depositDeduct: deposit * cfg.depositDeductRate,
    termination: rent * cfg.terminationMonths,
    repair: cfg.repairEstimate,
    utility: cfg.utilityDeltaPerMonth,
    rentHike: rent * cfg.rentHikeRate * 12,
  }

  return {
    ...values,
    utilityAnnual: values.utility * 12,
    annualRent: rent * months,
    rent,
    deposit,
    months,
  }
}

/** 一条风险的金额展示：{ text, kind, value, includeInWorst, missing } */
export function amountForRisk(risk, amounts) {
  const key = risk?.amountKey
  const spec = key ? AMOUNT_SPECS[key] : null
  if (!key || !spec) {
    return { text: '—', kind: 'none', value: 0, includeInWorst: false, missing: false }
  }
  const value = amounts[key] || 0
  const unitText = spec.unit === 'monthly' ? '/月' : spec.unit === 'yearly' ? '/年' : ''
  const sign = spec.kind === 'loss' ? '−' : '+'
  // 合同里没读到月租/押金时算出来就是 0。这时候写「−¥0」等于说「不会亏」，
  // 恰恰相反——是还不知道会亏多少。必须说「金额待补」。
  const missing = value <= 0
  return {
    text: missing ? '金额待补' : `${sign}¥${formatMoney(value)}${unitText}`,
    kind: spec.kind,
    value,
    includeInWorst: spec.includeInWorst,
    missing,
  }
}

/**
 * 最坏情况合计：只累加「必须改」且能定价的项（PRD FR-05）。
 * 同一个金额口径只算一次——三条风险都挂「违约金」时，赔的是同一笔钱，不能叠加三次。
 */
export function computeWorstCase(risks = [], amounts) {
  const seen = new Set()
  const items = []

  risks
    .filter((risk) => risk.level === 'must')
    .forEach((risk) => {
      const key = risk.amountKey
      const spec = key ? AMOUNT_SPECS[key] : null
      if (!key || !spec || !spec.includeInWorst || seen.has(key)) return
      const amount = amountForRisk(risk, amounts)
      if (amount.value <= 0) return
      seen.add(key)
      items.push({
        riskId: risk.id,
        label: spec.label,
        value: amount.value,
        text: amount.text,
        note: risk.location?.article ? `第 ${risk.location.article} 条` : '条款位置待核对',
      })
    })

  const total = items.reduce((sum, item) => sum + item.value, 0)
  // 有几条「必须改」算不出钱：合同没读到月租/押金，或者条款本身没有可定价的机制。
  // 界面要能用它区分「真的不用担心」和「还不知道多少」。
  const mustCount = risks.filter((risk) => risk.level === 'must').length
  const unpriced = Math.max(0, mustCount - items.length)

  return { total, items, unpriced }
}

/** 审查结论三档措辞（PRD FR-05 ①） */
export function computeVerdict(risks = [], amounts, options = {}) {
  const must = risks.filter((risk) => risk.level === 'must')
  const check = risks.filter((risk) => risk.level === 'check')
  const outside = options.checklistCount ?? 8
  const { total } = computeWorstCase(risks, amounts)

  if (must.length === 0) {
    return {
      key: 'go',
      title: '可以继续沟通',
      desc: check.length
        ? `没有必须修改的条款，但有 ${check.length} 条建议当面确认。另有 ${outside} 件合同外的事要问清，问完再签更稳。`
        : `这份合同没有发现必须修改的高风险条款。别忘了把合同外那 ${outside} 件事问清楚——合同没问题不等于事情办完了。`,
    }
  }

  if (must.length >= 4) {
    const money = total > 0 ? `最坏可能损失 ¥${formatMoney(total)}。` : '合同里没读到月租或押金，损失还没法估，先补上这两个数。'
    return {
      key: 'stop',
      title: '暂不建议签约',
      desc: `${risks.length} 条风险中 ${must.length} 条必须在签约前改掉，${money}建议先按清单逐条提出修改，对方一条都不肯改时再考虑放弃。`,
    }
  }

  const top = must[0]
  const topAmount = amountForRisk(top, amounts)
  const topSentence = topAmount.missing
    ? `其中${top.cat}条款的问题最需要在签约前落实，具体会损失多少取决于月租和押金——这两个数补上就能算。`
    : `其中${top.cat}条款可能让你多损失 ${topAmount.text.replace(/[−+]/, '')}。`
  return {
    key: 'hold',
    title: '关键问题确认后再决定',
    desc: `${risks.length} 条风险中 ${must.length} 条必须在签约前改掉，${topSentence}另有 ${outside} 件合同外的事要当面问清。改完这 ${must.length} 条，这份合同可以签。`,
  }
}
