import { expect, test } from '@playwright/test'

const contract = '房屋租赁合同。乙方未在4小时内回复，视为同意入户。'
const completion = (content, finish_reason = 'stop') => ({ choices: [{ finish_reason, message: { content } }] })

for (const [name, data] of [
  ['output exhausted', completion('', 'length')],
  ['broken JSON', completion('{"risks":[')],
  ['empty answer', completion('')],
]) {
  test(`review shows incomplete instead of zero-risk success: ${name}`, async ({ page }) => {
    await page.route('**/api/rag/search', route => route.fulfill({ json: { items: [] } }))
    await page.route('**/api/ai/chat', route => route.fulfill({ json: data }))
    await page.goto('/?module=contract')
    await page.getByPlaceholder(/在这里粘贴租房合同正文/).fill(contract)
    await page.getByRole('button', { name: '检查这份合同', exact: true }).click()
    await expect(page.locator('.summary-card')).toContainText('审查未完成')
    await expect(page.locator('.summary-card')).not.toContainText('已识别 0 处风险点')
    await expect(page.getByLabel('风险暂未评分')).toBeVisible()
    await page.locator('.history-panel summary').click()
    await expect(page.getByRole('button', { name: '保存当前', exact: true })).toBeDisabled()
    await expect(page.locator('.empty-findings')).toContainText('不能据此判断合同安全')
  })
}

test('retry clears failure only after a valid complete review', async ({ page }) => {
  let calls = 0
  await page.route('**/api/rag/search', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/api/ai/chat', route => route.fulfill({ json: ++calls === 1
    ? completion('', 'length')
    : completion(JSON.stringify({ risks: [{ title: '默认同意入户', level: 'medium', evidence: '乙方未在4小时内回复，视为同意入户。', explain: '回复期限过短', suggestion: '要求明确同意', replacement: '入户前应取得乙方明确同意。' }] })) }))
  await page.goto('/?module=contract')
  await page.getByPlaceholder(/在这里粘贴租房合同正文/).fill(contract)
  await page.getByRole('button', { name: '检查这份合同', exact: true }).click()
  await expect(page.locator('.summary-card')).toContainText('审查未完成')
  await page.getByRole('button', { name: '重新审查', exact: true }).click()
  await expect(page.locator('.summary-card')).toContainText('已识别 1 处风险点')
  await expect(page.locator('.finding-title')).toContainText('默认同意入户')
})

test('unverifiable findings retain valid leads without claiming a complete review', async ({ page }) => {
  const risk = { title: '默认同意入户', level: 'medium', evidence: '乙方未在4小时内回复，视为同意入户。', explain: '回复期限过短', suggestion: '要求明确同意' }
  await page.route('**/api/rag/search', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/api/ai/chat', route => route.fulfill({ json: completion(JSON.stringify({ risks: [risk, { ...risk, title: '错误证据', evidence: '本合同不存在的条文' }] })) }))
  await page.goto('/?module=contract')
  await page.getByPlaceholder(/在这里粘贴租房合同正文/).fill(contract)
  await page.getByRole('button', { name: '检查这份合同', exact: true }).click()
  await expect(page.locator('.summary-card')).toContainText('审查未完成')
  await expect(page.locator('.finding-title')).toHaveCount(1)
  await expect(page.locator('.finding-title')).toContainText('默认同意入户')
  await expect(page.getByLabel('风险暂未评分')).toBeVisible()
})

test('proxy failures expose the actionable server message', async ({ page }) => {
  await page.route('**/api/rag/search', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/api/ai/chat', route => route.fulfill({ status: 502, json: { message: '上游 AI 请求失败（HTTP 401）' } }))
  await page.goto('/?module=contract')
  await page.getByPlaceholder(/在这里粘贴租房合同正文/).fill(contract)
  await page.getByRole('button', { name: '检查这份合同', exact: true }).click()
  await expect(page.locator('.status-toast')).toContainText('上游 AI 请求失败（HTTP 401）')
})
