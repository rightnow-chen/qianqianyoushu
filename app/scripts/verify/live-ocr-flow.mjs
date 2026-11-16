// 用真后端（默认 8787）走一遍拍照上传：OCR → 确认六字段 → 结果页，每步截图。
// 用法：先 npm start（另开一个终端），再 node scripts/verify/live-ocr-flow.mjs <图片> [前缀]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const target = process.argv[2]
const prefix = process.argv[3] || path.join(here, '../../.tmp-live')

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 940 } })).newPage()
const problems = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`)
})

const report = {}
try {
  await page.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', target)
  await page.waitForFunction(() => location.hash.includes('upload'), null, { timeout: 120000 })
  await page.waitForTimeout(1200)
  report.quality = (await page.locator('body').innerText()).slice(0, 260)
  await page.screenshot({ path: `${prefix}-1-quality.png` })

  await page.locator('button.btn.primary').first().click()
  await page.waitForTimeout(1500)
  report.confirm = await page.evaluate(() =>
    [...document.querySelectorAll('.field')].map((f) => {
      const input = f.querySelector('input')
      const select = f.querySelector('select')
      return `${f.querySelector('.k')?.textContent || ''}=${input ? input.value : select ? select.value : ''}`
    }),
  )
  await page.screenshot({ path: `${prefix}-2-confirm.png` })

  await page.locator('button.btn.primary').last().click()
  await page.waitForFunction(() => location.hash.includes('work'), null, { timeout: 120000 })
  await page.waitForSelector('.docpane .paper .page', { timeout: 60000 })
  await page.waitForTimeout(1200)
  report.pane = await page.evaluate(() => ({
    label: document.querySelector('.docpane .doc-tools .m')?.textContent?.trim(),
    pages: document.querySelectorAll('.paper .page').length,
    marks: document.querySelectorAll('.paper .sn').length,
    images: document.querySelectorAll('.docpane img').length,
    risks: document.querySelectorAll('.risk-card').length,
  }))
  await page.screenshot({ path: `${prefix}-3-work.png` })
  console.log(JSON.stringify({ report, problems }, null, 2))
} catch (error) {
  console.error('失败：', error.message)
  console.error(problems.join('\n'))
  await page.screenshot({ path: `${prefix}-fail.png` }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
