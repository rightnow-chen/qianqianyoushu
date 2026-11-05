import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n')

assert.match(
  appSource,
  /useState\(restoredNegotiationSession\?\.contractText \?\? ''\)/,
  '开始审查时不应默认载入演示合同',
)
assert.match(
  appSource,
  /const prepareReviewDemo = \(\) => \{[\s\S]*?replaceContractText\(contract\.text, \{[\s\S]*?\}\)[\s\S]*?setContractViewMode\('review'\)/,
  '真实案例应载入合同后直接展示审查结果',
)
assert.match(
  appSource,
  /const enterModuleFromCard = \(tab\) => \{[\s\S]*?if \(tab === 'contract'\) \{[\s\S]*?replaceContractText\(''\)[\s\S]*?setContractTouched\(false\)/,
  '开始审查时应清空上一次保存的合同',
)

console.log('proposal entry tests passed')
