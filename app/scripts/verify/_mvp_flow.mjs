// MVP v0.1 界面走查：起一个静态服务器，逐屏截图并收集控制台报错。
// 用法：node scripts/verify/_mvp_flow.mjs
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../../dist')
const outDir = path.resolve(here, 'out/mvp')
fs.mkdirSync(outDir, { recursive: true })

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  let filePath = path.join(dist, url === '/' ? 'index.html' : url)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(dist, 'index.html')
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})

const PORT = 4199
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

const browser = await chromium.launch()
const errors = []

async function shoot(name, hash, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport })
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${name}] console: ${msg.text()}`)
  })
  page.on('pageerror', (err) => errors.push(`[${name}] pageerror: ${err.message}`))
  await page.goto(`http://127.0.0.1:${PORT}/${hash}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false })
  await page.close()
}

await shoot('01-landing', '')
await shoot('02-upload', '#upload')
await shoot('03-confirm', '#confirm')
await shoot('04-work-ov', '#work?tab=ov')
await shoot('05-work-risk', '#work?tab=risk&active=r1')
await shoot('06-work-fix', '#work?tab=fix&active=r1')
await shoot('07-work-say', '#work?tab=say&active=r1')
await shoot('08-work-check', '#work?tab=check')
await shoot('09-mobile-landing', '', { width: 390, height: 844 })
await shoot('10-mobile-work', '#work?tab=ov', { width: 390, height: 844 })

await browser.close()
server.close()

console.log(errors.length ? `发现 ${errors.length} 个报错：\n${errors.join('\n')}` : '没有控制台报错')
console.log('截图输出：', outDir)
