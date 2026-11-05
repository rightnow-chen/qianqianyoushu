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
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('404') && !m.text().includes('Failed to load resource')) errors.push(m.text()) })

await page.goto(`http://127.0.0.1:${port}/?module=contract`, { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1500)

// 1) 侧边栏进入谈判台
await page.locator('.nav-list button', { hasText: '谈判台' }).click()
await page.waitForSelector('.negotiation-desk', { timeout: 10000 })
await page.waitForTimeout(600)

const panels = await page.locator('.desk-list-panel, .desk-chat-panel, .desk-clause-panel').count()
const itemCount = await page.locator('.desk-item').count()
const activeCount = await page.locator('.desk-item.active').count()
const progressText = await page.locator('.desk-progress').innerText()
const chatTitle = await page.locator('.desk-chat-topic').innerText()
const introScript = await page.locator('.desk-intro-script').count()
console.log(JSON.stringify({ panels, itemCount, activeCount, progressText, chatTitle, introScript }))

// 2) 快捷提问触发军师对话（测试环境无后端 → 回落离线预案）
await page.locator('.desk-quick button', { hasText: '生成开场话术' }).click()
await page.waitForSelector('.desk-msg.advisor', { timeout: 20000 })
await page.waitForTimeout(400)
const advisorMsgs1 = await page.locator('.desk-msg.advisor').count()
const advisorText1 = await page.locator('.desk-msg.advisor .desk-msg-bubble p').first().innerText()
const offlineChip = await page.locator('.desk-msg .desk-offline-chip').count()
const copyBtns = await page.locator('.desk-copy').count()
console.log(JSON.stringify({ advisorMsgs1, advisorHead: advisorText1.slice(0, 24), offlineChip, copyBtns }))

// 3) 输入房东回应再发一轮
await page.locator('.desk-input input').fill('房东说押金都是这么收的，嫌多可以不租')
await page.locator('.desk-send').click()
await page.waitForTimeout(1500)
const userMsgs = await page.locator('.desk-msg.user').count()
const advisorMsgs2 = await page.locator('.desk-msg.advisor').count()
console.log(JSON.stringify({ userMsgs, advisorMsgs2 }))
await page.screenshot({ path: path.join(OUT, 'shot-desk-chat.png') })

// 4) 右栏三态记录器：标记已谈妥
await page.locator('.desk-clause-panel .state-tab', { hasText: '已谈妥' }).click()
await page.waitForTimeout(400)
const progressAfter = await page.locator('.desk-progress').innerText()
const resolvedChip = await page.locator('.desk-item .state-chip.resolved').count()
const applyText = await page.locator('.desk-apply').innerText()
console.log(JSON.stringify({ progressAfter, resolvedChip, applyText }))

// 5) 深链：回审合同 → 展开第二张卡 → 问军师 → 谈判台对应条目 active
await page.locator('.nav-list button', { hasText: '审合同' }).click()
await page.waitForTimeout(600)
const cardTitle = await page.locator('.finding').nth(1).locator('.finding-title').innerText()
await page.locator('.finding').nth(1).locator('.finding-summary').click()
await page.waitForTimeout(300)
await page.locator('.finding').nth(1).locator('.advisor-chip').click()
await page.waitForSelector('.negotiation-desk', { timeout: 10000 })
await page.waitForTimeout(600)
const deepActiveTitle = await page.locator('.desk-item.active .desk-item-title').innerText()
console.log(JSON.stringify({ cardTitle: cardTitle.trim(), deepActiveTitle: deepActiveTitle.trim(), deepLinked: cardTitle.trim() === deepActiveTitle.trim() }))
await page.screenshot({ path: path.join(OUT, 'shot-desk-deeplink.png') })

// 6) 会话持久化包含 negotiationChats
const session = await page.evaluate(() => {
  const raw = localStorage.getItem('signahead-negotiation-session')
  return raw ? Object.keys(JSON.parse(raw)) : []
})
console.log(JSON.stringify({ sessionKeys: session, hasChats: session.includes('negotiationChats'), pageErrors: errors }))

await browser.close()
server.close()

const ok = panels === 3 && itemCount > 0 && activeCount === 1 && advisorMsgs1 >= 1 && offlineChip >= 1 && copyBtns >= 1 && userMsgs >= 1 && resolvedChip === 1 && errors.length === 0
console.log(ok ? 'PASS: 谈判台全链路验证通过' : 'FAIL')
process.exit(ok ? 0 : 1)
