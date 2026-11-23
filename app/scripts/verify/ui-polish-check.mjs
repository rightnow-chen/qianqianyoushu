// 真后端 + 真浏览器：验收本轮四处界面改动。
// 1) 风险卡片宽度是否一致  2) 修改页不再有「同属…的还有」  3) 「修改」页签不再挂数字
// 4) 概览「最坏合计」算不出来时整块不出现（不写「待补」）  5) AI 跑的时候不再摆整块空状态
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:8787'
const pdfSample = path.resolve('../deliverables/test-kits/contract-review-advanced-kit-20261009/02_隐蔽组合型_同文PDF.pdf')
if (!fs.existsSync(pdfSample)) throw new Error(`缺样本：${pdfSample}`)

const shotDir = path.resolve('screenshots/ui-polish')
fs.mkdirSync(shotDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const failures = []
const log = (...args) => console.log(...args)

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', pdfSample)
  await page.waitForFunction(() => location.hash.includes('upload'), null, { timeout: 40000 })
  await page.locator('button.btn.primary').first().click()
  await page.waitForSelector('canvas.pdf-canvas', { timeout: 20000 })
  await page.locator('button', { hasText: '开始审查' }).first().click()
  await page.waitForFunction(() => location.hash.startsWith('#work'), null, { timeout: 45000 })
  await page.waitForTimeout(500)

  // —— 5) AI 还在跑的时候，不应出现整块空状态
  const running = await page.evaluate(() => ({
    hasBigEmpty: Boolean(document.querySelector('.empty-state')),
    hasLightWait: Boolean(document.querySelector('.ai-wait')),
    body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
  }))
  log('【AI 运行中】大空状态:', running.hasBigEmpty, '| 轻提示:', running.hasLightWait)
  if (running.hasBigEmpty) failures.push('AI 运行中仍然渲染了整块 .empty-state 空状态')
  await page.screenshot({ path: path.join(shotDir, '1-AI运行中.png') })

  // —— 等 AI 那一路结束
  const settled = await page
    .waitForFunction(() => !document.body.innerText.includes('AI 正在逐条核对原文'), null, {
      timeout: 150_000,
      polling: 500,
    })
    .then(() => true)
    .catch(() => false)
  if (!settled) failures.push('AI 那一路 150 秒内没有结束')

  // 条数稳定下来才算最终态：banner 消失和风险数组落地不一定同一帧，
  // 早一帧读概览会读到「还没合并」的中间状态。
  await page
    .waitForFunction(
      () => {
        const sig = Array.from(document.querySelectorAll('.tabs .tab .n'))
          .map((el) => el.innerText)
          .join(',')
        if (window.__lastSig === sig && window.__stable >= 3) return true
        if (window.__lastSig !== sig) {
          window.__lastSig = sig
          window.__stable = 0
        } else {
          window.__stable = (window.__stable || 0) + 1
        }
        return false
      },
      null,
      { timeout: 30_000, polling: 400 },
    )
    .catch(() => {})
  await page.waitForTimeout(400)

  // —— 4) 概览：算不出合计时整块不出现
  const overview = await page.evaluate(() => {
    const loss = document.querySelector('.loss')
    return {
      hasLoss: Boolean(loss),
      lossText: loss ? loss.innerText.replace(/\s+/g, ' ') : null,
      hasTbd: document.body.innerText.includes('待补'),
    }
  })
  log('【概览】最坏合计模块:', overview.hasLoss ? '显示' : '不显示', '| 出现「待补」:', overview.hasTbd)
  log('   ', overview.lossText || '(无)')
  if (overview.hasTbd) failures.push('概览仍出现「待补」字样')
  await page.screenshot({ path: path.join(shotDir, '2-概览.png'), fullPage: false })

  // —— 3) 页签角标
  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tabs .tab')).map((el) => ({
      label: el.innerText.replace(/\s+/g, ' ').trim(),
      badge: el.querySelector('.n')?.innerText ?? null,
    })),
  )
  log('【页签】', JSON.stringify(tabs))
  const fixTab = tabs.find((t) => t.label.startsWith('修改'))
  if (fixTab && fixTab.badge !== null) failures.push(`「修改」页签仍挂着角标 ${fixTab.badge}`)

  // —— 1) 风险卡片尺寸
  await page.locator('.tabs .tab', { hasText: '风险' }).first().click()
  await page.waitForSelector('.risk-card', { timeout: 20000 })
  await page.waitForTimeout(300)
  const cards = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.risk-card')).map((el) => {
      const r = el.getBoundingClientRect()
      const hd = el.querySelector('.rc-hd')
      const pick = (sel) => {
        const node = el.querySelector(sel)
        if (!node) return null
        const b = node.getBoundingClientRect()
        const cs = getComputedStyle(node)
        return {
          h: Math.round(b.height),
          w: Math.round(b.width),
          lh: cs.lineHeight,
          ws: cs.whiteSpace,
          flex: cs.flex,
        }
      }
      return {
        level: el.querySelector('.tag')?.innerText.trim() ?? '',
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
        hdH: hd ? Math.round(hd.getBoundingClientRect().height) : 0,
        title: pick('.rc-title'),
        amt: pick('.rc-amt'),
        est: pick('.rc-amt .est'),
        hdScroll: hd ? Math.round(hd.scrollWidth - hd.clientWidth) : 0,
        text: el.innerText.replace(/\s+/g, ' ').slice(0, 26),
      }
    }),
  )
  log('【风险卡片】')
  cards.forEach((c) =>
    log(
      `   ${c.level}\t left=${c.left} w=${c.width} h=${c.height} hd=${c.hdH} 溢出=${c.hdScroll}\n` +
        `      title: h=${c.title?.h} lh=${c.title?.lh} ws=${c.title?.ws} flex=${c.title?.flex}\n` +
        `      amt: h=${c.amt?.h} w=${c.amt?.w} display=${c.amt?.display} pad=${c.amt?.pad} bg=${c.amt?.bg} bd=${c.amt?.bd} rects=${c.amt?.rects}\n` +
        `      amt html: ${c.amt?.html}\n` +
        `      ${c.text}`,
    ),
  )
  const widths = [...new Set(cards.map((c) => c.width))]
  const lefts = [...new Set(cards.map((c) => c.left))]
  const heights = [...new Set(cards.map((c) => c.height))]
  if (widths.length > 1) failures.push(`风险卡片宽度不一致：${widths.join(' / ')}`)
  if (lefts.length > 1) failures.push(`风险卡片左边界不一致：${lefts.join(' / ')}`)
  if (heights.length > 1) failures.push(`风险卡片高度不一致：${heights.join(' / ')}`)
  const overflowing = cards.filter((c) => c.hdScroll > 1)
  if (overflowing.length) failures.push(`${overflowing.length} 张卡片头部内容溢出（最长 ${Math.max(...overflowing.map((c) => c.hdScroll))}px）`)
  await page.screenshot({ path: path.join(shotDir, '3-风险列表.png') })

  // —— 2) 修改页不应再有「同属…的还有」
  await page.locator('.tabs .tab', { hasText: '修改' }).first().click()
  await page.waitForTimeout(500)
  const fixPane = await page.evaluate(() => ({
    hasRelated: Boolean(document.querySelector('.related')),
    hasSameCopy: document.body.innerText.includes('同属'),
  }))
  log('【修改页】「同属」模块:', fixPane.hasRelated || fixPane.hasSameCopy ? '仍在' : '已删除')
  if (fixPane.hasRelated || fixPane.hasSameCopy) failures.push('修改页仍然存在「同属…的还有 N 条」模块')
  await page.screenshot({ path: path.join(shotDir, '4-修改页.png') })

  log('')
  if (failures.length) {
    log('未通过：')
    failures.forEach((f) => log(' -', f))
    process.exitCode = 1
  } else {
    log('全部通过')
  }
  log('截图目录：', shotDir)
} finally {
  await browser.close()
}
