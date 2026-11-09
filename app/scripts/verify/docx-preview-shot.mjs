// Word 原件预览的视觉验收：上传一个真 docx，把确认页左侧截下来。
// 用法：node scripts/verify/docx-preview-shot.mjs <path-to.docx> [out.png]
// 前置：先 npm run build。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../../dist')
const target = path.resolve(process.argv[2] || '')
const out = path.resolve(process.argv[3] || path.join(here, '../../.tmp-docx-preview.png'))

if (!target || !fs.existsSync(target)) {
  console.error('传一个存在的 .docx 文件路径')
  process.exit(1)
}
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('先跑 npm run build')
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

const PORT = 4313
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

const browser = await chromium.launch()
const width = Number(process.env.VP_WIDTH || 1440)
const page = await (await browser.newContext({ viewport: { width, height: 940 } })).newPage()
const problems = []
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text().slice(0, 300)}`)
})

try {
  await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', target)
  await page.waitForSelector('button.btn.primary', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.locator('button.btn.primary').first().click()

  await page.waitForSelector('.docx-host section.docx', { timeout: 30000 })
  // 等缩放算完（renderDocx 之后才有 zoom）再截图
  await page.waitForTimeout(1500)

  // 验证缩放：真机上窗口一窄，左栏就会小于 A4 页面宽度
  if (process.env.FORCE_PREVIEW_WIDTH) {
    await page.evaluate((w) => {
      document.querySelector('.preview').style.maxWidth = `${w}px`
    }, Number(process.env.FORCE_PREVIEW_WIDTH))
    await page.waitForTimeout(800)
  }

  const stats = await page.evaluate(() => {
    const host = document.querySelector('.docx-host')
    const pages = [...document.querySelectorAll('.docx-host section.docx')]
    const first = pages[0]
    return {
      pageCount: pages.length,
      hostWidth: host?.clientWidth,
      scrollHeight: host?.scrollHeight,
      firstPageWidth: first?.offsetWidth,
      zoom: document.querySelector('.docx-host .docx-wrapper')?.style.zoom || '1',
      note: document.querySelector('.preview-note')?.textContent,
      heading: document.querySelector('.preview-hd span')?.textContent,
      pager: document.querySelector('.docx-preview .pdf-pager')?.textContent || '(单页，无翻页)',
      overflowX: host ? host.scrollWidth > host.clientWidth + 1 : false,
    }
  })

  await page.locator('.preview').screenshot({ path: out })
  console.log(JSON.stringify({ stats, problems, shot: out }, null, 2))
} catch (error) {
  console.error('验收失败：', error.message)
  console.error(problems.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
