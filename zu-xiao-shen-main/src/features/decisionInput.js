// 签约决策输入：租房需求 + 房源信息 + 沟通记录
// 对应 PRD「七 输入字段」：个人预算 / 通勤要求 / 时间要求 / 租房底线 / 房源基础信息 / 租金支付 / 月度费用 / 签约费用 / 房源条件 / 房源描述 / 合同正文 / 沟通记录

export const MUST_HAVES_LIMIT = 5
export const LISTING_TEXT_LIMIT = 3000
export const COMMUNICATION_TEXT_LIMIT = 3000

// 租房需求（用户自己可接受的条件）
export function createDefaultNeeds() {
  return {
    monthlyBudget: '',      // 月度住房预算（含租金+固定费用，必填且大于零）
    maxCommuteMinutes: '',  // 最大单程通勤时间（分钟，选填）
    moveInDate: '',         // 计划入住日（YYYY-MM-DD，必填）
    leaseTermMonths: '12',  // 租住时长（月，正整数，必填）
    mustHaves: [],          // 不可妥协条件，最多 5 项
  }
}

// 房源信息（从房东/中介处获知）
export function createDefaultListing() {
  return {
    listingName: '',        // 房源简称（可自动生成）
    city: '',               // 城市/区域
    monthlyRent: '',        // 月租（必填）
    depositAmount: '',      // 押金（允许未知）
    prepaidMonths: '1',     // 预付月数
    agencyFee: '',          // 中介费（可为零/未知）
    monthlyFixedFees: '',   // 月固定费用（水电/物业等，可为零/未知）
    utilitiesEstimate: '',  // 水电估算（可为零/未知）
    commuteMinutes: '',     // 通勤时间（分钟，允许未知）
    availableDate: '',      // 可入住日期（允许未知）
    listingText: '',        // 房源描述（选填，最多 3000 字）
  }
}

// 沟通记录
export function createDefaultCommunication() {
  return {
    communicationText: '',  // 选填，最多 3000 字；区分"口头承诺"与"合同约定"
  }
}

// 信息可信度三级（PRD 核心原则：合同白纸黑字 > 房东口头承诺 > 用户猜测）
export const TRUST_LEVELS = {
  contract: { key: 'contract', label: '合同约定', short: '合同', tone: 'high' },
  verbal: { key: 'verbal', label: '房东口头承诺', short: '口头', tone: 'mid' },
  guess: { key: 'guess', label: '用户猜测', short: '猜测', tone: 'low' },
}

export const TRUST_ORDER = ['contract', 'verbal', 'guess']

// 房源信息来源标注：每个字段记录其来源（contract/verbal/guess）
export function createDefaultSources() {
  return {
    monthlyRent: 'contract',      // 月租通常写在合同里
    depositAmount: 'contract',    // 押金通常写在合同里
    prepaidMonths: 'contract',    // 预付月数
    agencyFee: 'verbal',          // 中介费常为口头约定
    monthlyFixedFees: 'verbal',   // 固定费用口头
    utilitiesEstimate: 'guess',   // 水电估算多为猜测
    commuteMinutes: 'guess',      // 通勤时间用户自己估
    availableDate: 'verbal',      // 可入住日期口头
  }
}

// 校验租房需求，返回 { valid, errors }
export function validateNeeds(needs) {
  const errors = {}

  const budget = Number(needs.monthlyBudget)
  if (!needs.monthlyBudget || !Number.isFinite(budget) || budget <= 0) {
    errors.monthlyBudget = '请填写大于 0 的月度预算。'
  }

  if (needs.maxCommuteMinutes) {
    const minutes = Number(needs.maxCommuteMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      errors.maxCommuteMinutes = '通勤时间需为大于 0 的分钟数。'
    }
  }

  if (!needs.moveInDate) {
    errors.moveInDate = '请选择计划入住日期。'
  }

  const months = Number(needs.leaseTermMonths)
  if (!needs.leaseTermMonths || !Number.isFinite(months) || months <= 0) {
    errors.leaseTermMonths = '请填写大于 0 的租住时长。'
  }

  if (needs.mustHaves.length > MUST_HAVES_LIMIT) {
    errors.mustHaves = `不可妥协条件最多 ${MUST_HAVES_LIMIT} 项。`
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// 校验房源信息，返回 { valid, errors }（月租必填，其余允许未知）
export function validateListing(listing) {
  const errors = {}

  const rent = Number(listing.monthlyRent)
  if (!listing.monthlyRent || !Number.isFinite(rent) || rent <= 0) {
    errors.monthlyRent = '请填写大于 0 的月租。'
  }

  if (listing.listingText && listing.listingText.length > LISTING_TEXT_LIMIT) {
    errors.listingText = `房源描述最多 ${LISTING_TEXT_LIMIT} 字。`
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// 校验沟通记录
export function validateCommunication(communication) {
  const errors = {}
  if (communication.communicationText && communication.communicationText.length > COMMUNICATION_TEXT_LIMIT) {
    errors.communicationText = `沟通记录最多 ${COMMUNICATION_TEXT_LIMIT} 字。`
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

// 演示场景：一键填充预算 + 房源 + 来源（配合演示合同，覆盖「超预算暂缓」结局）
// 预算 2500 < 月租 3200 → 触发「建议暂缓签约」；再把预算改大即可演示另外两种结局
export function createDemoScenario() {
  return {
    needs: {
      monthlyBudget: '2500',
      maxCommuteMinutes: '40',
      moveInDate: '2026-10-01',
      leaseTermMonths: '12',
      mustHaves: ['独立卫生间', '近地铁'],
    },
    listing: {
      listingName: '',
      city: '深圳南山',
      monthlyRent: '3200',
      depositAmount: '3200',
      prepaidMonths: '1',
      agencyFee: '',
      monthlyFixedFees: '300',
      utilitiesEstimate: '200',
      commuteMinutes: '50',
      availableDate: '2026-09-28',
      listingText: '一室一厅，朝南，家具齐全，房东直租，近地铁站步行 10 分钟。',
    },
    sources: {
      monthlyRent: 'contract',
      depositAmount: 'contract',
      prepaidMonths: 'contract',
      agencyFee: 'verbal',
      monthlyFixedFees: 'verbal',
      utilitiesEstimate: 'guess',
      commuteMinutes: 'guess',
      availableDate: 'verbal',
    },
  }
}

// 生成房源简称（为空时自动生成）
export function generateListingName(listing) {
  if (listing.listingName && listing.listingName.trim()) return listing.listingName.trim()
  const rent = Number(listing.monthlyRent)
  if (Number.isFinite(rent) && rent > 0) {
    const city = listing.city ? `${listing.city} · ` : ''
    return `${city}${Math.round(rent)} 元/月房源`
  }
  return '待评估房源'
}
