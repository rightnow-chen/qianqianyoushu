import assert from 'node:assert/strict'
import * as ai from '../src/features/aiAssistant.js'
import { enrichFindingsWithLegalBasis, getRiskSummary, mergeFindings } from '../src/features/contractReview.js'

const source = '乙方未在4小时内回复，视为同意入户。甲方可换锁并没收全部押金。'
const finding = { title: '默认同意入户', level: 'high', evidence: '乙方未在4小时内回复，视为同意入户。', explain: '未回复即同意', suggestion: '改为取得明确同意' }
const response = (content, finish_reason = 'stop', extra = {}) => ({ choices: [{ finish_reason, message: { content, ...extra } }] })
const tests = []
const test = (name, run) => tests.push({ name, run })

test('truncated, empty and malformed reviews never become a completed empty review', () => {
  assert.equal(typeof ai.parseAiReviewResponse, 'function', 'review needs strict response validation')
  for (const data of [
    response('', 'length', { reasoning_content: '{"risks":[]}' }),
    response('{"risks":[]}', 'length'),
    response(''), response('{"risks":['), response('{"summary":"done"}'),
    response('{"risks":[]}', 'content_filter'), response('{"risks":[null]}'),
    response('{"risks":[]}', 'stop', { refusal: 'refused' }),
  ]) assert.throws(() => ai.parseAiReviewResponse(data, source))
})

test('complete empty review and valid evidence are accepted; keyword-only evidence is not', () => {
  assert.equal(typeof ai.parseAiReviewResponse, 'function')
  assert.equal(ai.parseAiReviewResponse(response('{"risks":[]}'), source).qualityReport.status, 'complete')
  const result = ai.parseAiReviewResponse(response(JSON.stringify({ risks: [finding, { ...finding, evidence: '合同里不存在的内容', keywords: ['入户'] }] })), source)
  assert.equal(result.findings.length, 1)
  assert.equal(result.qualityReport.status, 'incomplete')
  assert.equal(result.qualityReport.rejectedCount, 1)
})

test('valid seventeenth risk is not silently dropped', () => {
  const risks = Array.from({ length: 17 }, (_, i) => ({ ...finding, title: `独立问题${i}` }))
  assert.equal(ai.normalizeAiFindings({ risks }, source).length, 17)
})

test('line-wrap-only differences are anchored back to exact original evidence', () => {
  const original = '结算完成后10个工作日内退还可退余额。\n如账单未出，暂留平均代收费用。'
  const result = ai.parseAiReviewResponse(response(JSON.stringify({ risks: [{ ...finding, evidence: original.replace('\n', '') }] })), original)
  assert.equal(result.qualityReport.status, 'complete')
  assert.equal(result.findings[0].evidence, original)
  const changedAmount = ai.parseAiReviewResponse(response(JSON.stringify({ risks: [{ ...finding, evidence: original.replace('10', '100') }] })), original)
  assert.equal(changedAmount.qualityReport.status, 'incomplete')
  assert.equal(changedAmount.findings.length, 0)
})

test('verified findings expose evidence location and preserve partial related evidence status', () => {
  const result = ai.parseAiReviewResponse(response(JSON.stringify({ risks: [{
    ...finding,
    relatedEvidence: [
      { text: '甲方可换锁并没收全部押金。', role: '后果' },
      { text: '合同里不存在的关联条款。', role: '反证' },
    ],
  }] })), source)
  assert.equal(result.findings.length, 1)
  assert.deepEqual(result.findings[0].evidenceLocation, { line: 1, clause: null })
  assert.equal(result.findings[0].verificationStatus, 'partial')
  assert.deepEqual(result.findings[0].relatedEvidence, [{
    text: '甲方可换锁并没收全部押金。',
    location: { line: 1, clause: null },
    role: '后果',
    verificationStatus: 'verified',
  }])
  assert.equal(result.qualityReport.rejectedCount, 0)
})

test('failed and running reviews cannot receive a low-risk score even with zero findings', () => {
  for (const status of ['failed', 'incomplete', 'running']) {
    const summary = getRiskSummary([], { status })
    assert.equal(summary.score, null)
    assert.notEqual(summary.label, '低风险')
    assert.equal(summary.tone, 'warning')
  }
})

test('different risks sharing one clause survive merging', () => {
  const evidence = '乙方未在4小时内回复，视为同意入户。甲方可换锁并没收全部押金。'
  assert.equal(mergeFindings(
    [{ id: 'ai-entry', title: '入户', evidence, dimension: '居住权' }],
    [{ id: 'deposit', title: '没收押金', evidence, dimension: '押金' }],
  ).length, 2)
})

test('ai and local findings quoting the same sentence in one dimension merge into one card', () => {
  // 用户实测复现：AI「争议管辖约定为甲方户籍所在地法院」与本地「管辖地点偏向出租方」
  // 引用同一句话、同为管辖维度，只应展示一张卡（保留本地卡，带法条依据与采纳状态）。
  const evidence = '双方发生争议协商不成的，应向甲方户籍所在地人民法院起诉。'
  const merged = mergeFindings(
    [{ id: 'lease-unfavorable-jurisdiction', title: '管辖地点偏向出租方', level: 'low', dimension: '管辖', evidence, legalUrl: 'x' }],
    [{ id: 'ai-risk-4', title: '争议管辖约定为甲方户籍所在地法院', level: 'medium', dimension: '管辖', evidence }],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'lease-unfavorable-jurisdiction')
})

test('same sentence with related dimensions (押金/违约责任) merges; unrelated dimensions survive', () => {
  // 用户实测复现：宠物违约没收押金条款——本地规则维度=违约责任，AI 维度=押金，
  // 证据逐字一致，属于同一风险的两种标签，应合并；而「同意入户(居住权) vs 没收押金(押金)」
  // 这种同句两类独立风险仍必须分开。
  const pet = '乙方不得饲养宠物，如有违反甲方有权立即解除合同并没收押金。'
  const merged = mergeFindings(
    [{ id: 'lease-pet-forfeiture-no-cure', title: '宠物违约直接没收押金', dimension: '违约责任', evidence: pet }],
    [{ id: 'ai-risk-3', title: '违反宠物禁养限设没收押金', dimension: '押金', evidence: pet }],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'lease-pet-forfeiture-no-cure')
})

test('AI findings inherit only matching local legal basis metadata', () => {
  assert.equal(typeof enrichFindingsWithLegalBasis, 'function')
  const result = enrichFindingsWithLegalBasis([
    { id: 'ai-rent', title: '单方调整租金', dimension: '租金', evidence: '甲方可单方调整租金。' },
    { id: 'ai-unmatched', title: '未匹配问题', dimension: '综合', evidence: '合同里没有这段内容。' },
  ], [
    {
      id: 'lease-unilateral-rent-adjustment',
      title: '租金单方调整',
      dimension: '租金',
      evidence: '甲方可单方调整租金。',
      legalBasis: '租金调整应有明确约定。',
      legalLaw: '民法典第七百零七条',
      legalUrl: 'https://example.test/law#:~:text=第七百零七条',
    },
  ])
  assert.equal(result[0].legalLaw, '民法典第七百零七条')
  assert.equal(result[0].legalUrl, 'https://example.test/law#:~:text=第七百零七条')
  assert.equal(result[0].legalBasis, '租金调整应有明确约定。')
  assert.equal(result[1].legalLaw, undefined)
  assert.equal(result[1].legalUrl, undefined)
})

let failures = 0
for (const { name, run } of tests) {
  try { run(); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`) }
}
if (failures) process.exitCode = 1
