// 快速复现 PDF 导入：只走到确认页，不跑 AI。顺便把 console/pageerror/失败请求全记下来。
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:8787'
const sample = path.resolve(
  process.argv[2] || '../deliverables/test-kits/contract-review-advanced-kit-20261009/02_隐蔽组合型_同文PDF.pdf',
)
if (!fs.existsSync(sample)) throw new Error(`缺样本：${sample}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const noise = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') noise.push(`[console.${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => noise.push(`[pageerror] ${e.message}`))
page.on('requestfailed', (r) => noise.push(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText}`))
page.on('response', (r) => {
  if (r.status() >= 400) noise.push(`[http ${r.status()}] ${r.url()}`)
})

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', sample)
  await page.waitForTimeout(2500)
  const state = await page.evaluate(() => ({
    hash: location.hash,
    body: document.body.innerText.replace(/\s+/g, ' ').slice(-700),
    hasCanvas: Boolean(document.querySelector('canvas.pdf-canvas')),
  }))
  console.log('样本:', path.basename(sample), fs.statSync(sample).size, 'bytes')
  console.log('状态:', JSON.stringify(state, null, 2))
  console.log('异常记录:', noise.length ? '\n  ' + noise.join('\n  ') : '无')
} finally {
  await browser.close()
}
