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

await page.goto(`http://127.0.0.1:${port}/?module=proposal`, { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1200)

// 点击「看一个真实案例」→ 填充预算 2500 / 月租 3200 超支场景并跳转签约建议页
await page.locator('.proposal-secondary-action', { hasText: '看一个真实案例' }).click()
await page.waitForSelector('.decision-result', { timeout: 15000 })
await page.waitForTimeout(1200)

const result = {}

// 1. 结论卡
result.verdictTitle = await page.locator('.decision-verdict h3').innerText().catch(() => '')
result.verdictSubtitle = await page.locator('.decision-verdict p').innerText().catch(() => '')

// 2. 已删除「主要原因」块
result.reasonsBlockCount = await page.locator('.decision-reasons').count()

// 3. 费用测算上移 + 超支时默认展开（位于条件核对之后）
result.fitsCount = await page.locator('.decision-fits-compact .decision-fit-pill').count()
result.costBreakdownCount = await page.locator('details.decision-ref').count()
result.costExpandedCount = await page.locator('details.decision-ref[open]').count()
// 条件核对与费用测算在 DOM 中的先后：费用测算应在 fits 之后
const order = await page.evaluate(() => {
  const fits = document.querySelector('.decision-fits-compact')
  const cost = document.querySelector('details.decision-ref')
  if (!fits || !cost) return null
  return fits.compareDocumentPosition(cost) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before'
})
result.costAfterFits = order
result.costSummaryText = await page.locator('details.decision-ref summary em').innerText().catch(() => '')

// 4. 谈判进展进度条已删除，改为增量提示
result.trackCount = await page.locator('.decision-negotiation-track').count()
result.negotiationNote = await page.locator('.decision-negotiation-progress p').innerText().catch(() => '')

// 5. 顶栏状态卡显示结论而非风险计数
result.topbarState = await page.locator('.module-status-card strong').innerText().catch(() => '')
result.topbarStage = await page.locator('.module-status-card span').first().innerText().catch(() => '')

// 截图
await page.locator('.decision-result').scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, 'shot-decision.png'), fullPage: false })

result.errors = errors.slice(0, 5)
console.log(JSON.stringify(result, null, 2))

await browser.close()
server.close()
