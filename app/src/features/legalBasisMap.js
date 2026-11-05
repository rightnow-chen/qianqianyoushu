// 风险点 → 专属法律依据映射表
// 用于替换 contractReview.js 里大量重复的兜底 legalBasis 文案。
// 说明：
//   - 优先映射到有具体条文的法条；无法给出具体条文的，落到「原则性依据」或留空（前端会隐藏依据区）。
//   - 法条原文链接不再逐条手配（此前 46 条手配链接里有 gov.cn 旧路径 404、司法部重定向死循环），
//     统一由 resolveLegalUrl 从 LAW_FULL_TEXT_URLS 派生，并附加条文定位片段（Chrome 文本片段，
//     打开全文页直接高亮目标条文；Firefox/Safari 不支持片段时优雅退化为打开全文页顶部）。
// 结构：{ findingId: { text: 依据描述, law: 法条简称 } }

// 权威法条全文页（均为官方/权威站点，2026-10 逐个 curl/WebFetch 验证可达）：
//   - 民法典：共产党员网（中央组织部）单页全文，条文各出现一次，适合文本片段定位
//   - 住房租赁条例：中国政府网国务院公报 2025
//   - 商品房屋租赁管理办法 / 房地产经纪管理办法：中国政府网政策库 2022 年重新发布页
//   - 民事诉讼法（2023 修正）：最高人民法院国际商事法庭，来源标注国家法律法规数据库
//     （该站对部分海外出口返回 302，大陆浏览器直连正常）
export const LAW_FULL_TEXT_URLS = {
  民法典: 'https://www.12371.cn/2020/06/01/ARTI1591021670041266.shtml',
  住房租赁条例: 'https://www.gov.cn/gongbao/2025/issue_12186/202507/content_7034094.html',
  商品房屋租赁管理办法: 'https://www.gov.cn/zhengce/2022-01/25/content_5711968.htm',
  房地产经纪管理办法: 'https://www.gov.cn/zhengce/2022-01/25/content_5711966.htm',
  民事诉讼法: 'https://cicc.court.gov.cn/html/1/218/62/83/443.html',
}

// 已知法名按长度降序匹配，避免「商品房屋租赁管理办法」被短名截胡
const KNOWN_LAW_NAMES = Object.keys(LAW_FULL_TEXT_URLS).sort((a, b) => b.length - a.length)

/**
 * 从法条简称（如「民法典第七百一十二条、第七百一十三条」「民事诉讼法第三十五条（协议管辖）」）
 * 解析出权威原文链接：法律全文页 + 首个条号的文本定位片段。
 * 解析不出已知法律时返回 null（前端隐藏链接，宁缺毋滥）。
 */
export function resolveLegalUrl(law) {
  const label = String(law || '')
  const lawName = KNOWN_LAW_NAMES.find((name) => label.includes(name))
  if (!lawName) return null

  const base = LAW_FULL_TEXT_URLS[lawName]
  const article = label.match(/第[一二三四五六七八九十百零0-9]+条/)?.[0]
  if (!article) return base

  return `${base}#:~:text=${encodeURIComponent(article)}`
}

