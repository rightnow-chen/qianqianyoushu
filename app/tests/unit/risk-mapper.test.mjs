// 映射层单测：锁死「引擎语义 → 产品语义」的换算，防止哪天改规则库时把「必须改」悄悄变成别的。
// 运行：node tests/unit/risk-mapper.test.mjs

import assert from 'node:assert/strict'
import {
  parseArticle,
  categoryOf,
  amountKeyOf,
  confidenceLabel,
  toRiskModel,
  sortRisks,
  describeDegradation,
} from '../../src/features/riskMapper.js'
import { computeAmounts, computeWorstCase } from '../../src/features/amountEngine.js'
import { countByLevel } from '../../src/features/riskModel.js'

// ---- 条文号解析 ----
assert.equal(parseArticle('第4条'), 4, '阿拉伯数字条文号应直接解析')
assert.equal(parseArticle('第十二条'), 12, '中文数字条文号应解析')
assert.equal(parseArticle('第二十条'), 20, '二十应解析为 20')
assert.equal(parseArticle(null), null, '没有条号时应返回 null，不猜')

// ---- 九类归类 ----
assert.equal(categoryOf({ id: 'lease-arbitrary-deposit-deduction' }), '押金')
assert.equal(categoryOf({ id: 'lease-termination-asymmetry' }), '提前退租')
assert.equal(categoryOf({ id: 'lease-all-maintenance-tenant' }), '维修责任')
assert.equal(categoryOf({ id: 'lease-self-help-utility-cutoff' }), '水电费用')
assert.equal(categoryOf({ id: 'lease-auto-renewal-rent-up' }), '租金调整')
assert.equal(categoryOf({ id: 'lease-landlord-entry-no-consent' }), '居住安宁')
assert.equal(categoryOf({ id: 'lease-sublet-extra-fee' }), '转租')
assert.equal(categoryOf({ id: 'lease-pet-forfeiture-no-cure' }), '宠物')
assert.equal(categoryOf({ id: 'deliverable-list-missing' }), '附件')

// ---- 置信度口径 ----
assert.equal(confidenceLabel(0.92).label, '确定')
assert.equal(confidenceLabel(0.75).label, '需确认')
assert.equal(confidenceLabel(0.5).label, 'AI 推断')

// ---- 三级换算 + 降级（PRD FR-10）----
const amounts = computeAmounts({ rent: 4500, deposit: 13500, months: 12 })
const base = {
  title: '退租时同时没收押金并追加违约金',
  explain: '违约一次同时触发两处罚则，责任叠加且没有上限。',
  evidence: '第5条　乙方提前退租的，押金不予退还，并另行支付两个月租金作为违约金。',
  replacement: '乙方提前退租的，提前 30 日书面通知并支付一个月租金作为补偿。',
  evidenceLocation: { line: 12, clause: '第5条' },
  legalBasis: '参考《民法典》关于违约金与损失赔偿的规定。',
}

const [highConfirmed] = toRiskModel([{ ...base, id: 'lease-termination-asymmetry', level: 'high', confidence: 0.95 }], { amounts, contractText: 'x\n'.repeat(40), pages: 4 })
assert.equal(highConfirmed.level, 'must', '高严重度 + 确定 → 必须改')
assert.equal(highConfirmed.cat, '提前退租')
assert.equal(highConfirmed.amountKey, 'termination', '退租类应挂违约金金额键')
assert.ok(highConfirmed.consequence.includes('¥9,000'), '月租 4500 时违约金估算应为 9,000')

const [highInferred] = toRiskModel([{ ...base, id: 'lease-termination-asymmetry', level: 'high', confidence: 0.55 }], { amounts })
assert.equal(highInferred.level, 'check', '高严重度但 AI 推断 → 降级为建议确认（FR-10）')

