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
const pdfSample = path.resolve(here, '../../public/dataset/rental-contracts/qhd-2025-rental-contract.pdf')

assert.ok(fs.existsSync(path.join(dist, 'index.html')), '先跑 npm run build，dist 里没有产物')
assert.ok(fs.existsSync(sample), '缺真实合同样本')
assert.ok(fs.existsSync(pdfSample), '缺 PDF 样本')

// 拍照上传没有真 OCR 后端可用，用这份真实合同当「识别结果」——
// 验的是界面怎么呈现，识别准不准交给 OCR 服务自己的测试。
const OCR_STUB_TEXT = fs.readFileSync(sample, 'utf8')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // PDF 的 worker 是 .mjs；漏了这一条，pdf.js 会静默失败（上传后什么都不发生）
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  // 拍照上传会 POST /api/ocr/image。e2e 不起后端，这里回一份固定文本，
  // 只为了验「图片在结果页走重排文字、不摆照片」这条界面规则。
  if (req.method === 'POST' && url === '/api/ocr/image') {
    req.resume()
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ text: OCR_STUB_TEXT, confidence: 92, mode: 'e2e-stub' }))
    return
  }
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

/** 点开「导出」菜单 → 选一项 → 等真实下载，返回文件内容。 */
async function exportContract(page, label) {
  await page.locator('.export-wrap button').first().click()
  await page.waitForTimeout(200)
  const item = page.locator('.menu-item', { hasText: label }).first()
  assert.ok(await item.count(), `导出菜单里应有「${label}」`)
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), item.click()])
  const file = await download.path()
  assert.ok(file, `「${label}」没有产生下载文件`)
  return fs.readFileSync(file)
}

