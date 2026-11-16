import assert from 'node:assert/strict'
import { extractContractFacts } from '../../src/features/contractFacts.js'
import { metaFromFacts } from '../../src/features/riskMapper.js'
import { createAiReviewPrompt } from '../../src/features/aiAssistant.js'

const text = `房屋租赁合同
第一条 租期。租期自2026年10月1日至2027年9月30日，共12个月。
第二条 租金。月租金3200元，押金6400元；乙方逾期超过3日的，甲方可依第六条处理。
第六条 违约责任。乙方未在4小时内回复，视为同意入户。`

const facts = extractContractFacts(text)
assert.equal(facts.clauses.length, 3)
assert.equal(facts.clauses[0].id, 'clause-1-租期')
assert.equal(facts.clauses[0].title, '租期')
assert.equal(facts.clauses[0].location.line, 2)
assert.ok(facts.clauses[0].text.includes('2026年10月1日'))
assert.ok(facts.amounts.some((item) => item.raw === '3200元' && item.clauseId === 'clause-2-租金'))
assert.ok(facts.amounts.some((item) => item.raw === '6400元' && item.clauseId === 'clause-2-租金'))
assert.ok(facts.dates.some((item) => item.raw === '2026年10月1日' && item.clauseId === 'clause-1-租期'))
assert.ok(facts.terms.some((item) => item.raw === '12个月' && item.clauseId === 'clause-1-租期'))
assert.deepEqual(facts.references, [{
  fromClauseId: 'clause-2-租金',
  target: '第六条',
  targetClauseId: 'clause-6-违约责任',
}])

const reviewPrompt = createAiReviewPrompt(text, { contractType: 'lease', reviewDepth: 'strict' })
assert.match(reviewPrompt, /clause-2-租金/)
assert.match(reviewPrompt, /第六条/)
assert.match(reviewPrompt, /事实索引/)

const complexText = `第一条 定义。本合同所称“租金”是指乙方每月应支付的房屋使用费，以下简称“租金”有效。
第二条 附件与清单。附件一《房屋交接清单》与本合同具有同等效力。
项目 | 数量 | 状态
门锁 | 2 | 完好
第三条 责任。甲方不承担乙方擅自改造产生的费用，乙方未经甲方书面同意不得转租。`
const complexFacts = extractContractFacts(complexText)
assert.ok(complexFacts.definitions.some((item) => item.term === '租金' && item.clauseId === 'clause-1-定义'))
assert.ok(complexFacts.attachments.some((item) => item.title.includes('房屋交接清单') && item.clauseId === 'clause-2-附件与清单'))
assert.equal(complexFacts.tables.length, 1)
assert.equal(complexFacts.tables[0].rowCount, 2)
assert.ok(complexFacts.negations.some((item) => item.raw === '不承担' && item.clauseId === 'clause-3-责任'))
assert.ok(complexFacts.negations.some((item) => item.raw === '不得' && item.clauseId === 'clause-3-责任'))
const complexPrompt = createAiReviewPrompt(complexText, { contractType: 'lease', reviewDepth: 'strict' })
assert.match(complexPrompt, /定义项：/)
assert.match(complexPrompt, /附件与清单/)
assert.match(complexPrompt, /表格：/)
assert.match(complexPrompt, /否定条件：/)

const conflictText = `第二条 租金。月租金3200元，租期12个月。
第三条 附件。附件一《费用清单》记载月租金3500元，租期11个月。
费用 | 金额 | 备注
租金 | 3500元`
const conflictFacts = extractContractFacts(conflictText)
assert.ok(conflictFacts.conflicts.some((item) => item.key === '月租金' && item.values.includes('3200元') && item.values.includes('3500元')))
assert.ok(conflictFacts.conflicts.some((item) => item.key === '租期' && item.values.includes('12个月') && item.values.includes('11个月')))
assert.equal(conflictFacts.tables[0].columnCount, 3)
assert.equal(conflictFacts.tables[0].quality, 'inconsistent_columns')
const qualityFacts = extractContractFacts(`${conflictText}\n金额�待确认`)
assert.ok(qualityFacts.qualityWarnings.some((item) => item.type === 'ocr_suspect'))
const conflictPrompt = createAiReviewPrompt(`${conflictText}\n金额�待确认`, { contractType: 'lease', reviewDepth: 'strict' })
assert.match(conflictPrompt, /事实冲突：/)
assert.match(conflictPrompt, /质量警告：/)

// 金额必须容忍千分位与「万元」：正式合同写「4,500 元」是常态，
// 曾经只用 \d+ 匹配，4,500 被读成 500、13,500 被读成 500，确认页看起来就像「识别错了」。
const moneyText = `第三条 租金。房屋月租金为人民币 4,500 元（大写：肆仟伍佰元整）。
第四条 押金。乙方应支付押金人民币 13,500 元。
第五条 其他。年租金 5.4 万元的情形另议。`
const moneyFacts = extractContractFacts(moneyText)
const moneyValue = (key) => moneyFacts.amounts.find((item) => item.key === key)?.value
assert.equal(moneyValue('月租金'), 4500, '千分位月租应读成 4500')
assert.equal(moneyValue('押金'), 13500, '千分位押金应读成 13500')
assert.equal(moneyValue('租金'), 54000, '「5.4 万元」应换算成 54000')
const moneyMeta = metaFromFacts(moneyFacts)
assert.equal(moneyMeta.rent, 4500)
assert.equal(moneyMeta.deposit, 13500)

// OCR / 扫描件会把千分位逗号读成点：图片测试包里的「2,800元」被识别成「2.800 元」。
// 如果当成 2.8，用户在确认页看到的月租就是 2.8 元——比读不出来更糟，因为看不出错。
const ocrMoneyFacts = extractContractFacts(`租 金 : 每 月 人 民 币 2.800 元 , 每 月 5 日 前 支 付 。
押 金 : 人 民 币 2.800 元 , 退 租 交 房 后 30 个 工 作 日 退 还 。`)
const ocrMoney = (key) => ocrMoneyFacts.amounts.find((item) => item.key === key)?.value
assert.equal(ocrMoney('租金'), 2800, '「2.800 元」是千分位被读成点，应还原成 2800')
assert.equal(ocrMoney('押金'), 2800, '押金同理，不能变成 2.8')

console.log('contract-facts passed: clauses, locations, amounts, dates, terms and references')