const [medium] = toRiskModel([{ ...base, id: 'lease-auto-renewal-rent-up', level: 'medium', confidence: 0.9 }], { amounts })
assert.equal(medium.level, 'check', '中严重度 → 建议确认')

// findingType 必须真正传到档位换算层（缺陷库评测驱动，2026-11-17）
// 无 findingType 维持 check；有明确不利机制则抬为 must；needs_review 不抬
const [mediumExplicit] = toRiskModel([{ ...base, id: 'ai-risk-1', level: 'medium', confidence: 0.9, findingType: 'explicit_disadvantage' }], { amounts })
assert.equal(mediumExplicit.level, 'must', '明确不利机制+中严重度 → 必须改（链路须传 findingType）')
const [mediumMissing] = toRiskModel([{ ...base, id: 'ai-risk-2', level: 'medium', confidence: 0.9, findingType: 'missing_term' }], { amounts })
assert.equal(mediumMissing.level, 'must', '缺失关键条款+中严重度 → 必须改')
const [mediumReview] = toRiskModel([{ ...base, id: 'ai-risk-3', level: 'medium', confidence: 0.9, findingType: 'needs_review' }], { amounts })
assert.equal(mediumReview.level, 'check', '待核对+中严重度 → 仍为建议确认，不抬档')

const [low] = toRiskModel([{ ...base, id: 'lease-pet-additional-penalty', level: 'low', confidence: 0.9 }], { amounts })
assert.equal(low.level, 'note', '低严重度 → 仅提醒')
assert.equal(low.amountKey, null, '宠物类算不出金额时应为 null，不硬凑')
assert.equal(low.catLabel, '宠物', '非租金类不要改名字')

// 逾期违约金归在租金大类（CAT_RULES），但结论句不能说成「租金调整条款」
const [lateFee] = toRiskModel([{ ...base, id: 'lease-late-fee-5-percent', level: 'high', confidence: 0.95 }], { amounts })
assert.equal(lateFee.cat, '租金调整', '分类保持租金大类')
assert.equal(lateFee.catLabel, '违约金', '结论句里应叫违约金，否则和卡片标题对不上')

// ---- 九件套齐备性 ----
for (const risk of [highConfirmed, medium, low]) {
  assert.ok(risk.title.startsWith(risk.cat), '标题应带类别前缀')
  assert.ok(risk.original, '必须有合同原句')
  assert.ok(risk.suggestion, '必须有建议措辞')
  assert.ok(risk.why, '必须有一句为什么改')
  assert.ok(risk.scripts.polite && risk.scripts.firm, '两档话术都要有')
  assert.equal(risk.objections.length, 3, '三种回法都要有')
  assert.equal(risk.location.article, 5, '条文号应从 evidenceLocation 解析')
}
assert.ok(highConfirmed.location.page >= 1, '给了页数时应推算页码')
assert.equal(medium.location.page, null, '没给页数时页码留空，不编')

// ---- 金额联动：同一份合同换成 6000 月租，违约金必须跟着变 ----
const richer = computeAmounts({ rent: 6000, deposit: 18000, months: 12 })
const [rented] = toRiskModel([{ ...base, id: 'lease-termination-asymmetry', level: 'high', confidence: 0.95 }], { amounts: richer })
assert.ok(rented.consequence.includes('¥12,000'), '月租 6000 时违约金估算应为 12,000（不是硬编码）')

// ---- 排序与统计 ----
const mixed = toRiskModel(
  [
    { ...base, id: 'lease-pet-additional-penalty', level: 'low', confidence: 0.9, evidenceLocation: { line: 30, clause: '第9条' } },
    { ...base, id: 'lease-arbitrary-deposit-deduction', level: 'high', confidence: 0.95, evidenceLocation: { line: 4, clause: '第2条' } },
    { ...base, id: 'lease-auto-renewal-rent-up', level: 'medium', confidence: 0.9, evidenceLocation: { line: 20, clause: '第7条' } },
  ],
  { amounts },
)
assert.deepEqual(mixed.map((risk) => risk.level), ['must', 'check', 'note'], '默认按严重程度排序')
assert.deepEqual(
  sortRisks(mixed, 'source').map((risk) => risk.location.article),
  [2, 7, 9],
  '切到原文顺序时按条文号排',
)
assert.deepEqual(countByLevel(mixed), { must: 1, check: 1, note: 1, total: 3 })

