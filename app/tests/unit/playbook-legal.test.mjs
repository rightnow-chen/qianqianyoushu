// 标准卡→法条映射单测：AI 补盲风险按 playbookId 继承人工核实的法条。
// 运行：node tests/unit/playbook-legal.test.mjs
import assert from 'node:assert/strict'
import { enrichFindingsWithLegalBasis } from '../../src/features/contractReview.js'
import { PLAYBOOK_LEGAL_MAP, legalForPlaybook } from '../../src/features/playbookLegal.js'
import { contractReviewPlaybook } from '../../src/data/contractReviewPlaybook.js'
import { resolveLegalUrl } from '../../src/features/legalBasisMap.js'

// 1. 9 张标准卡全覆盖，无幽灵条目
const cards = Object.keys(contractReviewPlaybook)
assert.equal(cards.length, 9, '当前应有 9 张标准卡')
for (const id of cards) {
  assert.ok(PLAYBOOK_LEGAL_MAP[id], `标准卡 ${id} 必须配法条`)
}
assert.equal(Object.keys(PLAYBOOK_LEGAL_MAP).length, cards.length, '映射表不能多也不能少')

// 2. 每条法条都能生成权威链接（法名+条号可解析），描述非空
for (const [id, entry] of Object.entries(PLAYBOOK_LEGAL_MAP)) {
  assert.ok(entry.lawLabel && entry.basis, `${id} 法条简称与描述都要有`)
  const url = resolveLegalUrl(entry.lawLabel)
  assert.ok(url, `${id} 的法条简称必须能解析出原文链接：${entry.lawLabel}`)
  assert.ok(/^https?:\/\//.test(url), `${id} 链接必须是 http(s)：${url}`)
}

// 3. 取不到的卡返回 null，不编造
assert.equal(legalForPlaybook('no-such-card'), null)
assert.equal(legalForPlaybook(''), null)
assert.equal(legalForPlaybook(null), null)

// 4. AI 补盲风险：带 playbookId，本地没有同句 finding → 按卡继承法条
const aiEarlyTerm = {
  id: 'ai-risk-9',
  title: '提前解约需对方同意且违约金过高',
  dimension: '解除',
  playbookId: 'early-termination-loss',
  evidence: '乙方提前退租需经甲方同意，并支付相当于两个月租金的违约金。',
}
const enriched = enrichFindingsWithLegalBasis([aiEarlyTerm], [])
assert.equal(enriched[0].legalLaw, '民法典第五百八十五条、第五百六十三条', '按卡继承法条')
assert.ok(enriched[0].legalBasis.includes('违约金'), '继承人工核实的依据描述')
assert.ok(enriched[0].legalUrl.includes('12371.cn'), '链接指向权威全文页')
assert.equal(enriched[0].title, aiEarlyTerm.title, '只补法条字段，不动 AI 的结论')
assert.equal(enriched[0].evidence, aiEarlyTerm.evidence, '证据不动')

// 5. playbookId 缺失时按维度/标题推断卡，再继承
const aiDepositNoCard = {
  id: 'ai-risk-2',
  title: '押金退还无期限',
  dimension: '押金',
  evidence: '退租后押金在甲方确认房屋无误后返还。',
}
const inferred = enrichFindingsWithLegalBasis([aiDepositNoCard], [])
assert.equal(inferred[0].legalLaw, '住房租赁条例第十条', '无 playbookId 时按维度推断卡')

// 6. 本地逐字匹配优先于按卡继承（已有精确法条时不被覆盖）
const localExact = {
  id: 'lease-exact',
  title: '本地精确风险',
  dimension: '押金',
  evidence: '退租后押金在甲方确认房屋无误后返还。',
  legalLaw: '住房租赁条例第十条',
  legalBasis: '本地已核实的依据。',
  legalUrl: 'https://example.test/exact',
}
const preferLocal = enrichFindingsWithLegalBasis([
  { ...aiDepositNoCard, playbookId: 'repair-duty' },
], [localExact])
assert.equal(preferLocal[0].legalBasis, '本地已核实的依据。', '逐字匹配的本地法条优先')

// 7. 无法匹配任何卡时保持原样（不编造、不塞兜底法条）
const unmatched = enrichFindingsWithLegalBasis([
  { id: 'ai-x', title: '未匹配问题', dimension: '综合', evidence: '合同里没有这段内容。' },
], [])
assert.equal(unmatched[0].legalLaw, undefined, '无法匹配就保持空，界面显示「未匹配到具体法条」')

// 8. 回归（2026-11-23 用户实测 bug）：AI 给了幻觉/本地 id，旧代码用 `||` 短路掉推断，
//    明明能从标题/证据推断出卡却因假 id 查表落空，显示「未匹配到具体法条」。
const hallucinatedId = {
  id: 'ai-risk-3',
  title: '违约金双倍计算不合理',
  dimension: '违约责任',
  playbookId: 'lease-bogus-id', // 幻觉 id，不在 9 张卡里
  evidence: '乙方违约需支付双倍押金作为违约金。',
}
const recovered = enrichFindingsWithLegalBasis([hallucinatedId], [])
assert.equal(recovered[0].legalLaw, '民法典第五百八十五条、第五百六十三条',
  '幻觉 playbookId 不得短路按卡推断')

// 9. 回归：AI 标题泛化（「费用计算不合理」），仅看 title 推断落空；
//    必须结合 evidence 原文（「按双倍标准收取费用」）命中费用卡。
const vagueTitle = {
  id: 'ai-risk-8',
  title: '费用计算不合理',
  dimension: '综合',
  playbookId: 'risk-8', // 连标准卡 id 格式都不是
  evidence: '甲方按双倍标准收取费用。',
}
const recoveredVague = enrichFindingsWithLegalBasis([vagueTitle], [])
assert.equal(recoveredVague[0].legalLaw, '民法典第七百零四条',
  '标题泛化时须结合 evidence 推断卡')

console.log('playbook-legal 单测通过：9 卡全覆盖 + 链接可解析 + 按卡继承 + 推断兜底 + 本地优先 + 诚实留空 + 幻觉id/泛标题回归')
