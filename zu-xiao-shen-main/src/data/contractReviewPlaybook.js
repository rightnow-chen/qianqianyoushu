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
}

export function getContractReviewPlaybookPrompt() {
  const cards = Object.values(contractReviewPlaybook).map((card) => [
    `- ${card.id}｜${card.title}｜触发：${card.trigger}`,
    `  反例：${card.counterSignals.join('；')}`,
    `  必须核对：${card.requiredEvidence.join('、')}`,
    `  依据：${card.legalSources.map((source) => `${source.title}${source.article ? `（${source.article}）` : ''}`).join('；')}`,
  ].join('\n')).join('\n')

  return `审查标准卡（仅适用于签约前、租客视角的住房租赁合同）：\n${cards}\n\n审查边界：不得把“缺少更有利约定”直接判定为违法；不得把协商建议写成确定法律结论；每个风险必须同时给出合同原文证据和触发的标准卡 id。`
}

export function getPlaybookIdForFinding(finding = {}) {
  const dimension = String(finding.dimension || '')
  const title = String(finding.title || '')
  if (/押金/.test(dimension) || /押金|扣款|返还/.test(title)) return 'deposit-settlement'
  if (/维修/.test(dimension) || /维修|老化|损耗/.test(title)) return 'repair-duty'
  if (/居住权/.test(dimension) || /入户|访客|换锁|腾退/.test(title)) return 'entry-and-consent'
  if (/租期|租金/.test(dimension) || /续租|涨租|租金/.test(title)) return 'renewal-rent-change'
  if (/解除|违约/.test(dimension) || /解约|违约|赔偿/.test(title)) return 'early-termination-loss'
  return null
}
