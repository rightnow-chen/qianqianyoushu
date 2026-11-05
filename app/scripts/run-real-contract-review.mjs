/**
 * 真实合同脱敏样本 → 跑审查 → 输出漏检/误报报告
 *
 * 用途：用真实（已脱敏）的租房合同样本，检验本地审查引擎在真实措辞下的
 * 召回质量（漏检）与误报情况，与「合成黄金集」形成互补。
 *
 * 与 contract-review-benchmark 的区别：
 * - 合成黄金集：虚构合同 + 标准答案，测「已知规则全召回」；
 * - 本脚本：真实合同 + 人工标注，测「真实措辞下的漏检 / 误报」。
 *
 * ## 样本目录约定（默认 real-contract-samples/）
 *
 * 每个样本由两个文件组成（标注文件可选）：
 *   <name>.txt           合同正文（必须已脱敏：去姓名/手机号/身份证/地址/账号）
 *   <name>.expect.json   人工标注（可选，缺省则该样本只做「结果展示」不参与判定）
 *      {
 *        "expect": ["lease-early-exit-stacked-penalty"],  // 应该被识别（漏检检测）
 *        "none":   ["lease-unilateral-rent-adjustment"],  // 不应误报（误报检测）
 *        "note":   "房东自拟合同，押金条款特别苛刻"
 *      }
 *
 * ## 用法
 *
 *   node scripts/run-real-contract-review.mjs [--dir=real-contract-samples] [--depth=strict] [--role=partyB]
 *
 * 输出：
 *   generated-reports/real-contract-review/report.md
 *   generated-reports/real-contract-review/report.json
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeContract, getRiskSummary } from '../src/features/contractReview.js'
import { reviewContractOcrText } from '../src/utils/contractOcrReview.js'

function readArg(name, fallback) {
  const prefix = `--${name}=`
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  return raw || fallback
}

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const samplesDir = path.resolve(rootDir, readArg('dir', 'real-contract-samples'))
const depth = readArg('depth', 'strict')
const role = readArg('role', 'partyB')

// 允许的标注 id 合集：来自引擎已知 risk id（用于提示标注里可能打错 id）
const KNOWN_RISK_IDS = new Set([
  // 租赁类主要风险（与 contract-review-benchmark-data.mjs 的 contractRiskScenarios 对齐）
  'lease-auto-renewal-rent-up', 'lease-termination-asymmetry', 'lease-unilateral-rent-adjustment',
  'lease-daily-late-fee-5-percent', 'lease-lockout-forfeiture', 'lease-deposit-return-delay',
  'lease-arbitrary-deposit-deduction', 'lease-all-maintenance-tenant', 'lease-landlord-entry-no-consent',
  'lease-sublet-share-overbroad', 'lease-early-exit-stacked-penalty', 'lease-annual-rent-prepayment',
  'lease-appliance-depreciation-deduction', 'lease-normal-use-fixed-penalty', 'lease-sale-terminates-tenancy',
  'lease-overbroad-exemption', 'lease-overdue-termination-forfeiture', 'lease-abandoned-property-disposal',
  'lease-format-clause-waiver', 'lease-unfavorable-jurisdiction', 'lease-excessive-holdover-rent',
  'lease-deposit-indefinite-hold', 'lease-safety-liability-waiver', 'lease-common-area-fee-transfer',
  'lease-landlord-loss-exclusion', 'lease-landlord-reserved-space', 'lease-rental-tax-transfer',
  'lease-sublet-extra-fee', 'lease-visitor-occupancy-fee', 'lease-pet-additional-penalty',
  'lease-self-help-utility-cutoff', 'lease-lien-on-tenant-property', 'lease-handwritten-overrides-printed',
  'lease-oral-overrides-written', 'lease-pet-forfeiture-no-cure', 'lease-maintenance-burden-of-proof',
])

function loadExpectation(txtPath) {
  const base = txtPath.replace(/\.(txt|md)$/i, '')
  for (const ext of ['expect.json', 'expected.json']) {
    const p = `${base}.${ext}`
    if (existsSync(p)) {
      try {
        const data = JSON.parse(readFileSync(p, 'utf8'))
        return {
          expect: Array.isArray(data.expect) ? data.expect : [],
          none: Array.isArray(data.none) ? data.none : [],
          note: data.note || '',
          source: path.basename(p),
        }
      } catch (err) {
        console.warn(`⚠️  标注文件解析失败（忽略）：${p} —— ${err.message}`)
        return null
      }
    }
  }
  return null
}

function collectSamples() {
  if (!existsSync(samplesDir)) {
    console.error(`✗ 样本目录不存在：${samplesDir}`)
    console.error('  请先创建目录，把脱敏后的真实合同以 .txt/.md 放入，并可选配 <同名>.expect.json 标注。')
    process.exit(1)
  }
  const files = readdirSync(samplesDir)
    .filter((name) => /\.(txt|md)$/i.test(name) && !/^readme\.md$/i.test(name))
    .sort()
  if (files.length === 0) {
    console.error(`✗ 样本目录为空：${samplesDir}`)
    process.exit(1)
  }
  return files.map((name) => path.join(samplesDir, name))
}

function runReview(text) {
  const findings = analyzeContract(text, { contractType: 'lease', partyRole: role, reviewDepth: depth })
  const summary = getRiskSummary(findings)
  const foundIds = findings.map((f) => f.id)
  return { findings, summary, foundIds }
}

function buildReport(samples) {
  const rows = []
  let totalExpected = 0
  let totalMissed = 0
  let totalFalsePositive = 0
  let annotatedCount = 0

  for (const txtPath of samples) {
    const name = path.basename(txtPath, path.extname(txtPath))
    const rawText = readFileSync(txtPath, 'utf8')
    const expectation = loadExpectation(txtPath)

    const ocr = reviewContractOcrText(rawText)
    const { findings, summary, foundIds } = runReview(rawText)

    const foundSet = new Set(foundIds)

    let missed = []
    let falsePositive = []
    if (expectation) {
      annotatedCount += 1
      missed = expectation.expect.filter((id) => !foundSet.has(id))
      falsePositive = expectation.none.filter((id) => foundSet.has(id))
      totalExpected += expectation.expect.length
      totalMissed += missed.length
      totalFalsePositive += falsePositive.length
    }

    rows.push({
      name,
      annotated: Boolean(expectation),
      note: expectation?.note || '',
      source: expectation?.source || null,
      ocr: { ok: ocr.ok, requiresManualCheck: ocr.requiresManualCheck, reasons: ocr.reasons },
      summary: {
        score: summary.score,
        label: summary.label,
        highCount: summary.highCount,
        mediumCount: summary.mediumCount,
        missingCount: summary.missingCount,
        consistencyCount: summary.consistencyCount,
        coverage: summary.coverage,
      },
      foundIds,
      missed,
      falsePositive,
      findings: findings.map((f) => ({
        id: f.id,
        title: f.title,
        level: f.level,
        evidence: f.evidence || '',
      })),
    })
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      samplesDir,
      depth,
      role,
      totalSamples: rows.length,
      annotatedCount,
      totalExpected,
      totalMissed,
      totalFalsePositive,
      recall: totalExpected ? `${totalExpected - totalMissed}/${totalExpected}` : 'N/A（无标注）',
      recallRate: totalExpected ? (((totalExpected - totalMissed) / totalExpected) * 100).toFixed(1) + '%' : 'N/A',
    },
    rows,
  }
}

function renderMarkdown(report) {
  const m = report.meta
  const lines = []
  lines.push('# 真实合同审查：漏检 / 误报报告')
  lines.push('')
  lines.push(`- 生成时间：${m.generatedAt}`)
  lines.push(`- 样本目录：\`${m.samplesDir}\``)
  lines.push(`- 审查参数：深度=\`${m.depth}\`，角色=\`${m.role}\``)
  lines.push(`- 样本数：${m.totalSamples}（标注 ${m.annotatedCount} 份）`)
  lines.push('')
  lines.push('## 总览')
  lines.push('')
  lines.push('| 指标 | 值 |')
  lines.push('|---|---|')
  lines.push(`| 期望风险数 | ${m.totalExpected} |`)
  lines.push(`| 命中 | ${m.totalExpected - m.totalMissed} |`)
  lines.push(`| 漏检 | ${m.totalMissed} |`)
  lines.push(`| 误报 | ${m.totalFalsePositive} |`)
  lines.push(`| 召回率 | ${m.recallRate} |`)
  lines.push('')
  lines.push('---')
  lines.push('')
  for (const row of report.rows) {
    lines.push(`## ${row.name}${row.annotated ? '' : '（未标注，仅展示）'}`)
    lines.push('')
    if (row.note) lines.push(`> 标注说明：${row.note}`)
    if (row.ocr.requiresManualCheck) lines.push(`> ⚠️ OCR 字段缺失需人工核对：${row.ocr.reasons.join('；')}`)
    lines.push('')
    lines.push(`- 风险评分：**${row.summary.score}**（${row.summary.label}）`)
    lines.push(`- 高风险 ${row.summary.highCount} · 中风险 ${row.summary.mediumCount} · 缺失提示 ${row.summary.missingCount} · 一致性提示 ${row.summary.consistencyCount}`)
    if (row.summary.coverage) lines.push(`- 审查覆盖率：${row.summary.coverage.percent}%`)
    lines.push('')

    if (row.annotated) {
      if (row.missed.length === 0 && row.falsePositive.length === 0) {
        lines.push('✅ 无漏检、无误报')
      } else {
        if (row.missed.length) {
          lines.push(`### 🔴 漏检（${row.missed.length}）`)
          for (const id of row.missed) lines.push(`- \`${id}\``)
          lines.push('')
        }
        if (row.falsePositive.length) {
          lines.push(`### 🟡 误报（${row.falsePositive.length}）`)
          for (const id of row.falsePositive) lines.push(`- \`${id}\``)
          lines.push('')
        }
      }
    }

    lines.push(`### 实际召回（${row.foundIds.length}）`)
    lines.push('')
    if (row.findings.length === 0) {
      lines.push('（未召回任何风险）')
    } else {
      lines.push('| 等级 | 风险 | 证据片段 |')
      lines.push('|---|---|---|')
      for (const f of row.findings) {
        const evidence = (f.evidence || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 80)
        lines.push(`| ${f.level} | ${f.title}（\`${f.id}\`） | ${evidence} |`)
      }
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  return lines.join('\n')
}

// ── main ──────────────────────────────────────────────────────────────────
const samples = collectSamples()
const report = buildReport(samples)

const outDir = path.join(rootDir, 'generated-reports', 'real-contract-review')
mkdirSync(outDir, { recursive: true })
const mdPath = path.join(outDir, 'report.md')
const jsonPath = path.join(outDir, 'report.json')
writeFileSync(mdPath, renderMarkdown(report), 'utf8')
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

const m = report.meta
console.log('✓ 真实合同审查报告已生成')
console.log(`  样本：${m.totalSamples} 份（标注 ${m.annotatedCount} 份）`)
console.log(`  期望 ${m.totalExpected} · 命中 ${m.totalExpected - m.totalMissed} · 漏检 ${m.totalMissed} · 误报 ${m.totalFalsePositive}`)
if (m.totalExpected) console.log(`  召回率：${m.recallRate}`)
console.log(`  报告：${mdPath}`)
console.log(`  数据：${jsonPath}`)

if (m.totalMissed > 0 || m.totalFalsePositive > 0) {
  console.log('\n⚠️  存在漏检或误报，请查看报告详情，并把真实失败样本补进黄金集：')
  console.log('  1) 保留合同原文（继续脱敏）')
  console.log('  2) 标注风险 id + 期望是否报警')
  console.log('  3) 通过后再加入 scripts/contract-review-benchmark-data.mjs')
}