/** 读 docx（zip）里的某个部件，用于断言真的写进了批注/修订。 */
async function readDocxPart(buf, name) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  const file = zip.file(name)
  return file ? file.async('string') : null
}

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
  await page.waitForTimeout(800)
  const rents = page.locator('input[inputmode=numeric], input[type=number]')
  const rentValue = Number(await rents.nth(0).inputValue())
  const depositValue = Number(await rents.nth(2).inputValue())
  assert.ok(rentValue > 0, `月租应从合同里抽出来，实际是 ${rentValue}`)
  assert.ok(depositValue > 0, `押金应从合同里抽出来，实际是 ${depositValue}`)

  // 预览必须是这份文件的内容：以前这里写死了一份示例合同，传什么都长一样
  const previewText = await page.locator('.preview').innerText()
  assert.ok(!previewText.includes('建国路 88 号'), '确认页不能显示写死的示例合同')
  assert.ok(previewText.includes('押金'), '确认页应显示上传合同的实际内容')

  // 数字不许被输入框裁掉：13500 曾显示成 600，看起来就像「识别错了」
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('.field input')].filter((input) => input.scrollWidth > input.clientWidth + 1).length,
  )
  assert.equal(clipped, 0, `有 ${clipped} 个金额输入框装不下数字`)
  step('确认六字段（合同抽取生效、预览是原件）')

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

  // 11. 导出修订版：必须真的下载出一个 docx，且正文里已经换成建议文本
  const revisionBuf = await exportContract(page, '修订版')
  const revisionBody = await readDocxPart(revisionBuf, 'word/document.xml')
  assert.ok(revisionBody?.includes('<w:document'), '修订版 docx 里应有 document.xml')
  assert.ok(!revisionBody.includes('commentReference'), '修订版不该带批注')
  assert.ok(revisionBody.length > 2000, '修订版正文不该是空的')
  assert.ok(revisionBody.includes('修改清单'), '修订版文末要有修改清单')
  assert.ok(revisionBody.includes('红色下划线'), '修订版要说明标红含义')
  step('导出修订版 docx')

  // 12. 导出批注版：原文不动，Word 原生批注挂上去
  const commentBuf = await exportContract(page, '批注版')
  const commentsXml = await readDocxPart(commentBuf, 'word/comments.xml')
  const commentBody = await readDocxPart(commentBuf, 'word/document.xml')
  assert.ok(commentsXml?.includes('w:comment'), '批注版必须写出 comments.xml')
  assert.ok(commentBody?.includes('commentReference'), '批注版正文要挂批注引用')
  step('导出批注版 docx')

  // 13. 演示入口带标识
  await page.goto(`${BASE}/#work?demo=1&tab=ov`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
  assert.ok((await text()).includes('演示数据'), '演示模式必须有「演示数据」标识')
  step('演示入口标识')

  // 14. 手机形态：390 宽不出横向滚动
  const mobile = await context.newPage()
  await mobile.setViewportSize({ width: 390, height: 844 })
  await mobile.goto(`${BASE}/#work?demo=1&m=1&tab=ov`, { waitUntil: 'load' })
  await mobile.waitForTimeout(900)
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert.ok(overflow <= 1, `390px 下不应横向滚动，超出 ${overflow}px`)
  await mobile.screenshot({ path: path.resolve(here, 'out/mobile-work.png') })
  await mobile.close()
  step('手机形态 390px')

  // 15. 上传 PDF：确认页左侧要渲染原件（canvas），不是一段文字
  // 单独开一个 context：主流程那个页面已经走过导出，带着一堆状态，容易互相干扰
  const pdfContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const pdfPage = await pdfContext.newPage()
  await pdfPage.goto(BASE, { waitUntil: 'networkidle' })
  await pdfPage.setInputFiles('input[type=file]', pdfSample)
  // 22 页的 PDF 解析要看机器脸色，等状态而不是等时间
  const uploaded = await pdfPage
    .waitForFunction(() => location.hash.includes('upload'), null, { timeout: 30000 })
    .then(() => true)
    .catch(async () => {
      console.error('[debug] hash:', await pdfPage.evaluate(() => location.hash))
      console.error('[debug] toast:', await pdfPage.locator('.toast').innerText().catch(() => '(无)'))
      console.error('[debug] inputs:', await pdfPage.locator('input[type=file]').count())
      return false
    })
  assert.ok(uploaded, 'PDF 应能上传成功并进入质检页')
  await pdfPage.locator('button.btn.primary').first().click()
  await pdfPage.waitForSelector('canvas.pdf-canvas', { timeout: 15000 })
  await pdfPage.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas.pdf-canvas')
      return canvas && canvas.width > 100
    },
    null,
    { timeout: 20000 },
  )
  const drawn = await pdfPage.evaluate(() => {
    const canvas = document.querySelector('canvas.pdf-canvas')
    if (!canvas) return 0
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let ink = 0
    for (let i = 0; i < data.length; i += 4 * 97) if (data[i] < 200) ink += 1
    return ink
  })
  assert.ok(drawn > 20, 'PDF 画布应该是真的画上内容了，不是一块白板')
  assert.equal(await pdfPage.locator('canvas.pdf-canvas').count(), 1, 'PDF 只能有一个画布')
  assert.equal(
    await pdfPage.locator('.preview-hd .seg button').count(),
    0,
    '文件上传没有「识别」这回事，不该出现「原件 / 识别文字」切换',
  )
  step('PDF 确认页渲染原件')

  // 16. 从 PDF 确认页点「开始审查」：不能白屏
  //    这一条钉住真实事故——预览组件卸载时调了不存在的 pdf.destroy()，
  //    异常发生在 React 卸载阶段，整棵树被带走，页面只剩空白。
  await pdfPage.locator('button.btn.primary').last().click()
  await pdfPage.waitForFunction(() => location.hash.includes('work'), null, { timeout: 40000 })
  const workText = await pdfPage.evaluate(() => document.body.innerText.trim().length)
  assert.ok(workText > 200, `结果页不能是空白，实际只有 ${workText} 个字`)
  assert.equal(await pdfPage.locator('.preview-hd .seg button').count(), 0, '离开确认页后不该残留切换按钮')
  step('PDF 确认页 → 开始审查不白屏')

  // 16b. 结果页左栏显示的必须是**这份 PDF 本身**：canvas + 文字层。
  //      以前这里是「把文本重新排成一张纸」，看起来像合同，其实没有一个像素来自原文件。
  //      文字层是一页页搭的（canvas 更慢，之后才补），所以等「每页都有文字层」再断言。
  await pdfPage.waitForFunction(
    () => {
      const pages = document.querySelectorAll('.orig-page')
      return pages.length > 0 && pages.length === document.querySelectorAll('.orig-page .textLayer').length
    },
    null,
    { timeout: 60000 },
  )
  const pdfPane = await pdfPage.evaluate(() => ({
    orig: document.querySelectorAll('.docpane.orig').length,
    pages: document.querySelectorAll('.orig-page').length,
    canvases: document.querySelectorAll('.orig-page > canvas').length,
    layers: document.querySelectorAll('.orig-page .textLayer').length,
    spans: document.querySelectorAll('.orig-page .textLayer span').length,
    papers: document.querySelectorAll('.paper .page').length,
  }))
  assert.equal(pdfPane.orig, 1, '结果页左栏应切成原件模式')
  assert.ok(pdfPane.pages >= 1, 'PDF 至少渲染出一页')
  assert.equal(pdfPane.pages, pdfPane.layers, `每页都要有文字层，页 ${pdfPane.pages} / 层 ${pdfPane.layers}`)
  assert.ok(pdfPane.canvases >= 1, '第一页应该有画布')
  assert.ok(pdfPane.spans > 20, `PDF 要有可定位的文字层，实际 ${pdfPane.spans} 个 span`)
  assert.equal(pdfPane.papers, 0, '有原件时不该再显示重排的纸')
  await pdfPage.close()
  await pdfContext.close()
  step('PDF 结果页左栏是原件 + 文字层')

  // 17. 上传 Word：确认页左侧要把 docx 还原成真排版（表格、分页都还在），
  //     而不是像以前那样拍平成一段段等宽文字——那看起来和「复制粘贴」没区别。
  const docxSample = path.resolve(
    here,
    '../../../deliverables/test-kits/contract-review-advanced-kit-20261009/03_表格与补充协议_复杂Word.docx',
  )
  assert.ok(fs.existsSync(docxSample), '缺 Word 样本')
  const docxContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const docxPage = await docxContext.newPage()
  await docxPage.goto(BASE, { waitUntil: 'networkidle' })
  await docxPage.setInputFiles('input[type=file]', docxSample)
  await docxPage.waitForFunction(() => location.hash.includes('upload'), null, { timeout: 30000 })
  await docxPage.locator('button.btn.primary').first().click()
  await docxPage.waitForSelector('.docx-host section.docx', { timeout: 30000 })
  await docxPage.waitForTimeout(800)

  const docxStats = await docxPage.evaluate(() => {
    const host = document.querySelector('.docx-host')
    const section = host?.querySelector('section.docx')
    return {
      pages: host ? host.querySelectorAll('section.docx').length : 0,
      overflowX: host ? host.scrollWidth > host.clientWidth + 1 : true,
      width: section ? section.offsetWidth : 0,
      chars: section ? section.innerText.replace(/\s/g, '').length : 0,
      tables: section ? section.querySelectorAll('table').length : 0,
    }
  })
  assert.ok(docxStats.pages >= 1, 'Word 至少应还原出一页')
  assert.ok(docxStats.width > 400, `Word 页面应是原始页面宽度，实际 ${docxStats.width}`)
  assert.ok(!docxStats.overflowX, 'Word 页面不该横向溢出（超出部分要等比缩放）')
  assert.ok(docxStats.chars > 100, `Word 页面要有正文，实际 ${docxStats.chars} 字`)
  assert.ok(docxStats.tables >= 1, 'docx 里的表格必须还原成 <table>，不能拍平成文本')
  assert.equal(await docxPage.locator('.mini-paper').count(), 0, 'Word 原件不该退化成拍平段落')
  step('Word 确认页还原真排版')

  // 17b. 同一个文件走到结果页：左栏还得是那份 Word，不能偷偷换回重排的纸
  await docxPage.locator('button.btn.primary').last().click()
  await docxPage.waitForFunction(() => location.hash.includes('work'), null, { timeout: 40000 })
  await docxPage.waitForSelector('.orig-host section.docx', { timeout: 30000 })
  await docxPage.waitForTimeout(600)
  const wordPane = await docxPage.evaluate(() => {
    const host = document.querySelector('.orig-host')
    const section = host?.querySelector('section.docx')
    return {
      sections: host ? host.querySelectorAll('section.docx').length : 0,
      overflowX: host ? host.scrollWidth > host.clientWidth + 2 : true,
      chars: section ? section.innerText.replace(/\s/g, '').length : 0,
      papers: document.querySelectorAll('.paper .page').length,
    }
  })
  assert.ok(wordPane.sections >= 1, '结果页左栏要还原 Word 原件')
  assert.ok(wordPane.chars > 100, `Word 原件要有正文，实际 ${wordPane.chars} 字`)
  assert.ok(!wordPane.overflowX, 'Word 原件在左栏里要缩放到不横向溢出')
  assert.equal(wordPane.papers, 0, '有原件时不该退回重排的纸')
  step('Word 结果页左栏是原件')
  await docxPage.close()
  await docxContext.close()

  // 18. 拍照上传：结果页左栏只给排过版的文字，不摆照片。
  //     照片既没法定位，也不帮人读合同——要读的是识别出来的字。
  const imageSample = path.resolve(
    here,
    '../../../deliverables/test-kits/contract-review-test-kit-20261008/06_图片OCR合同.png',
  )
  assert.ok(fs.existsSync(imageSample), '缺图片 OCR 样本')
  const imgContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const imgPage = await imgContext.newPage()
  await imgPage.goto(BASE, { waitUntil: 'networkidle' })
  await imgPage.setInputFiles('input[type=file]', imageSample)
  await imgPage.waitForFunction(() => location.hash.includes('upload'), null, { timeout: 40000 })
  await imgPage.locator('button.btn.primary').first().click()
  await imgPage.waitForFunction(() => location.hash.includes('confirm'), null, { timeout: 20000 })
  await imgPage.locator('button.btn.primary').last().click()
  await imgPage.waitForFunction(() => location.hash.includes('work'), null, { timeout: 40000 })
  await imgPage.waitForSelector('.docpane .paper .page', { timeout: 30000 })

  const imgPane = await imgPage.evaluate(() => ({
    orig: document.querySelectorAll('.docpane.orig').length,
    images: document.querySelectorAll('.docpane img').length,
    papers: document.querySelectorAll('.paper .page').length,
    marks: document.querySelectorAll('.paper .sn').length,
    label: (document.querySelector('.docpane .doc-tools .m')?.textContent || '').trim(),
  }))
  assert.equal(imgPane.orig, 0, '拍照上传的结果页不该切成原件模式')
  assert.equal(imgPane.images, 0, '左栏不该摆照片')
  assert.ok(imgPane.papers >= 1, '拍照上传也要给出排好版的文字')
  assert.equal(imgPane.label, '识别文字', `左栏标题应是「识别文字」，实际「${imgPane.label}」`)
  step('拍照结果页只给排好版的文字')
  await imgPage.close()
  await imgContext.close()

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
