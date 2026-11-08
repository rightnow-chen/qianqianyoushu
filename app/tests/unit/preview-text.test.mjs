import assert from 'node:assert/strict'
import { layoutContractLines } from '../../src/features/previewText.js'

// 1) 首行短、无句读 → 标题
{
  const lines = layoutContractLines('房屋租赁合同\n甲方（出租人）：张三\n乙方（承租人）：李四')
  assert.equal(lines[0].type, 'title')
  assert.equal(lines[0].text, '房屋租赁合同')
}

// 2) 「第X条」/「一、」/「（一）」都是条款标题，不能当正文
{
  const lines = layoutContractLines(
    '房屋租赁合同\n第一条　房屋基本情况\n房屋位于洪山区。\n第二条　租金\n月租 2800 元。\n一、押金为一个月的租金。\n（一）退租需提前三十日通知。',
  )
  const clauses = lines.filter((line) => line.type === 'clause').map((line) => line.text)
  assert.ok(clauses.includes('第一条\u3000房屋基本情况'), '第X条应识别为条款标题')
  assert.ok(clauses.includes('第二条\u3000租金'))
  assert.ok(clauses.includes('一、押金为一个月的租金。'))
  assert.ok(clauses.includes('（一）退租需提前三十日通知。'))
  assert.equal(lines.filter((line) => line.type === 'body').length, 2, '只有两句是正文')
}

// 3) 首行很长或带句读 → 不是标题（避免把正文首段当合同名居中）
{
  const long = layoutContractLines('甲乙双方就房屋租赁事宜，根据合同法达成如下协议：')
  assert.notEqual(long[0].type, 'title')
}

// 4) OCR 会把空格塞进汉字之间，排版前要清掉，但换行结构保留
{
  const lines = layoutContractLines('房屋租赁合同\n押 金 为 两 个 月 租 金，退 租 时 退 还。')
  assert.equal(lines[0].text, '房屋租赁合同')
  assert.equal(lines[1].text, '押金为两个月租金，退租时退还。')
  assert.equal(lines.length, 2)
}

// 5) 空文本不崩，返回空数组（由界面给空态文案）
assert.deepEqual(layoutContractLines(''), [])
assert.deepEqual(layoutContractLines(undefined), [])

// 6) 断得散的 OCR 结果：哪怕原文没有换行，条款也要被断开
{
  const lines = layoutContractLines('房屋租赁合同。第一条　租赁期限。租期一年。第二条　租金。月租 2800 元。')
  const clauses = lines.filter((line) => line.type === 'clause')
  assert.equal(clauses.length, 2, '两条条款都要单独成段')
  assert.ok(clauses[0].text.startsWith('第一条'))
  assert.ok(clauses[1].text.startsWith('第二条'))
  assert.ok(lines.length >= 3, '条款断了，正文才不会全挤在首行')
}

console.log('preview-text passed: 标题 / 条款 / 正文三类分段，OCR 空格清理与空输入')
