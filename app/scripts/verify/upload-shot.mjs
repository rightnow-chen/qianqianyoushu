// 任意合同文件的完整走查：上传 → 质检 → 确认 → 审查，每一步都截图 + 打印正文。
// 用法：node scripts/verify/upload-shot.mjs <file> [outPrefix]
// 前置：先 npm run build。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../../dist')
const target = path.resolve(process.argv[2] || '')
const prefix = process.argv[3] || path.join(here, '../../.tmp-upload')

if (!target || !fs.existsSync(target)) {
  console.error('传一个存在的合同文件路径')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  let file = path.join(dist, url === '/' ? 'index.html' : url)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

const PORT = 4314
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 940 } })).newPage()
const problems = []
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text().slice(0, 300)}`)
})

const report = {}
try {
  await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', target)

  const gotUpload = await page
    .waitForFunction(() => location.hash.includes('upload'), null, { timeout: 40000 })
    .then(() => true)
    .catch(() => false)
  report.hash = await page.evaluate(() => location.hash)
  if (!gotUpload) {
    report.stage = 'upload-failed'
    report.toast = await page.locator('.toast').innerText().catch(() => '(无 toast)')
    await page.screenshot({ path: `${prefix}-upload-failed.png` })
    console.log(JSON.stringify({ report, problems }, null, 2))
  } else {
    await page.waitForTimeout(800)
    report.upload = await page.locator('body').innerText()
    await page.screenshot({ path: `${prefix}-1-upload.png` })

    await page.locator('button.btn.primary').first().click()
    await page.waitForTimeout(1500)
    report.confirmPreview = await page.locator('.preview').innerText()
    report.confirmFields = await page.evaluate(() =>
      [...document.querySelectorAll('.field')].map((field) => {
        const input = field.querySelector('input')
        const select = field.querySelector('select')
        const label = field.querySelector('.k')?.textContent || ''
        return `${label}=${input ? input.value : select ? select.value : ''}`
      }),
    )
    await page.screenshot({ path: `${prefix}-2-confirm.png` })

    await page.locator('button.btn.primary').last().click()
    await page.waitForFunction(() => location.hash.includes('work'), null, { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(2500)
    report.work = await page.locator('body').innerText()
    // 左栏到底显示的是什么：原件页数、文字层节点数、高亮登记了几段
    report.pane = await page.evaluate(() => {
      const pane = document.querySelector('.docpane')
      const hl = {}
      ;['risk-must', 'risk-check', 'risk-note', 'risk-active'].forEach((name) => {
        const entry = globalThis.CSS?.highlights?.get(name)
        hl[name] = entry ? entry.size : -1
      })
      const first = globalThis.CSS?.highlights?.get('risk-must')
      const range = first ? [...first][0] : null
      const rect = range?.getBoundingClientRect()
      return {
        hasHighlightApi: typeof globalThis.Highlight === 'function' && typeof globalThis.CSS?.highlights?.set === 'function',
        paneClass: pane?.className || '(无左栏)',
        origPages: document.querySelectorAll('.orig-page').length,
        docxSections: document.querySelectorAll('.orig-host section.docx').length,
        textSpans: document.querySelectorAll('.orig-page .textLayer span').length,
        papers: document.querySelectorAll('.paper .page').length,
        highlights: hl,
        firstRange: range
          ? {
              connected: document.contains(range.startContainer),
              rect: rect ? `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}` : '空',
              text: range.toString().slice(0, 40),
            }
          : null,
      }
    })
    await page.screenshot({ path: `${prefix}-3-work.png`, fullPage: false })
    await page.locator('.docpane').screenshot({ path: `${prefix}-4-pane.png` }).catch(() => {})
    console.log(JSON.stringify({ report, problems }, null, 2))
  }
} catch (error) {
  console.error('走查失败：', error.message)
  console.error(problems.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
