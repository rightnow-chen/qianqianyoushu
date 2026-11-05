import { contractReviewPlaybookCases } from '../src/data/contractReviewPlaybookCases.js'
import { analyzeContract } from '../src/features/contractReview.js'

const results = []
for (const [playbookId, cases] of Object.entries(contractReviewPlaybookCases)) {
  for (const item of cases) {
    const findings = analyzeContract(item.text, {
      contractType: 'lease',
      partyRole: 'partyB',
      reviewDepth: 'strict',
    })
    const matched = findings.some((finding) => finding.playbookId === playbookId)
    const passed = item.expected === 'report'
      ? matched
      : item.expected === 'do_not_report'
        ? !matched
        : true
    results.push({ ...item, matched, passed })
  }
}

const deterministic = results.filter((item) => item.expected !== 'manual_review')
const passed = deterministic.filter((item) => item.passed).length
const manualReview = results.filter((item) => item.expected === 'manual_review').length

for (const item of results) {
  const status = item.expected === 'manual_review' ? 'MANUAL' : item.passed ? 'PASS' : 'FAIL'
  console.log(`${status} ${item.id} expected=${item.expected} matched=${item.matched}`)
}

console.log(`Playbook evaluation: ${passed}/${deterministic.length} deterministic cases passed; ${manualReview} cases reserved for manual review`)
if (passed !== deterministic.length) process.exitCode = 1
