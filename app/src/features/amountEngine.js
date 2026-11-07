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

/** 一条风险的金额展示：{ text, kind, value, includeInWorst } */
export function amountForRisk(risk, amounts) {
  const key = risk?.amountKey
  const spec = key ? AMOUNT_SPECS[key] : null
  if (!key || !spec) {
    return { text: '—', kind: 'none', value: 0, includeInWorst: false }
  }
  const value = amounts[key] || 0
  const unitText = spec.unit === 'monthly' ? '/月' : spec.unit === 'yearly' ? '/年' : ''
  const sign = spec.kind === 'loss' ? '−' : '+'
  return {
    text: `${sign}¥${formatMoney(value)}${unitText}`,
    kind: spec.kind,
    value,
    includeInWorst: spec.includeInWorst,
  }
}

/**
 * 最坏情况合计：只累加「必须改」且能定价的项（PRD FR-05）。
 * 返回合计值与三个分项，分项用于概览右下角的出处说明。
 */
export function computeWorstCase(risks = [], amounts) {
  const items = risks
    .filter((risk) => risk.level === 'must')
    .map((risk) => {
      const amount = amountForRisk(risk, amounts)
      return { risk, amount, spec: risk.amountKey ? AMOUNT_SPECS[risk.amountKey] : null }
    })
    .filter((item) => item.spec?.includeInWorst && item.amount.value > 0)

  const total = items.reduce((sum, item) => sum + item.amount.value, 0)

  return {
    total,
    items: items.map((item) => ({
      riskId: item.risk.id,
      label: item.spec.label,
      value: item.amount.value,
      text: item.amount.text,
      note: `第 ${item.risk.location.article} 条`,
    })),
  }
}

/** 审查结论三档措辞（PRD FR-05 ①） */
export function computeVerdict(risks = [], amounts) {
  const must = risks.filter((risk) => risk.level === 'must')
  const check = risks.filter((risk) => risk.level === 'check')
  const { total } = computeWorstCase(risks, amounts)

  if (must.length === 0) {
    return {
      key: 'go',
      title: '可以继续沟通',
      desc: check.length
        ? `没有必须修改的条款，但有 ${check.length} 条建议当面确认。另有 8 件合同外的事要问清，问完再签更稳。`
        : '这份合同没有发现必须修改的高风险条款。别忘了把合同外那 8 件事问清楚——合同没问题不等于事情办完了。',
    }
  }

  if (must.length >= 4) {
    return {
      key: 'stop',
      title: '暂不建议签约',
      desc: `${risks.length} 条风险中 ${must.length} 条必须在签约前改掉，最坏可能损失 ¥${formatMoney(total)}。建议先按清单逐条提出修改，对方一条都不肯改时再考虑放弃。`,
    }
  }

  const top = must[0]
  const topAmount = amountForRisk(top, amounts)
  return {
    key: 'hold',
    title: '关键问题确认后再决定',
    desc: `${risks.length} 条风险中 ${must.length} 条必须在签约前改掉，其中${top.cat}条款可能让你多损失 ${topAmount.text.replace(/[−+]/, '')}；另有 8 件合同外的事要当面问清。改完这 ${must.length} 条，这份合同可以签。`,
  }
}
