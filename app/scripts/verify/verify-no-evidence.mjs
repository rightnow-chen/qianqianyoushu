import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'scripts/verify/out')
fs.mkdirSync(OUT, { recursive: true })
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  const file = path.join(DIST, p)
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('404')) errors.push(m.text()) })

await page.goto(`http://127.0.0.1:${port}/?module=contract`, { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1500)

let alreadyReview = (await page.locator('.contract-review-panel').count()) > 0
if (!alreadyReview) {
  await page.locator('.demo-contract-list button').first().click()
  await page.waitForTimeout(400)
  await page.locator('.input-actions .primary-button').click()
  await page.waitForSelector('.contract-review-panel', { timeout: 15000 })
}
await page.waitForTimeout(1000)

// 展开第一张风险卡
await page.locator('.finding').first().locator('.finding-summary').click()
await page.waitForTimeout(400)

const card = page.locator('.finding').first()
const chipTexts = await card.locator('.finding-toggle').allInnerTexts()
const evidenceChips = chipTexts.filter((t) => t.includes('证据片段'))
const evidenceBlocks = await card.locator('.finding-evidence').count()
const locateBtn = await card.locator('.finding-locate').count()
const talkChips = chipTexts.filter((t) => t.includes('谈判话术')).length
const lawChips = chipTexts.filter((t) => t.includes('依据')).length
const explainVisible = (await card.locator('p').first().innerText()).length > 0

console.log(JSON.stringify({
  chipTexts,
  evidenceChips: evidenceChips.length,
  evidenceBlocks,
  locateBtn,
  talkChips,
  lawChips,
  explainVisible,
  pageErrors: errors,
}, null, 2))

await card.scrollIntoViewIfNeeded()
await page.screenshot({ path: path.join(OUT, 'shot-no-evidence.png') })

await browser.close()
server.close()

const ok = evidenceChips.length === 0 && evidenceBlocks === 0 && locateBtn >= 1 && talkChips >= 1 && errors.length === 0
console.log(ok ? 'PASS: 证据片段已移除，定位原文/谈判话术保留' : 'FAIL')
process.exit(ok ? 0 : 1)