// ---- 降级路径 ----
assert.equal(describeDegradation([], []).level, 'failed', '零条款要走失败态')
// 字读进来了、只是没一句话命中规则：不能说成「没读到」，否则用户会被要求重拍一份正常的合同
const longText = '第三条 租金与月度应付款。乙方应在每月1日前支付当月款项。'.repeat(6)
assert.equal(describeDegradation([], [], { text: longText }).level, 'no-match', '有正文但不命中应走「没命中规则」')
assert.ok(
  describeDegradation([], [], { text: longText }).readable > 60,
  '「没命中规则」要报出实读字数，用来证明文件本身没问题',
)
assert.equal(describeDegradation([], [], { text: '太短' }).level, 'failed', '字数太少仍按读取失败处理')
assert.equal(describeDegradation([{ id: 'x' }], []).level, 'partial', '有条款但没定位要走部分态')
assert.ok(
  describeDegradation([{ id: 'x' }], [{ hasSuggestion: false, amountKey: null }]).noSuggestion === 1,
  '缺建议的风险要被统计出来',
)

// ---- 最坏情况合计：同一笔钱不能重复计 ----
const worst = computeWorstCase(
  [
    { id: 'a', level: 'must', amountKey: 'termination', location: { article: 3 } },
    { id: 'b', level: 'must', amountKey: 'termination', location: { article: 3 } },
    { id: 'c', level: 'must', amountKey: 'repair', location: { article: 4 } },
    { id: 'd', level: 'check', amountKey: 'depositDeduct', location: { article: 2 } },
  ],
  amounts,
)
assert.equal(worst.items.length, 2, '两条风险同挂违约金时只算一次')
assert.equal(worst.total, 12000, '9,000（违约金）+ 3,000（维修）= 12,000，非必须改的不计入')

// ---- AI 审查结果也要能定价 ----
// AI 给的 id 是 risk-1 这种编号，按 id 的正则一个都认不出来，
// 结果是「6 条风险但最坏合计显示待补」——明明能算的钱被算成了算不出来。
assert.equal(
  amountKeyOf({ id: 'risk-3', findingType: 'explicit_disadvantage', title: '乙方提前退租承担一个月租金补偿且甲方可另主张空置损失差额' }),
  'termination',
  'AI 的提前退租必须挂上退租违约金',
)
assert.equal(
  amountKeyOf({ id: 'risk-2', findingType: 'explicit_disadvantage', title: '押金可扣除合理检测费用且无凭证和异议机制' }),
  'depositDeduct',
  'AI 的押金扣款要挂上押金扣款',
)
assert.equal(
  amountKeyOf({ id: 'risk-4', findingType: 'needs_review', title: '乙方承担每次报修前500元以内上门检查及易耗材料费' }),
  'repair',
  'AI 的维修费用要挂上维修估值',
)
assert.equal(
  amountKeyOf({ id: 'risk-5', findingType: 'explicit_disadvantage', title: '甲方提前12小时通知后乙方4小时内未提替代时间即视为同意入户' }),
  null,
  '入户不能定价，不许为了凑合计硬挂金额',
)
// 规则引擎那 9 条行为必须不变：它认不出 id 就说明这条本来就不该定价。
assert.equal(
  amountKeyOf({ id: 'lease-deposit-return-delay', title: '押金退还周期过长' }),
  null,
  '规则引擎的风险不参与标题兜底，押金退还慢不是会被扣掉的钱',
)

console.log('risk-mapper: 全部断言通过')
