// 上传质检的语义分派。
// 守的核心规则：**「识别率 / 反光 / 重拍 / 置信度」这套语言只对拍照 OCR 成立**。
// PDF / Word 自带文字层，套用 OCR 的质检模板等于给用户编造一个不存在的问题。
import assert from 'node:assert/strict'

const { qualityForFile, looksLikeLease } = await import('../../src/features/uploadQuality.js')

let passed = 0
const ok = (name) => {
  passed += 1
  console.log(`  ✓ ${name}`)
}

const LEASE_TEXT = [
  '房屋租赁合同',
  '第一条 房屋基本情况',
  '甲方（出租人）：张三，身份证号 420106199001011234，联系电话 13800138000。',
  '乙方（承租人）：李四，身份证号 420106199505054321。',
  '房屋坐落于洪山区珞喻路 100 号 3 栋 2 单元 501 室，建筑面积 89 平方米。',
  '第二条 租赁期限',
  '租赁期限自 2026 年 3 月 1 日起至 2027 年 2 月 28 日止，共计 12 个月。',
  '第三条 租金及支付方式',
  '月租金为人民币 3000 元整，押金为人民币 6000 元整，押一付三，提前七日支付。',
  '第四条 房屋维修',
  '房屋及附属设施的自然损坏由甲方负责维修，因乙方使用不当造成的损坏由乙方承担。',
  '第五条 合同解除',
  '任何一方提前解除合同，应提前三十日书面通知对方，并向对方支付一个月租金作为违约金。',
  '第六条 争议解决',
  '双方因履行本合同发生争议，应协商解决；协商不成的，可向房屋所在地人民法院提起诉讼。',
].join('\n')

const allText = (quality) =>
  [quality.warn, quality.footerHint, ...(quality.checks || []).map((c) => `${c.title}${c.detail}`)]
    .join(' ')
    .replace(/\s+/g, '')

// 1. PDF：没有任何 OCR 语言
{
  const quality = qualityForFile({ text: LEASE_TEXT, source: 'PDF', pageCount: 5 })

  assert.equal(quality.mode, 'text')
  assert.equal(quality.pagesCountLabel, '共 5 页', '页数要用 pdf 的真实页数，不能拿字数估算')
  assert.equal(quality.advice.length, 0, 'PDF 不该出现「补拍」这类补救办法')
  assert.ok(
    !quality.checks.some((check) => check.key === 'ocr'),
    'PDF 不该有「文字识别率」这一项',
  )

  const sourceCheck = quality.checks.find((check) => check.key === 'source')
  assert.ok(sourceCheck, 'PDF 应改为说明「文字来源」')
  assert.match(sourceCheck.detail, /文字层/)

  const text = allText(quality)
  for (const forbidden of ['识别率', '反光', '重拍', '置信度']) {
    assert.ok(!text.includes(forbidden), `PDF 场景不该出现「${forbidden}」，实际文案：${text}`)
  }

  assert.ok(quality.previewText.length > 20, 'PDF 应给一段提取预览，让用户确认没有串行')
  ok('PDF：不出现识别率 / 反光 / 重拍')
}

// 2. 图片 OCR 低置信度：识别率成立，且给出重拍建议
{
  const quality = qualityForFile({ text: LEASE_TEXT, source: '图片 OCR', confidence: 61 })

  assert.equal(quality.mode, 'ocr')
  assert.equal(quality.pages.length, 1, '一张照片就是一页')
  assert.equal(quality.pages[0].state, 'retake')

  const ocrCheck = quality.checks.find((check) => check.key === 'ocr')
  assert.ok(ocrCheck, '拍照必须有「文字识别率」')
  assert.equal(ocrCheck.status, 'warn')
  assert.equal(ocrCheck.badge, '61%')
  assert.deepEqual(ocrCheck.bar, { value: 61 })
  assert.equal(quality.advice.length, 3)
  assert.ok(quality.advice.some((item) => item.kind === 'retake'))
  ok('拍照 61%：给出识别率与重拍建议')
}

// 3. 图片 OCR 高置信度：不制造焦虑
{
  const quality = qualityForFile({ text: LEASE_TEXT, source: '图片 OCR', confidence: 92 })
  const ocrCheck = quality.checks.find((check) => check.key === 'ocr')
  assert.equal(ocrCheck.status, 'ok')
  assert.equal(quality.advice.length, 0, '识别正常时不该劝人重拍')
  assert.equal(quality.pages[0].state, 'ok')
  ok('拍照 92%：正常通过，不催重拍')
}

// 4. TXT / 粘贴：没有页的概念，不编页数
{
  const quality = qualityForFile({ text: LEASE_TEXT, source: 'TXT / MD' })

  assert.equal(quality.mode, 'plain')
  assert.deepEqual(quality.pages, [], '纯文本不该有逐页缩略图')
  assert.equal(quality.pagesCountLabel, '', '纯文本不该报页数')
  assert.equal(quality.advice.length, 0)

  const text = allText(quality)
  for (const forbidden of ['识别率', '反光', '重拍', '置信度']) {
    assert.ok(!text.includes(forbidden), `纯文本场景不该出现「${forbidden}」`)
  }
  ok('TXT：无页数、无识别语言')
}

// 5. 非租房合同要点出来，而不是硬着头皮审
{
  const quality = qualityForFile({
    text: '劳动合同\n甲方：某某科技有限公司\n乙方：王某\n岗位：前端开发。月薪 15000 元，试用期三个月。'.repeat(6),
    source: 'PDF',
    pageCount: 2,
  })
  const typeCheck = quality.checks.find((check) => check.key === 'type')
  assert.equal(typeCheck.status, 'warn')
  assert.equal(quality.notLease, true)
  ok('非租房合同：合同类型项标黄')
}

// 6. 字数太少要说明，不假装完整
{
  const quality = qualityForFile({ text: '房屋租赁合同 甲方 李四', source: 'PDF', pageCount: 1 })
  const integrity = quality.checks.find((check) => check.key === 'integrity')
  assert.equal(integrity.status, 'warn')
  assert.match(integrity.detail, /偏少/)
  ok('字数过少：完整性标黄')
}

// 7. 隐私统计按真实内容算，没有就不硬报
{
  const withPii = qualityForFile({ text: LEASE_TEXT, source: 'PDF', pageCount: 5 })
  const privacy = withPii.checks.find((check) => check.key === 'privacy')
  assert.match(privacy.detail, /2 个身份证号/)
  // 文本里只有一个手机号。18 位身份证号内含形似手机号的子串，
  // 这里同时锁住「不能把身份证号算成手机号」这条边界。
  assert.match(privacy.detail, /1 个手机号/)

  const noPii = qualityForFile({ text: '租赁合同\n'.repeat(80), source: 'TXT / MD' })
  const privacy2 = noPii.checks.find((check) => check.key === 'privacy')
  assert.match(privacy2.detail, /没有检测到/)
  ok('隐私脱敏：按真实命中数说话')
}

// 8. looksLikeLease 仍然可用（被 App 用来填 meta.type）
{
  assert.equal(looksLikeLease(LEASE_TEXT), true)
  assert.equal(looksLikeLease('这是一份软件开发外包协议'), false)
  ok('租赁识别关键词')
}

console.log(`\n上传质检测试：${passed} 组全部通过`)
