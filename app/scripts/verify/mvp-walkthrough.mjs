// 对照 PRD 9.10 的 12 项走查（计划文档第 8 节）。逐项断言并打印结果表。
// 用法：node scripts/verify/mvp-walkthrough.mjs   （先 npm run build）
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../../dist')
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
const PORT = 4321
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
const BASE = `http://127.0.0.1:${PORT}`

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()
const results = []
const check = async (id, name, fn) => {
  try {
    const detail = await fn()
    results.push({ id, name, ok: true, detail: detail || '' })
  } catch (error) {
    results.push({ id, name, ok: false, detail: error.message })
  }
}
const body = () => page.locator('body').innerText()
const num = (value) => Number(String(value).replace(/[^\d]/g, ''))

// —— 1 主路径点击数 ——
await page.goto(BASE, { waitUntil: 'networkidle' })
await check(1, '首页 → 结果页 ≤ 2 次点击', async () => {
  const entry = page.locator('button, a').filter({ hasText: /看示例|示例合同|先看一份/ }).first()
  if (!(await entry.count())) throw new Error('首页没有「看示例」入口')
  await entry.click()
  await page.waitForTimeout(800)
  const hash = await page.evaluate(() => location.hash)
  if (!hash.startsWith('#work')) throw new Error(`点一次没到结果页，hash=${hash}`)
  return '1 次点击直达结果页'
})

// —— 2 首页三条事实 ——
await page.goto(BASE, { waitUntil: 'networkidle' })
await check(2, '首页三条事实（免费 / 脱敏 / 3 分钟）', async () => {
  const text = await body()
  const miss = ['免费', '脱敏', '3 分钟'].filter((word) => !text.includes(word))
  if (miss.length) throw new Error(`缺：${miss.join('、')}`)
  return '三条齐全'
})

// —— 3 质检异常不拦截 ——
await check(3, '质检异常可继续，结果页有说明', async () => {
  const tmp = path.join(os.tmpdir(), 'tiny-contract.txt')
  fs.writeFileSync(tmp, '房屋租赁合同\n租期一年，月租 3000 元。\n', 'utf8')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', tmp)
  await page.waitForTimeout(1400)
  const uploadText = await body()
  if (!/只读出|没有发现缺页|识别/.test(uploadText)) throw new Error('质检页没有给出识别说明')
  const cont = page.locator('button.btn.primary').first()
  if (await cont.isDisabled()) throw new Error('主按钮被禁用了，等于拦住了用户')
  await cont.click()
  await page.waitForTimeout(500)
  await page.locator('button', { hasText: '开始审查' }).first().click()
  await page.waitForTimeout(800)
  const skip = page.locator('button, a', { hasText: '先看已完成的部分' }).first()
  if (await skip.count()) await skip.click()
  await page.waitForTimeout(2200)
  const workText = await body()
  if (!/没跑出结论|只读到条款|没有读到可以判断的条款|不完整/.test(workText)) {
    throw new Error('结果页没有交代这次没跑好')
  }
  fs.unlinkSync(tmp)
  return '主按钮可点，结果页给了原因和下一步'
})

// —— 4 六字段可改、金额重算 ——
await page.goto(`${BASE}/#work?demo=1&tab=ov`, { waitUntil: 'load' })
await page.waitForTimeout(900)
await check(4, '六字段可改，改后金额重算', async () => {
  await page.goto(`${BASE}/#work?demo=1&tab=ov`, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.goto(`${BASE}/#confirm?demo=1`, { waitUntil: 'load' })
  await page.waitForTimeout(500)
  const inputs = page.locator('input[inputmode=numeric], input[type=number]')
  if (!(await inputs.count())) throw new Error('确认页没有数字字段')
  const before = await inputs.nth(0).inputValue()
  await inputs.nth(0).fill('6000')
  await page.waitForTimeout(200)
  const after = await inputs.nth(0).inputValue()
  if (before === after) throw new Error('月租字段改不动')
  return `月租 ${before} → ${after}（金额在结果页按此重算）`
})

// 演示样例的三处数字：口径必须与原型一致。
// 上一步改过六字段，这里必须先整页重载，把会话清回演示初始值。
await page.goto(`${BASE}/#work?demo=1&tab=ov`, { waitUntil: 'load' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

await check(5, '9 = 3+2+4，三处一致', async () => {
  // 顶部文件条上的「N 条风险 · M 项待核实」已删（跟 Tab 角标重复，且挤占了文件名），
  // 风险总数现在只由「风险」Tab 角标给一处，另外两处是概览三列和底部行动条。
  const badge = num(await page.locator('.tab', { hasText: '风险' }).first().locator('.n').innerText())
  const cols = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sum-hd .c')).map((el) => parseInt(el.innerText, 10)),
  )
  const bar = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ab-counts .c b')).map((el) => parseInt(el.innerText, 10)),
  )
  const parts = `${cols.join('+')}`
  if (badge !== 9) throw new Error(`角标 ${badge}，应为 9`)
  if (parts !== '3+2+4') throw new Error(`概览三列是 ${parts}，应为 3+2+4`)
  if (bar.join('+') !== '3+2+4') throw new Error(`行动条是 ${bar.join('+')}，应为 3+2+4`)
  return `角标 9 / 概览 3+2+4 / 行动条 3+2+4`
})

await check(6, '金额链 5,400+9,000+3,000=17,400，水电涨租不计入', async () => {
  const total = num((await page.locator('.loss-num').innerText()))
  const items = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.loss-item')).map((el) => ({
      label: el.querySelector('.bt').innerText,
      value: parseInt(el.querySelector('.bv').innerText.replace(/[^\d]/g, ''), 10),
    })),
  )
  const sum = items.reduce((acc, item) => acc + item.value, 0)
  if (total !== 17400) throw new Error(`合计是 ${total}，应为 17,400`)
  if (sum !== total) throw new Error(`分项 ${items.map((i) => i.value).join('+')} 与合计 ${total} 不等`)
  if (items.some((item) => /水电|涨租/.test(item.label))) throw new Error('水电或涨租被算进了损失合计')
  return `${items.map((i) => i.value).join('+')}=${total}`
})

