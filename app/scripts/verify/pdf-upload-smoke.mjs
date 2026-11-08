// 一次性冒烟：验证 PDF 能不能真的上传解析（不是点一下就报错）。
// 用法：node scripts/verify/pdf-upload-smoke.mjs
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../../dist')
const sample = path.resolve(here, '../../public/dataset/rental-contracts/qhd-2025-rental-contract.pdf')

if (!fs.existsSync(sample)) throw new Error(`缺样本：${sample}`)
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('先 npm run build')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.bcmap': 'application/octet-stream',
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  let file = path.join(dist, url === '/' ? 'index.html' : url)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

const PORT = 4322
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
const BASE = `http://127.0.0.1:${PORT}`

const browser = await chromium.launch()
const page = await browser.newPage()

// 关键：把 Uint8Array.prototype.toHex 删掉，模拟未实现该方法的旧版浏览器
// （Chrome/Edge < 133）。用户的报错就出现在这种环境里。
await page.addInitScript(() => {
  delete Uint8Array.prototype.toHex
  delete Uint8Array.prototype.fromHex
})

const consoleErrors = []
const pageErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (error) => pageErrors.push(error.message))

await page.goto(`${BASE}/#landing`, { waitUntil: 'load' })
await page.waitForTimeout(400)

await page.setInputFiles('input[type="file"]', sample)

// 等到出现「已读出」提示，或等到错误 toast 出现，最多 60s
const deadline = Date.now() + 60_000
let outcome = 'timeout'
let toastText = ''
while (Date.now() < deadline) {
  const toast = await page.locator('.toast, [role="status"]').first().textContent().catch(() => '')
  if (toast && /已读出|没能读|识别|失败|无法/.test(toast)) {
    toastText = toast.trim()
    outcome = /已读出/.test(toast) ? 'ok' : 'error'
    break
  }
  await page.waitForTimeout(400)
}

const bodyText = await page.locator('body').innerText().catch(() => '')

console.log('--- 结果 ---')
console.log('outcome:', outcome)
console.log('toast:', toastText)
console.log('页面是否还有「把合同文件拖到这里」:', bodyText.includes('把合同文件拖到这里'))
if (pageErrors.length) console.log('pageerror:', pageErrors)
if (consoleErrors.length) console.log('console.error:', consoleErrors.slice(0, 5))

await browser.close()
server.close()

process.exit(outcome === 'ok' ? 0 : 1)
