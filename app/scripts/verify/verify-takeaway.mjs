import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'scripts/verify/out')
fs.mkdirSync(OUT, { recursive: true })
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }

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
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()) })

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

// 标记谈判状态：前两个风险点标记为已谈妥，让要点卡出现「战果」区
const findingCount = await page.locator('.finding').count()
for (let i = 0; i < 2 && i < findingCount; i += 1) {
  await page.locator('.finding').nth(i).locator('.finding-summary').click()
  await page.waitForTimeout(200)
  await page.locator('.finding').nth(i).locator('.state-tab', { hasText: '已谈妥' }).click()
  await page.waitForTimeout(200)
}

// 产物条断言 + 截图
const strip = page.locator('.takeaway-strip')
const stripVisible = await strip.isVisible()
const stripCards = await page.locator('.takeaway-card').count()
const stripIntro = stripVisible ? await strip.locator('.takeaway-intro strong').innerText() : ''
await strip.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await page.screenshot({ path: path.join(OUT, 'shot-takeaway.png') })

// 批注版合同预览
await page.locator('.takeaway-card').first().click()
await page.waitForSelector('.paper-annotated', { timeout: 5000 })
await page.waitForTimeout(600)
const annoMarks = await page.locator('.paper-annotated .ap-mark').count()
const annoBlocks = await page.locator('.paper-annotated .anno-block').count()
const annoBadges = await page.locator('.paper-annotated .ap-badge').count()
const annoNote = await page.locator('.paper-annotated .paper-note').innerText().catch(() => '')
await page.screenshot({ path: path.join(OUT, 'shot-annotated.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const overlayClosed = (await page.locator('.artifact-overlay').count()) === 0

// 谈判要点卡预览
await page.locator('.takeaway-card').nth(1).click()
await page.waitForSelector('.paper-card', { timeout: 5000 })
await page.waitForTimeout(400)
const cardItems = await page.locator('.paper-card .card-item').count()
const cardDone = await page.locator('.paper-card .card-done').count()
const cardDoneRows = cardDone ? await page.locator('.paper-card .card-done p').count() : 0
const cardChips = await page.locator('.paper-card .chip').count()
await page.screenshot({ path: path.join(OUT, 'shot-card.png') })

// 打印样式：只有纸面可见
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(400)
const printTopbarHidden = await page.locator('.artifact-topbar').isHidden().catch(() => true)
const printPaperVisible = await page.locator('.paper-card').isVisible()
await page.screenshot({ path: path.join(OUT, 'shot-print.png') })
await page.emulateMedia({ media: null })

console.log(JSON.stringify({
  findingCount,
  stripVisible,
  stripCards,
  stripIntro,
  annoMarks,
  annoBlocks,
  annoBadges,
  annoNoteLen: annoNote.length,
  overlayClosed,
  cardItems,
  cardDone,
  cardDoneRows,
  cardChips,
  printTopbarHidden,
  printPaperVisible,
  errors: errors.slice(0, 5),
}))
await browser.close()
server.close()
