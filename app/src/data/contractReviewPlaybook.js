// 租房合同审查标准卡。
// 这里记录的是“如何审查”和“如何克制判断”，不是法律意见书。
// 每张卡都必须能回到官方来源，并明确适用范围与反例。

const officialSources = {
  housingRentalRegulation: {
    title: '《住房租赁条例》国务院令第812号',
    url: 'https://xzfg.moj.gov.cn/mobile/law/detail?LawID=1774',
    scope: '自2025年9月15日起施行；城镇国有土地上住房租赁活动及其监督管理。',
  },
  civilCodeLease: {
    title: '《中华人民共和国民法典》租赁合同编',
    url: 'https://www.court.gov.cn/zixun/xiangqing/233181.html',
    scope: '民事租赁合同的一般规则；具体结论仍需结合合同约定、事实和适用地区核对。',
  },
}

export const contractReviewPlaybook = {
  'deposit-settlement': {
    id: 'deposit-settlement',
    title: '押金数额、返还与扣减',
    dimension: '押金',
    severity: 'high',
    resultTypes: ['explicit_disadvantage', 'missing_term', 'needs_review'],
    trigger: '合同约定收取押金，但未明确返还时间、扣减情形，或允许无正当理由扩大扣款范围。',
    counterSignals: [
      '合同已经明确押金数额、返还时间和扣减情形。',
      '扣款限定为合同约定情形，并要求提供实际损失或交接凭证。',
      '条款只提示需要进一步补充材料，没有出现明确不利后果。',
    ],
    requiredEvidence: ['押金数额', '返还时间', '扣减情形', '扣款条件或凭证要求'],
    examples: ['退租后押金返还时间未约定', '甲方可按“其他合理费用”直接扣除押金'],
    nonExamples: ['合同明确约定交接后7日内返还，扣款须有照片、清单和票据'],
    action: '要求补充返还时间、扣减条件、凭证要求和争议金额处理方式。',
    legalSources: [{ ...officialSources.housingRentalRegulation, article: '第十条' }],
  },
  'renewal-rent-change': {
    id: 'renewal-rent-change',
    title: '自动续租与租金变化',
    dimension: '租期/租金',
    severity: 'high',
    resultTypes: ['explicit_disadvantage', 'missing_term', 'needs_review'],
    trigger: '自动续租、续租报价、调租条件或不接受涨租的后果被单方决定，且影响是否继续居住或押金返还。',
    counterSignals: [
      '条款明确续租须双方另行协商或确认。',
      '合同到期终止，涨租只是协商选项，没有将沉默视为同意。',
      '仅缺少更有利的续租安排，不等于现有租期内存在违法风险。',
    ],
    requiredEvidence: ['续租触发条件', '租金调整机制', '通知期限', '不接受调整的后果'],
    examples: ['未回复即视为接受续租涨租', '不接受单方报价即没收押金'],
    nonExamples: ['合同到期后双方另行协商租金，未达成一致则合同终止'],
    action: '区分“到期重新协商”和“合同期内单方变更”，优先要求明确通知、确认和退出机制。',
    legalSources: [{ ...officialSources.civilCodeLease, article: '第七百零五条、第七百零四条' }],
  },
  'repair-duty': {
    id: 'repair-duty',
    title: '维修责任与自然损耗',
    dimension: '维修',
    severity: 'high',
    resultTypes: ['explicit_disadvantage', 'missing_term', 'needs_review'],
    trigger: '合同把房屋主体、自然老化或非租客过错造成的维修责任笼统转给租客，或阻断合理维修请求。',
    counterSignals: [
      '条款区分租客过错、日常易耗品和房屋主体维修。',
      '合同保留出租人维修义务，并允许租客在合理期限未维修时依法处理。',
      '承租人按约定或房屋性质正常使用造成的损耗，不应直接判为赔偿责任。',
    ],
    requiredEvidence: ['故障或损坏原因', '维修责任主体', '通知和维修期限', '费用承担方式'],
    examples: ['任何故障都由乙方维修并承担费用', '自然老化也由租客承担全部维修费'],
    nonExamples: ['租客因自行拆改造成损坏，由租客承担恢复费用'],
    action: '要求按责任原因拆分维修范围，并补充报修、响应、垫付和凭证规则。',
    legalSources: [{ ...officialSources.civilCodeLease, article: '第七百一十条、第七百一十二条、第七百一十三条' }],
  },
  'entry-and-consent': {
    id: 'entry-and-consent',
    title: '入户、通知与默认同意',
    dimension: '居住权',
    severity: 'high',
    resultTypes: ['explicit_disadvantage', 'missing_term', 'needs_review'],
    trigger: '出租人或中介可进入房屋，且未区分紧急情形、事先通知、租客同意和拒绝后的后果。',
    counterSignals: [
      '条款明确非紧急入户须事先通知并取得租客同意。',
      '紧急入户有明确的紧急情形和事后告知要求。',
      '出租人依法确需进入且合同只要求租客合理配合，不应直接判定为风险。',
    ],
    requiredEvidence: ['入户主体', '入户事由', '通知方式和期限', '未回复或拒绝的后果'],
    examples: ['未回复即视为同意任何时间入户', '中介可随时带人看房且无需通知'],
    nonExamples: ['因紧急抢修进入，事后及时通知；非紧急入户需双方确认时间'],
    action: '区分紧急与非紧急情形，要求明确通知、同意、替代时间和事后留痕。',
    legalSources: [{ ...officialSources.housingRentalRegulation, article: '第九条第三项、第十一条第五项' }],
  },
  'early-termination-loss': {
    id: 'early-termination-loss',
    title: '提前解约、违约金与损失',
    dimension: '解除/违约责任',
    severity: 'high',
    resultTypes: ['explicit_disadvantage', 'missing_term', 'needs_review'],
    trigger: '提前解约责任叠加没收押金、固定违约金和未证明损失，或双方解除权与通知义务明显不对称。',
    counterSignals: [
      '合同明确违约责任、损失范围和减损义务，没有重复计算同一损失。',
      '违约金只是协商风险提示，不能仅凭金额大小断言当然无效。',
      '双方均有相近的提前解除和通知机制。',
    ],
    requiredEvidence: ['解除触发条件', '通知期限', '违约金计算', '押金处理', '额外损失证明'],
    examples: ['押金不退并额外支付数月租金，且甲方可继续主张全部空置损失'],
    nonExamples: ['约定固定补偿并明确不再重复主张同一期间的空置损失'],
    action: '拆分押金、违约金和实际损失，要求明确计算口径、举证责任和减损边界。',
    legalSources: [{ ...officialSources.civilCodeLease, article: '第五百八十五条、第五百六十三条' }],
  },
  'utilities-and-fees': {
    id: 'utilities-and-fees',
    title: '水电燃气与代收费用计价',
    dimension: '费用',
    severity: 'medium',
    resultTypes: ['explicit_disadvantage', 'missing_term', 'needs_review'],
    trigger: '水电燃气等费用按单方定价、包干加价或无上限代收，且未写明计价依据、分摊方式、抄表与核对机制，导致租客承担不透明或重复费用。',
    counterSignals: [
      '费用按供水、供电、燃气等实际账单或政府定价结算，并有抄表与分摊口径。',
      '服务费、管理费等单独列明，未与押金或租金重复收取。',
      '条款只约定按实际费用据实结算，没有单方加价或固定包干的不利后果。',
    ],
    requiredEvidence: ['费用种类', '计价依据或单价', '分摊与抄表方式', '是否存在代收加价', '与押金租金是否重复'],
    examples: ['水电费按甲方公布价格收取且不得核对账单', '每月固定收取公共服务费但不说明用途与计算方式'],
    nonExamples: ['水电燃气按市政账单据实分摊，租客可核对表数与缴费凭证'],
    action: '要求写明各项费用的计价依据、抄表与分摊方式、凭证核对和不得重复收取。',
    legalSources: [{ ...officialSources.civilCodeLease, article: '第七百零四条' }],
  },
  'sublease-and-cohabitation': {
    id: 'sublease-and-cohabitation',
    title: '转租与合租边界',
    dimension: '居住权',
    severity: 'medium',
    resultTypes: ['explicit_disadvantage', 'missing_term', 'needs_review'],
    trigger: '合同对转租、转借、合租或居住人数作出单方限制，未区分需同意的情形与默示同意，或对违规后果作笼统加重，影响租客正常居住安排。',
    counterSignals: [
      '条款明确转租须经出租人同意，并写明同意或拒绝的合理期限。',
      '对共同居住人的约定限于合理范围，未禁止一切访客或亲属短期居住。',
      '仅按法律一般规则约定转租需同意，没有叠加不合理罚则。',
    ],
    requiredEvidence: ['转租或合租的约定内容', '是否需出租人同意', '同意期限或默示同意', '违规后果', '居住人数限制'],
    examples: ['任何情况下不得留宿他人，违者立即解约并没收押金', '转租须甲方书面同意但甲方无期限不予答复'],
    nonExamples: ['转租须经甲方书面同意；甲方三十日内未答复视为同意，合理亲属短期探访不视为转租'],
    action: '明确转租同意的期限与默示效果，区分长期转租与短期访客，去掉笼统加重的后果。',
    legalSources: [{ ...officialSources.civilCodeLease, article: '第七百一十六条、第七百一十八条' }],
  },
  'attachments-and-inventory': {
    id: 'attachments-and-inventory',
    title: '附件、设施清单与返还标准',
    dimension: '维修',
    severity: 'medium',
    resultTypes: ['explicit_disadvantage', 'missing_term', 'needs_review'],
    trigger: '以附件、设施清单或交接单确定返还标准时，清单缺失、标准由单方认定，或把正常使用损耗写成须恢复全新，导致退租时被不合理扣款。',
    counterSignals: [
      '合同附交接清单，注明设施现状与已有损耗，返还标准按使用后的状态判断。',
      '正常损耗免责，扣款须对应清单载明项目与实际损坏凭证。',
      '条款仅要求妥善保管和按性质使用后的状态返还，没有单方认定或更换全新要求。',
    ],
    requiredEvidence: ['是否有附件或交接清单', '返还标准表述', '正常损耗如何处理', '验收与扣款依据', '验收主体'],
    examples: ['退租须恢复全新状态，是否符合要求以甲方判断为准', '设施清单未列明现状，退租时另行按甲方标准索赔'],
    nonExamples: ['按交接清单载明现状返还，正常使用损耗不扣款，争议项目凭照片与维修票据核对'],
    action: '要求附交接清单并注明现状，明确返还按使用后状态、正常损耗免责、扣款须有凭证。',
    legalSources: [{ ...officialSources.civilCodeLease, article: '第七百一十条、第七百一十四条、第七百三十三条' }],
  },
  'pet-and-use-restrictions': {
    id: 'pet-and-use-restrictions',
    title: '宠物与使用限制',
    dimension: '居住权',
    severity: 'low',
    resultTypes: ['explicit_disadvantage', 'missing_term', 'needs_review'],
    trigger: '合同对饲养宠物或其他生活使用方式设定笼统禁止、单方认定或高额罚则，与合理居住需求冲突，且未区分实际损害与抽象禁止。',
    counterSignals: [
      '宠物或使用限制属于双方约定的居住规则，且处罚与实际损害或恢复费用相称。',
      '条款只作一般性约定，没有把正常生活使用直接认定为违约或没收押金。',
      '涉及宠物造成损坏的，按实际损失与维修责任处理，而非一律禁止或固定重罚。',
    ],
    requiredEvidence: ['限制的具体内容', '违反的后果或罚则', '是否区分实际损害', '是否与押金或解约挂钩'],
    examples: ['饲养任何宠物一经发现立即解约并没收全部押金', '不得进行任何影响他人的活动，具体由甲方随时认定'],
    nonExamples: ['不得饲养大型宠物；如造成设施损坏，按实际损失赔偿并恢复原状'],
    action: '提示这类限制主要靠双方约定：建议明确合理范围，罚则与实际损害相称，避免与押金或解约不当挂钩。',
    legalSources: [{ ...officialSources.civilCodeLease, article: '第七百零九条' }],
  },
}

