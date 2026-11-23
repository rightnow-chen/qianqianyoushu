// 真后端 + 真合同 + 真浏览器：验证「规则先出、AI 补盲区」这条链路在页面上真的生效。
// 不是断言规则条数，而是断言「AI 结果回来之后，页面上的风险条数确实变了」。
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:8787'
const pdfSample = path.resolve('../deliverables/test-kits/contract-review-advanced-kit-20261009/02_隐蔽组合型_同文PDF.pdf')
if (!fs.existsSync(pdfSample)) throw new Error(`缺样本：${pdfSample}`)

const shotDir = path.resolve('screenshots/ai-review')
fs.mkdirSync(shotDir, { recursive: true })

const readState = async (page) => page.evaluate(() => {
  const counts = Array.from(document.querySelectorAll('.sum-hd .c')).map((el) => parseInt(el.innerText, 10) || 0)
  const totalMatch = document.body.innerText.match(/(\d+)\s*条风险/)
  const bannerTexts = Array.from(document.querySelectorAll('.banner')).map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  const titles = Array.from(document.querySelectorAll('.risk-card .rt, .risk-row .rt, .rc-t')).map((el) => el.innerText.trim())
  return {
    counts,
    total: totalMatch ? Number(totalMatch[1]) : null,
    banners: bannerTexts,
    titles: titles.slice(0, 10),
    body: document.body.innerText.slice(0, 400),
  }
})

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const failures = []

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', pdfSample)
  await page.waitForFunction(() => location.hash.includes('upload'), null, { timeout: 40000 })
  await page.locator('button.btn.primary').first().click()
  await page.waitForSelector('canvas.pdf-canvas', { timeout: 20000 })
  await page.locator('button', { hasText: '开始审查' }).first().click()
  await page.waitForFunction(() => location.hash.startsWith('#work'), null, { timeout: 45000 })
  await page.waitForTimeout(800)

  const atArrival = await readState(page)
  await page.screenshot({ path: path.join(shotDir, '1-规则先出.png') })
  console.log('【规则刚出结果】', JSON.stringify(atArrival, null, 2))

  // 等 AI 那一路结束：要么「AI 正在逐条核对原文」消失，要么超时
  const settled = await page
    .waitForFunction(
      () => !document.body.innerText.includes('AI 正在逐条核对原文'),
      null,
      { timeout: 150_000, polling: 500 },
    )
    .then(() => true)
    .catch(() => false)

  await page.waitForTimeout(600)
  const afterAi = await readState(page)
  await page.screenshot({ path: path.join(shotDir, '2-AI补完.png') })
  console.log('【AI 那一路结束后】', JSON.stringify(afterAi, null, 2))

  if (!settled) failures.push('AI 那一路 150 秒内没有结束')
  if (afterAi.banners.some((text) => text.includes('AI 深度审查没跑完'))) {
    failures.push('AI 审查失败，界面已降级回规则结果 —— 看下面 banners 的原因')
  }
  if (afterAi.total === atArrival.total) {
    failures.push(`AI 结束后风险条数没变（${atArrival.total} → ${afterAi.total}），可能没合并进结果`)
  }

  console.log('')
  console.log(`规则结果 ${atArrival.total} 条 → AI 合并后 ${afterAi.total} 条`)

  // AI 生成的标题是整句机制描述，比规则库长得多，容易把三列撑破屏幕。
  const overflow = await page.evaluate(() => {
    const pane = document.querySelector('.pane')
    const sum = document.querySelector('.sum3')
    return {
      pane: pane ? pane.scrollWidth - pane.clientWidth : 0,
      sum3: sum ? sum.scrollWidth - sum.clientWidth : 0,
    }
  })
  if (overflow.pane > 1 || overflow.sum3 > 1) {
    failures.push(`结果页出现横向溢出：pane ${overflow.pane}px / sum3 ${overflow.sum3}px`)
  }
  if (failures.length) {
    console.log('未通过：')
    failures.forEach((item) => console.log(' -', item))
    process.exitCode = 1
  } else {
    console.log('通过：AI 结果已合并进结果页')
    console.log('截图：', shotDir)
  }
} finally {
  await browser.close()
}
