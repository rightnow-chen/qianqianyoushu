// MVP v0.1 主路径 e2e：上传真实文本合同 → 确认六字段 → 审查 → 概览 → 改一条 → 复制话术 → 勾待核实。
// 用法：node tests/e2e/mvp-flow.mjs        （先 npm run build，脚本会自己起静态服务器）
// 退出码 0 表示全过；任何一条断言失败会打印差异并以 1 退出。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../../dist')
const sample = path.resolve(here, '../../real-contract-samples/sample-landlord-self-drafted.txt')

assert.ok(fs.existsSync(path.join(dist, 'index.html')), '先跑 npm run build，dist 里没有产物')
assert.ok(fs.existsSync(sample), '缺真实合同样本')

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
  let file = path.join(dist, url === '/' ? 'index.html' : url)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

const PORT = 4311
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
const BASE = `http://127.0.0.1:${PORT}`
const steps = []
const step = (name) => steps.push(name)

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text().slice(0, 200)}`)
})

const events = () => page.evaluate(() => (window.__qyysEvents || []).map((item) => item.event))
const text = () => page.locator('body').innerText()

try {
  // 1. 首页
  await page.goto(BASE, { waitUntil: 'networkidle' })
  assert.ok((await text()).includes('签前有数'), '首页应出现产品名')
  step('落地页')

  // 2. 上传真实文本合同 → 质检页
  await page.setInputFiles('input[type=file]', sample)
  await page.waitForTimeout(1500)
  assert.equal(await page.evaluate(() => location.hash.split('?')[0]), '#upload', '上传成功后应停在质检页')
  step('上传与质检')

  // 3. 带瑕疵也允许继续 → 确认页六字段
  await page.locator('button.btn.primary').first().click()
  await page.waitForTimeout(500)
  const rents = page.locator('input[inputmode=numeric], input[type=number]')
  const rentValue = Number(await rents.nth(0).inputValue())
  const depositValue = Number(await rents.nth(2).inputValue())
  assert.ok(rentValue > 0, `月租应从合同里抽出来，实际是 ${rentValue}`)
  assert.ok(depositValue > 0, `押金应从合同里抽出来，实际是 ${depositValue}`)
  step('确认六字段（合同抽取生效）')

  // 4. 改月租，验证金额联动
  await rents.nth(0).fill('3000')
  await page.waitForTimeout(200)
  step('字段编辑联动')

  // 5. 开始审查
  await page.locator('button', { hasText: '开始审查' }).first().click()
  await page.waitForTimeout(900)
  const skip = page.locator('button, a', { hasText: '先看已完成的部分' }).first()
  if (await skip.count()) await skip.click()
  await page.waitForTimeout(2200)
  assert.ok((await page.evaluate(() => location.hash)).startsWith('#work'), '审查后应进工作台')

  const overview = await text()
  assert.ok(overview.includes('最坏情况合计损失'), '概览应给出最坏情况合计')
  const total = Number((overview.match(/最坏情况合计损失（估算）\s*¥\s*([\d,]+)/) || [])[1]?.replace(/,/g, ''))
  assert.ok(total > 0, `合计金额应大于 0，实际是 ${total}`)

  // 合计必须恒等于页面上那几项分项之和，不许出现「总数对不上明细」
  const breakdown = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.loss-item .bv')).map((el) =>
      Number(el.innerText.replace(/[^\d]/g, '')),
    ),
  )
  assert.ok(breakdown.length > 0, '最坏合计应有分项')
  assert.equal(breakdown.reduce((a, b) => a + b, 0), total, `分项之和 ${breakdown.join('+')} 应等于合计 ${total}`)

  // 违约金必须等于「月租 × 2」：月租从 2,800 改成 3,000 后应是 6,000
  const termination = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.loss-item'))
    const hit = rows.find((row) => row.innerText.includes('退租违约金'))
    return hit ? Number(hit.querySelector('.bv').innerText.replace(/[^\d]/g, '')) : 0
  })
  assert.equal(termination, 6000, `月租 3,000 时违约金应为 6,000，实际 ${termination}`)
  step(`概览：合计随字段重算（${breakdown.join('+')}=${total}）`)

  // 6. 三档数字自洽：9 = 3 + 2 + 4
  const counts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sum-hd .c')).map((el) => parseInt(el.innerText, 10)),
  )
  assert.equal(counts.reduce((a, b) => a + b, 0), counts[0] + counts[1] + counts[2])
  const totalRisks = await page.evaluate(() => {
    const match = document.body.innerText.match(/(\d+)\s*条风险/)
    return match ? Number(match[1]) : 0
  })
  assert.equal(counts.reduce((a, b) => a + b, 0), totalRisks, '三列条数之和应等于风险总数')
  step(`数字自洽（${counts.join('+')}=${totalRisks}）`)

  // 7. 风险页：展开卡片并核对埋点
  await page.locator('.tab', { hasText: '风险' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('.rc-hd').first().click()
  await page.waitForTimeout(300)
  assert.ok((await text()).includes('合同原文'), '展开后应看到合同原文')
  const trackList = await events()
  assert.ok(trackList.includes('risk_card_open'), '展开卡片应记 risk_card_open')
  await page.locator('.sort-btn').click()
  await page.waitForTimeout(200)
  assert.ok((await events()).includes('risk_sort'), '切换排序应记 risk_sort')
  step('风险页展开 / 排序埋点')

  // 8. 修改页：接受一条修订
  await page.locator('.tab', { hasText: '修改' }).first().click()
  await page.waitForTimeout(500)
  const accept = page.locator('button', { hasText: /接受|采纳/ }).first()
  if (await accept.count()) await accept.click()
  await page.waitForTimeout(300)
  assert.ok((await events()).includes('suggestion_accept') || (await text()).includes('建议改为'), '修改页应能接受修订')
  step('修改页接受修订')

  // 9. 话术页：复制
  await page.locator('.tab', { hasText: '话术' }).first().click()
  await page.waitForTimeout(500)
  await page.locator('button', { hasText: '复制这段话' }).click()
  await page.waitForTimeout(300)
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  assert.ok(clip.length > 10, '剪贴板里应真有话术')
  assert.ok((await events()).includes('script_copy'), '复制话术应记 script_copy')
  step('话术复制进剪贴板')

  // 10. 待核实：勾一件
  await page.locator('.tab', { hasText: '待核实' }).first().click()
  await page.waitForTimeout(400)
  const firstCheck = page.locator('.check-row').first()
  assert.ok(await firstCheck.count(), '待核实页应有清单行')
  await firstCheck.click()
  await page.waitForTimeout(300)
  assert.ok(await page.locator('.check-row.done').count(), '勾选后该行应变成已确认')
  assert.ok((await events()).includes('checklist_check'), '勾选应记 checklist_check')
  await page.locator('button', { hasText: '复制成一条微信消息' }).click()
  await page.waitForTimeout(300)
  assert.ok((await events()).includes('checklist_copy'), '复制清单应记 checklist_copy')
  step('待核实勾选与一键成文')

  // 11. 演示入口带标识
  await page.goto(`${BASE}/#work?demo=1&tab=ov`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
  assert.ok((await text()).includes('演示数据'), '演示模式必须有「演示数据」标识')
  step('演示入口标识')

  // 12. 手机形态：390 宽不出横向滚动
  const mobile = await context.newPage()
  await mobile.setViewportSize({ width: 390, height: 844 })
  await mobile.goto(`${BASE}/#work?demo=1&m=1&tab=ov`, { waitUntil: 'load' })
  await mobile.waitForTimeout(900)
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert.ok(overflow <= 1, `390px 下不应横向滚动，超出 ${overflow}px`)
  await mobile.screenshot({ path: path.resolve(here, 'out/mobile-work.png') })
  await mobile.close()
  step('手机形态 390px')

  assert.deepEqual(errors, [], `页面报错：${errors.join(' | ')}`)
  console.log(`\nMVP 主路径 e2e 通过（${steps.length} 步）：`)
  steps.forEach((item, index) => console.log(`  ${String(index + 1).padStart(2)}. ${item}`))
} catch (error) {
  console.error('\n失败：', error.message)
  console.error('已完成：', steps.join(' → '))
  if (errors.length) console.error('页面报错：', errors.join(' | '))
  await page.screenshot({ path: path.resolve(here, 'out/failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
