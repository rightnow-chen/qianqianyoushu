import assert from 'node:assert/strict'
import { buildReviewAuditSummary } from '../src/features/reviewAudit.js'

const report = buildReviewAuditSummary({
  facts: {
    clauses: [{}, {}, {}],
    amounts: [{}, {}],
    dates: [{}],
    terms: [{}, {}],
    references: [{}],
    definitions: [{}],
    attachments: [{}],
    tables: [{}],
    conflicts: [{ key: '月租金' }],
    qualityWarnings: [{ type: 'ocr_suspect' }],
  },
  findings: [
    { verificationStatus: 'verified' },
    { verificationStatus: 'partial' },
  ],
  qualityGate: { blocked: true, label: '需人工复核' },
  qualityItems: [{ type: 'conflict' }, { type: 'ocr_suspect' }],
})

assert.equal(report.status, '需人工复核')
assert.deepEqual(report.facts, { clauses: 3, amounts: 2, dates: 1, terms: 2, references: 1, definitions: 1, attachments: 1, tables: 1 })
assert.deepEqual(report.evidence, { verified: 1, partial: 1 })
assert.deepEqual(report.quality, { signals: 2, conflicts: 1, warnings: 1 })
assert.match(report.nextAction, /回看原文、附件或签署版本/)

console.log('review-audit passed: structured quality summary')
