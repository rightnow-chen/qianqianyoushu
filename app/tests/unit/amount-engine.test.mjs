// 金额引擎单测：锁死「所有金额都由月租 / 押金 / 租期算出来」这条口径。
// 这些数字一旦漂移，首页最坏情况合计、Tab 角标、导出报告会同时错，而且错得不明显。
import assert from 'node:assert/strict'
import {
  AMOUNT_CONFIG,
  amountForRisk,
  computeAmounts,
  computeVerdict,
  computeWorstCase,
  formatMoney,
} from '../../src/features/amountEngine.js'

const BASE = { rent: 4500, deposit: 13500, months: 12 }
const base = computeAmounts(BASE)

// 1) 原型基准口径
assert.equal(base.depositDeduct, 5400, '押金扣款 = 押金 13,500 × 40%')
assert.equal(base.termination, 9000, '退租违约金 = 月租 4,500 × 2')
assert.equal(base.repair, 3000, '维修估值固定 3,000')
assert.equal(base.rentHike, 4320, '涨租上限 = 月租 × 8% × 12')

// 2) 联动：月租变了，违约金与涨租必须跟着变
const raised = computeAmounts({ ...BASE, rent: 6000 })
assert.equal(raised.termination, 12000, '月租 6,000 → 违约金 12,000')
assert.equal(raised.rentHike, 5760, '月租 6,000 → 涨租上限 5,760')

// 3) 押金变了，扣款跟着变
const biggerDeposit = computeAmounts({ ...BASE, deposit: 18000 })
assert.equal(biggerDeposit.depositDeduct, 7200, '押金 18,000 → 扣款上限 7,200')

// 4) 缺字段不能算出 NaN
const empty = computeAmounts({})
assert.equal(empty.termination, 0)
assert.equal(formatMoney(Number.NaN), '—', 'NaN 一律显示为 —，不许出现 NaN 字样')

// 5) 最坏合计：三项之和，且顺序稳定
const mustRisks = [
  { id: 'a', level: 'must', amountKey: 'depositDeduct', location: { article: 3 } },
  { id: 'b', level: 'must', amountKey: 'termination', location: { article: 5 } },
  { id: 'c', level: 'must', amountKey: 'repair', location: { article: 6 } },
]
const worst = computeWorstCase(mustRisks, base)
assert.equal(worst.total, 17400, '5,400 + 9,000 + 3,000 = 17,400')
assert.equal(worst.items.length, 3)

const worstRaised = computeWorstCase(mustRisks, raised)
assert.equal(worstRaised.total, 20400, '月租 6,000 且押金不变 → 20,400')

// 6) 同一口径只算一次：两条风险都挂违约金时，赔的是同一笔钱
const duplicated = computeWorstCase(
  [
    { id: 'a', level: 'must', amountKey: 'termination', location: { article: 5 } },
    { id: 'b', level: 'must', amountKey: 'termination', location: { article: 9 } },
  ],
  base,
)
assert.equal(duplicated.total, 9000, '违约金不能叠加两次')
assert.equal(duplicated.items.length, 1)

// 7) 只有「必须改」进合计；建议确认、仅提醒不进去
const mixed = computeWorstCase(
  [
    { id: 'a', level: 'must', amountKey: 'repair', location: { article: 6 } },
    { id: 'b', level: 'check', amountKey: 'depositDeduct', location: { article: 3 } },
    { id: 'c', level: 'note', amountKey: 'termination', location: { article: 5 } },
  ],
  base,
)
assert.equal(mixed.total, 3000, '只有必须改的维修费进合计')

// 8) 不能定价的条款：给「机制」，不编数字
const noPrice = amountForRisk({ amountKey: null }, base)
assert.equal(noPrice.kind, 'none')
assert.equal(noPrice.value, 0)
assert.equal(noPrice.text, '—')

// 9) 涨租与水电不进最坏合计（它们是「本该更便宜」的增益，不是损失）
assert.equal(AMOUNT_CONFIG.rentHikeRate, 0.08)
const gainOnly = computeWorstCase(
  [
    { id: 'a', level: 'must', amountKey: 'rentHike', location: { article: 4 } },
    { id: 'b', level: 'must', amountKey: 'utility', location: { article: 7 } },
  ],
  base,
)
assert.equal(gainOnly.total, 0, '涨租与水电差价不计入损失合计')

// 10) 结论三档：必须改 ≥4 条时给「暂不建议签约」
const verdictStop = computeVerdict(
  ['depositDeduct', 'termination', 'repair', 'rentHike'].map((amountKey, index) => ({
    id: `r${index}`,
    level: 'must',
    amountKey,
    cat: '押金',
    location: { article: index + 1 },
  })),
  base,
  { checklistCount: 8 },
)
assert.equal(verdictStop.key, 'stop')
assert.ok(verdictStop.desc.includes('17,400'), '结论里要复述最坏合计')

const verdictGo = computeVerdict([], base, { checklistCount: 8 })
assert.equal(verdictGo.key, 'go')
assert.ok(verdictGo.desc.includes('8 件'), '没有必须改时，指向合同外的待核实清单')

const verdictGo6 = computeVerdict([], base, { checklistCount: 6 })
assert.ok(verdictGo6.desc.includes('6 件'), '清单件数必须跟着实际条数走，不能写死 8')

// 11) 合同里没读到月租/押金时，不能把 0 当成「不用担心」
//     真实事故：国家示范文本没有金额，结果页大红字写「最坏情况合计损失 ¥0」，
//     旁边却有 1 条「必须改」的风险，读起来像「这件事不花钱」。
const noMoney = { rent: 0, deposit: 0, months: 12, repairEstimate: 3000 }
const zeroAmounts = computeAmounts(noMoney)
const zeroDeposit = amountForRisk({ amountKey: 'depositDeduct' }, zeroAmounts)
assert.equal(zeroDeposit.value, 0)
assert.equal(zeroDeposit.missing, true, '押金为 0 时必须标记「算不出来」')
assert.equal(zeroDeposit.text, '金额待补', '不能显示 −¥0，那意思是「不会亏」')

const zeroWorst = computeWorstCase([{ id: 'a', level: 'must', amountKey: 'depositDeduct' }], zeroAmounts)
assert.equal(zeroWorst.total, 0)
assert.equal(zeroWorst.items.length, 0)
assert.equal(zeroWorst.unpriced, 1, '要能数出还有几条必须改算不出钱')

const zeroVerdict = computeVerdict(
  [{ id: 'a', level: 'must', amountKey: 'depositDeduct', cat: '押金', location: { article: 3 } }],
  zeroAmounts,
  { checklistCount: 8 },
)
assert.equal(zeroVerdict.key, 'hold')
assert.ok(!zeroVerdict.desc.includes('¥0'), `结论里不能出现 ¥0：${zeroVerdict.desc}`)
assert.ok(zeroVerdict.desc.includes('月租和押金'), '要说清是缺了哪两个数')

console.log('amount-engine: 全部断言通过')
