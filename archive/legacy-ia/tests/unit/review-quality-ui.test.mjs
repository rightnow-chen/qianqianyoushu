import assert from 'node:assert/strict'
import { getReviewQualityItems, getReviewQualityGate } from '../../src/features/reviewQualityUi.js'
import { getRiskSummary } from '../../src/features/contractReview.js'

const items = getReviewQualityItems({
  conflicts: [{ key: '月租金', values: ['3200元', '3500元'], clauseIds: ['clause-2-租金', 'clause-3-附件'] }],
  qualityWarnings: [
    { type: 'ocr_suspect', message: '文本包含疑似 OCR 替换字符' },
    { type: 'table_misaligned', message: '表格列数不一致' },
  ],
})

assert.equal(items.length, 3)
assert.deepEqual(items[0], {
  type: 'conflict',
  label: '事实冲突',
  title: '月租金存在多个版本',
  message: '3200元 vs 3500元；请回看正文、附件和最终签署版本。',
  severity: 'warning',
})
assert.equal(items[1].label, 'OCR 质量')
assert.equal(items[2].label, '表格质量')
assert.deepEqual(getReviewQualityGate({ conflicts: [{ key: '月租金' }], qualityWarnings: [] }), {
  blocked: true,
  label: '需人工复核',
  tone: 'warning',
  advice: '合同中存在事实冲突或输入质量问题，先回看原文、附件或签署版本，再判断风险分。',
})
assert.equal(getReviewQualityGate({ conflicts: [], qualityWarnings: [] }).blocked, false)
const gatedSummary = getRiskSummary([], null, getReviewQualityGate({ conflicts: [{ key: '押金' }], qualityWarnings: [] }))
assert.equal(gatedSummary.score, null)
assert.equal(gatedSummary.label, '需人工复核')
assert.equal(gatedSummary.incomplete, true)
assert.deepEqual(getReviewQualityItems({ conflicts: [], qualityWarnings: [] }), [])

console.log('review-quality-ui passed: conflict and input quality states')
