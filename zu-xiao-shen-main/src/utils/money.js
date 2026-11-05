export function parseMoney(value) {
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  const amount = Number(match?.[0] || 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

export function formatMoney(value) {
  return `${Math.max(0, Math.round(value)).toLocaleString('zh-CN')} 元`
}

// 月度住房支出 = 月租 + 月固定费用（水电等估算单独展示，避免与固定费用混同）
// 返回 null 表示该分项未知，调用方据此显示"至少 XX 元"
export function calcMonthlyCost({ monthlyRent, monthlyFixedFees, utilitiesEstimate }) {
  const rent = toNullableAmount(monthlyRent)
  const fixed = toNullableAmount(monthlyFixedFees)
  const utilities = toNullableAmount(utilitiesEstimate)

  const parts = [
    { label: '月租', value: rent },
    { label: '月固定费用', value: fixed },
    { label: '水电估算', value: utilities },
  ]

  const knownTotal = parts.reduce((sum, part) => sum + (part.value ?? 0), 0)
  const hasUnknown = parts.some((part) => part.value == null)
  const knownMinimum = parts.reduce((sum, part) => sum + (part.value ?? 0), 0)

  return {
    parts,
    knownTotal,
    hasUnknown,
    // 未知项不计入"已知金额"，但至少告知已明确的部分
    minimum: knownMinimum,
  }
}

// 首次付款 = 月租 × 预付月数 + 押金 + 中介费
export function calcFirstPayment({ monthlyRent, prepaidMonths, depositAmount, agencyFee }) {
  const rent = toNullableAmount(monthlyRent)
  const months = toNullableCount(prepaidMonths)
  const deposit = toNullableAmount(depositAmount)
  const agency = toNullableAmount(agencyFee)

  const rentPrepaid = rent != null && months != null ? rent * months : null

  const parts = [
    { label: '预付租金', value: rentPrepaid, note: rent != null && months != null ? `${months} 个月 × ${formatMoney(rent)}` : null },
    { label: '押金', value: deposit },
    { label: '中介费', value: agency },
  ]

  const knownTotal = parts.reduce((sum, part) => sum + (part.value ?? 0), 0)
  const hasUnknown = parts.some((part) => part.value == null)
  const minimum = knownTotal

  return { parts, knownTotal, hasUnknown, minimum }
}

// 预算冲突判断：月度支出 vs 月度预算
export function checkBudgetConflict({ monthlyCostKnownTotal, monthlyBudget, hasUnknownCost }) {
  const budget = toNullableAmount(monthlyBudget)
  const cost = toNullableAmount(monthlyCostKnownTotal)

  if (budget == null || budget <= 0) {
    return { overBudget: false, gap: null, message: '尚未填写月度预算，暂无法判断是否超支。', status: 'unknown' }
  }

  if (cost == null) {
    return { overBudget: false, gap: null, message: '月租或固定费用缺失，暂无法判断是否超预算。', status: 'unknown' }
  }

  const gap = cost - budget

  if (gap > 0) {
    return {
      overBudget: true,
      gap,
      message: `月度支出约 ${formatMoney(cost)}，超出预算 ${formatMoney(gap)}，建议暂缓签约或与房东协商降低费用。`,
      status: 'over',
    }
  }

  if (hasUnknownCost) {
    return {
      overBudget: false,
      gap: Math.abs(gap),
      message: `当前已知月度支出约 ${formatMoney(cost)}，在预算内，但仍有费用未知，需确认后重新判断。`,
      status: 'watch',
    }
  }

  return {
    overBudget: false,
    gap: Math.abs(gap),
    message: `月度支出约 ${formatMoney(cost)}，在预算 ${formatMoney(budget)} 以内。`,
    status: 'ok',
  }
}

function toNullableAmount(value) {
  if (value == null || value === '') return null
  const num = parseMoney(value)
  return num > 0 ? num : null
}

function toNullableCount(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

export function calculateDepositReturn(inputs) {
  const depositAmount = parseMoney(inputs.depositAmount)
  const unpaidFees = parseMoney(inputs.unpaidFees)
  const repairCost = parseMoney(inputs.repairCost)
  const cleaningCost = parseMoney(inputs.cleaningCost)
  const hasVoucher = inputs.hasVoucher === 'yes'
  const normalWear = inputs.normalWear === 'yes'
  const documentedDamageDeduction = hasVoucher && !normalWear ? repairCost + cleaningCost : 0
  const totalDeduction = Math.min(depositAmount, unpaidFees + documentedDamageDeduction)
  const estimatedReturn = Math.max(0, depositAmount - totalDeduction)
  const warning = !hasVoucher && (repairCost > 0 || cleaningCost > 0)
    ? '房东未提供票据时，维修和保洁扣款建议要求照片、清单和发票。'
    : normalWear
      ? '正常使用损耗通常不应从押金中随意扣除。'
      : '存在非正常损坏且有凭证时，可按实际损失协商扣除。'

  return {
    estimatedReturn,
    totalDeduction,
    warning,
  }
}