export const LEGAL_BASIS_MAP = {
  // —— 押金 ——
  'lease-arbitrary-deposit-deduction': {
    text: '押金扣减应有明确项目、实际损失和有效凭证，正常使用损耗不得扣款。',
    law: '住房租赁条例第十条',
  },
  'lease-deposit-return-delay': {
    text: '押金应在退租交接后合理期限内返还，无正当理由逾期不退可催告、投诉或主张占用利息。',
    law: '住房租赁条例第十条',
  },
  'lease-cleaning-repair-no-voucher': {
    text: '押金扣减需照片、维修清单、票据等凭证支撑，保洁需前后对比和明细。',
    law: '住房租赁条例第十条',
  },
  'lease-appliance-depreciation-deduction': {
    text: '正常使用造成的合理损耗不等同于租客损坏，家具家电自然折旧不应转嫁给租客。',
    law: '民法典第七百一十条',
  },
  'lease-excessive-deposit': {
    text: '押金金额应由双方约定，明显偏离市场惯例的高额押金应警惕资金占用风险。',
    law: '民法典第七百零三条（租赁合同）',
  },
  'lease-deposit-indefinite-hold': {
    text: '押金返还期限应明确约定，争议期间无期限暂扣缺乏依据。',
    law: '住房租赁条例第十条',
  },
  'lease-excessive-restoration': {
    text: '退租恢复应以入住状态为对照，正常损耗部分不应要求重新粉刷或深度保洁。',
    law: '民法典第七百一十条、第七百三十三条',
  },
  'lease-deposit-forfeiture-on-late-rent': {
    text: '逾期付租应给予合理催告期限，直接没收全部押金显失公平。',
    law: '民法典第七百二十二条',
  },
  'lease-deposit-forfeiture-on-no-notice': {
    text: '未提前通知续租不等于根本违约，全额没收押金缺乏依据。',
    law: '民法典第五百八十五条（违约金）',
  },
  'lease-overdue-termination-forfeiture': {
    text: '逾期付租应经合理催告后方可主张解除，不应数日即没收押金。',
    law: '民法典第七百二十二条',
  },

  // —— 维修 ——
  'lease-all-maintenance-tenant': {
    text: '出租人应履行租赁物维修义务，自然老化和结构问题不宜笼统转嫁承租人。',
    law: '民法典第七百一十二条',
  },
  'lease-maintenance-burden-of-proof': {
    text: '维修责任应结合原因判断，自然老化举证责任不宜倒置于承租人。',
    law: '民法典第七百一十二条',
  },
  'lease-device-warranty-shift': {
    text: '房屋附属设备的维修义务由出租人承担，另有约定除外，短期保修后全转嫁不合理。',
    law: '民法典第七百一十二条、第七百一十三条',
  },

  // —— 居住权 / 退租安全 ——
  'lease-landlord-entry-no-consent': {
    text: '承租人享有租赁物占有使用权，出租人进入房屋应尊重承租人居住安宁。',
    law: '民法典第七百零八条',
  },
  'lease-landlord-reserved-space': {
    text: '租赁物交付后应由承租人占有使用，出租人保留阳台等区域使用权与租赁目的相悖。',
    law: '民法典第七百零八条',
  },
  'lease-lockout-forfeiture': {
    text: '禁止换锁、断水断电、威胁收房等非法腾退行为。',
    law: '住房租赁条例第十二条',
  },
  'lease-self-help-utility-cutoff': {
    text: '禁止以断水断电、限制入户等方式催缴或腾退，应通过合法途径主张权利。',
    law: '住房租赁条例第十二条',
  },
  'lease-abandoned-property-disposal': {
    text: '对承租人物品应妥善处理，未经约定不得自行清理处置并免责。',
    law: '民法典第七百三十三条（返还租赁物）',
  },
  'lease-sale-terminates-tenancy': {
    text: '租赁期间房屋所有权变动不影响租赁合同效力，出售不应导致承租人无条件搬离。',
    law: '民法典第七百二十五条',
  },
  'lease-sublet-share-overbroad': {
    text: '转租需经出租人同意，但合住与转租应区别对待，避免把正常居住约定成违约。',
    law: '民法典第七百一十六条',
  },
  'lease-unsafe-housing-waiver': {
    text: '危及人身安全或健康的质量问题，承租人有权利主张处理或解除，不得预先免责。',
    law: '民法典第七百三十一条',
  },
  'lease-safety-liability-waiver': {
    text: '出租人应保证租赁物符合约定用途，人身财产安全责任不得预先全部免除。',
    law: '民法典第七百零八条',
  },
  'lease-normal-use-fixed-penalty': {
    text: '按约定方法正常使用租赁物造成的损耗不承担责任，不应设置固定扣款。',
    law: '民法典第七百一十条',
  },
  'lease-decoration-use-overrestriction': {
    text: '承租人正常使用租赁物不应被过度限制，合理装饰使用应区别对待。',
    law: '民法典第七百一十条',
  },
  'lease-visitor-occupancy-fee': {
    text: '限制访客留宿并收费应看合同是否明确约定，避免把正常访客约定为违约。',
    law: '民法典第七百一十六条（转租与居住人）',
  },

  // —— 违约责任 / 违约金 ——
  'lease-daily-late-fee-5-percent': {
    text: '约定的违约金过分高于造成的损失，可以请求适当减少。',
    law: '民法典第五百八十五条',
  },
  'lease-amount-late-fee-percent': {
    text: '违约金应以实际损失为基础，过高的可以请求调整。',
    law: '民法典第五百八十五条',
  },
  'lease-broad-default-six-months': {
    text: '违约金明显过高且违约情形约定过宽的，可以请求适当减少。',
    law: '民法典第五百八十五条',
  },
  'lease-excessive-holdover-rent': {
    text: '逾期占用费应合理，多倍租金计费缺乏损失依据。',
    law: '民法典第五百八十五条',
  },
  'lease-early-exit-stacked-penalty': {
    text: '同时没收押金并追加违约金属重复惩罚，缺乏依据。',
    law: '民法典第五百八十五条、第五百六十三条',
  },
  'lease-landlord-loss-exclusion': {
    text: '一方违约应承担相应违约责任，不得预先排除对方损失。',
    law: '民法典第五百七十七条',
  },
  'lease-pet-forfeiture-no-cure': {
    text: '轻微违约直接解除并没收押金显失公平，应给予补正或区分处理。',
    law: '民法典第五百六十三条',
  },
  'lease-pet-additional-penalty': {
    text: '违约金之外再设固定清除费，应看是否有实际损失依据。',
    law: '民法典第五百八十五条',
  },
  'lease-lien-on-tenant-property': {
    text: '留置权适用于特定合同，出租人不得以「留置」为名擅自处置承租人物品。',
    law: '民法典第四百四十七条（留置权）',
  },

  // —— 解除 ——
  'lease-termination-asymmetry': {
    text: '双方解除权应大致对等，明显不对称的解除条款可能构成不公平格式条款。',
    law: '民法典第四百九十六条（格式条款）',
  },
  'lease-overbroad-exemption': {
    text: '免责事由过宽、排除己方主要责任的格式条款可能无效。',
    law: '民法典第四百九十七条',
  },

  // —— 租金 ——
  'lease-annual-rent-prepayment': {
    text: '租金支付方式可协商，一次性预付全年存在较大资金占用风险。',
    law: '住房租赁条例第十条',
  },
  'lease-unilateral-rent-adjustment': {
    text: '租金调整应双方协商一致，单方调价并没收押金缺乏依据。',
    law: '民法典第五百四十三条（合同变更）',
  },
  'lease-auto-renewal-rent-up': {
    text: '自动续租并固定涨租应基于明确约定，未明确涨租依据的应警惕。',
    law: '住房租赁条例第十条',
  },
  'lease-rent-loan-forced': {
    text: '签约即绑定租金分期贷款应基于自愿，不得以格式条款强制。',
    law: '民法典第四百九十六条（格式条款）',
  },

  // —— 费用 ——
  'lease-utility-no-voucher': {
    text: '水电等费用应有明确计价方式和账单依据，不得拒绝提供凭证。',
    law: '住房租赁条例第十条',
  },
  'lease-common-area-fee-transfer': {
    text: '公共费用承担应在合同中明确，不得笼统全部转嫁承租人。',
    law: '住房租赁条例第十条',
  },
  'lease-rental-tax-transfer': {
    text: '税费和开票费用承担应明确约定，转嫁应有依据。',
    law: '民法典第五百四十三条（合同变更）',
  },
  'lease-sublet-extra-fee': {
    text: '转租手续费应看是否合理，明显偏高或缺乏依据的可协商。',
    law: '民法典第七百一十六条',
  },
  'lease-agency-fee-nonrefundable': {
    text: '中介费应在合同中明确约定，未成交不退还的约定应警惕。',
    law: '房地产经纪管理办法第二十五条',
  },

  // —— 格式条款 ——
  'lease-format-clause-waiver': {
    text: '提供格式条款一方排除对方主要权利、单方解释的条款可能无效。',
    law: '民法典第四百九十六条、第四百九十七条',
  },
  'lease-oral-overrides-written': {
    text: '合同变更应意思表示一致，口头约定效力高于书面的约定易生争议。',
    law: '民法典第五百四十三条（合同变更）',
  },
  'lease-handwritten-overrides-printed': {
    text: '手写与打印文本冲突时的效力应明确约定，避免歧义。',
    law: '民法典第五百四十三条（合同变更）',
  },

  // —— 管辖 / 权属 ——
  'lease-unfavorable-jurisdiction': {
    text: '合同纠纷管辖可约定，但应便于当事人诉讼，明显不利于一方的约定应警惕。',
    law: '民事诉讼法第三十五条（协议管辖）',
  },
  'lease-title-defect-no-liability': {
    text: '出租人应保证有权出租，权属问题导致的损失不得预先免责。',
    law: '民法典第七百零八条',
  },

  // —— 租期 ——
  'lease-date-range-invalid': {
    text: '租赁期限应明确起止，前后倒置属明显笔误或错误约定，应更正。',
    law: '民法典第七百零三条（租赁合同）',
  },
}
