import assert from 'node:assert/strict'
import fs from 'node:fs'

const appSource = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8')
const artifactSource = fs.readFileSync(new URL('../../src/components/ArtifactPreview.jsx', import.meta.url), 'utf8')
const draftUrl = new URL('../../src/components/RevisionDraftPanel.jsx', import.meta.url)
const draftSource = fs.existsSync(draftUrl) ? fs.readFileSync(draftUrl, 'utf8') : ''

assert.equal(appSource.includes('谈判要点卡'), false, '审合同页不应再展示谈判要点卡')
assert.equal(appSource.includes("setArtifactPreview('card')"), false, '审合同页不应再打开谈判要点卡预览')
assert.equal(appSource.includes('合同文件'), true, '审合同页应提供合同文件入口')
assert.equal(appSource.includes('<RevisionDraftPanel'), true, '谈判台应挂载修订草案产物区')
assert.equal(appSource.includes('已写入内容可在下方修订草案中查看和导出。'), false, '审合同页不应暗示修订草案就在当前页下方')
assert.equal(appSource.includes('谈判台下方修订草案中查看和导出'), true, '审合同页应把修订草案引导到谈判台')
assert.equal(artifactSource.includes("kind === 'card'"), false, '批注版合同预览不应再支持谈判要点卡模式')
assert.equal(draftSource.includes('修订草案'), true, '修订草案产物区应明确标注名称')
assert.equal(draftSource.includes('下载优化合同 DOCX'), true, '修订草案产物区应保留 DOCX 导出')

console.log('contract layout tests passed')