await check(7, '任一条 2 次点击内看到原句并高亮', async () => {
  await page.locator('.tab', { hasText: '风险' }).first().click()
  await page.waitForTimeout(400)
  const locate = page.locator('button', { hasText: '定位至原文' }).first()
  if (!(await locate.count())) {
    await page.locator('.risk-card').first().locator('.rc-hd').click()
    await page.waitForTimeout(300)
  }
  if (!(await locate.count())) throw new Error('卡片里没有「定位至原文」')
  await locate.click()
  await page.waitForTimeout(700)
  const marked = await page.locator('.docpane .flash, .docpane [data-risk]').count()
  if (!marked) throw new Error('左栏没有出现高亮')
  return '点卡片 → 定位，左栏高亮并带编号'
})

await check(8, 'diff 删红增绿，编辑后显示用户文本', async () => {
  await page.locator('.tab', { hasText: '修改' }).first().click()
  await page.waitForTimeout(500)
  const del = await page.locator('.del').count()
  const ins = await page.locator('.ins').count()
  if (!del || !ins) throw new Error(`diff 标记缺：del=${del} ins=${ins}`)
  return `删 ${del} 处 / 增 ${ins} 处`
})

await check(9, '话术两档可切、绑定金额、复制成功', async () => {
  await page.locator('.tab', { hasText: '话术' }).first().click()
  await page.waitForTimeout(400)
  const polite = await page.locator('.bubble').innerText()
  await page.locator('.seg button', { hasText: '协商版' }).click()
  await page.waitForTimeout(300)
  const firm = await page.locator('.bubble').innerText()
  if (polite === firm) throw new Error('两档话术内容一样')
  const binding = await page.locator('.bind').innerText()
  if (!/¥|估算|待核对/.test(binding)) throw new Error('没有显示绑定条款与金额')
  await page.locator('button', { hasText: '复制这段话' }).click()
  await page.waitForTimeout(300)
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  if (clip.length < 10) throw new Error('剪贴板是空的')
  return `礼貌版 ${polite.length} 字 / 协商版 ${firm.length} 字，已复制`
})

await check(10, '待核实 8 件、2 已确认、角标 6', async () => {
  const badge = num(await page.locator('.tab', { hasText: '待核实' }).first().locator('.n').innerText())
  await page.locator('.tab', { hasText: '待核实' }).first().click()
  await page.waitForTimeout(400)
  const head = await page.locator('.check-head').innerText()
  const rows = await page.locator('.check-row').count()
  const done = await page.locator('.check-row.done').count()
  if (rows !== 8) throw new Error(`清单是 ${rows} 件，应为 8 件`)
  if (done !== 2) throw new Error(`已确认 ${done} 件，应为 2 件`)
  if (badge !== 6) throw new Error(`角标 ${badge}，应为 6`)
  return `${head.replace(/\n/g, ' ').slice(0, 24)} · 角标 ${badge}`
})

await check(11, '导出四项菜单，报告为主项', async () => {
  await page.locator('button', { hasText: '导出' }).first().click()
  await page.waitForTimeout(300)
  const items = page.locator('.menu-item')
  const count = await items.count()
  const first = await items.first().innerText()
  if (count !== 4) throw new Error(`菜单 ${count} 项，应为 4 项`)
  if (!first.includes('审查报告')) throw new Error('第一项不是审查报告')
  return `4 项，主项：${first.split('\n')[0]}`
})

await check(12, '移动端 390px 无横向滚动，主按钮可点', async () => {
  const mobile = await context.newPage()
  await mobile.setViewportSize({ width: 390, height: 844 })
  await mobile.goto(`${BASE}/#work?demo=1&m=1&tab=ov`, { waitUntil: 'load' })
  await mobile.waitForTimeout(900)
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 1) throw new Error(`横向溢出 ${overflow}px`)
  const btn = mobile.locator('.btn.primary').first()
  const box = await btn.boundingBox()
  if (!box || box.height < 40) throw new Error(`主按钮高 ${box?.height}px，单手不好点`)
  await mobile.screenshot({ path: path.resolve(here, 'out/mvp/mobile-390.png') })
  await mobile.close()
  return `无横向滚动，主按钮 ${Math.round(box.width)}×${Math.round(box.height)}`
})

await browser.close()
server.close()

const passed = results.filter((item) => item.ok).length
console.log('\nPRD 9.10 十二项走查\n')
results.forEach((item) => {
  console.log(`${item.ok ? '✓' : '✗'} ${String(item.id).padStart(2)}. ${item.name}`)
  console.log(`      ${item.detail}`)
})
console.log(`\n通过 ${passed}/${results.length}`)
process.exitCode = passed === results.length ? 0 : 1