export function getContractReviewPlaybookPrompt() {
  const cards = Object.values(contractReviewPlaybook).map((card) => [
    `- ${card.id}｜${card.title}｜触发：${card.trigger}`,
    `  反例信号：${card.counterSignals.join('；')}`,
    `  明确不报（已含这些保护/例外时，该卡判未命中，不得进 risks）：${card.nonExamples.join('；')}`,
    `  必须核对：${card.requiredEvidence.join('、')}`,
    `  依据：${card.legalSources.map((source) => `${source.title}${source.article ? `（${source.article}）` : ''}`).join('；')}`,
  ].join('\n')).join('\n')

  return `审查标准卡（仅适用于签约前、租客视角的住房租赁合同）：\n${cards}\n\n审查边界：不得把“缺少更有利约定”直接判定为违法；不得把协商建议写成确定法律结论；每个风险必须同时给出合同原文证据和触发的标准卡 id。`
}

export function getPlaybookIdForFinding(finding = {}) {
  const dimension = String(finding.dimension || '')
  const title = String(finding.title || '')
  // AI 补盲风险的 title 常写成「费用计算不合理」「违约金双倍计算」这类泛化短句，
  // 单看 title 推断容易落空；evidence 是逐字原文，含押金/租金/违约等实词，一起看更稳。
  const evidence = String(finding.evidence || '')
  const text = `${title} ${evidence}`

  // 附件/宠物/转租有专用卡，虽常被 AI 打上「维修」「居住权」泛标签，仍须优先按特定词命中。
  if (/附件|设施清单|交接清单|恢复全新|恢复原状/.test(text)) return 'attachments-and-inventory'
  if (/宠物|饲养/.test(text)) return 'pet-and-use-restrictions'
  if (/转租|合租|居住人数/.test(text)) return 'sublease-and-cohabitation'
  // 入户/换锁/腾退优先于泛「押金」「违约」：这些卡有专属法条，错配成押金卡会补错法条。
  if (/居住权/.test(dimension) || /入户|进屋|进入房屋|换锁|腾退|带看|备用钥匙|访客/.test(text)) return 'entry-and-consent'
  // 多倍占用费/逾期搬离/违约金叠加：归违约损失卡（民法典585/563），
  // 而不是被 evidence 里的「押金」抢成押金卡。
  if (/占用费|逾期搬离|逾期腾退|双倍|多倍|\d\s*倍房租|\d\s*倍租金/.test(text)
    && /违约|占用|腾退|搬离|解约|赔偿/.test(text)) return 'early-termination-loss'
  if (/押金|扣款|返还|保证金/.test(text) || /押金/.test(dimension)) return 'deposit-settlement'
  if (/费用/.test(dimension) || /水电|燃气|服务费|管理费|代收|计价|收取费用|收费|杂费|费用计算/.test(text)) return 'utilities-and-fees'
  if (/维修/.test(dimension) || /维修|老化|损耗|故障/.test(text)) return 'repair-duty'
  if (/租期|租金/.test(dimension) || /续租|涨租|租金|调租/.test(text)) return 'renewal-rent-change'
  if (/解除|违约/.test(dimension) || /解约|违约|赔偿|定金/.test(text)) return 'early-termination-loss'
  return null
}
