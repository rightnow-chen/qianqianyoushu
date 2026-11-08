// 生成两份可直接打开检查的合同样张：修订版 / 批注版（演示数据）。
// 用法：node scripts/export-sample-docx.mjs
// 产物：generated-reports/contract-docx/*.docx
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEMO_META, DEMO_PAGES, DEMO_RISKS, getContractText } from '../src/data/demoCase.js'
import { buildCommentDocxBlob, buildRevisionDocxBlob } from '../src/features/contractDocx.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, '../generated-reports/contract-docx')
fs.mkdirSync(outDir, { recursive: true })

const text = getContractText(DEMO_PAGES)
const risks = DEMO_RISKS
// 演示：采纳 3 条「必须改」，其中 r1 用一段自己改过的措辞，验证 edited 优先于默认建议
const accepted = Object.fromEntries(
  risks.filter((risk) => risk.level === 'must').map((risk) => [risk.id, true]),
)
const edited = {
  r1: '退租时房屋保持交付时状态即可，正常使用产生的自然损耗不扣除费用；如另有保洁需求，按实际发生结算，最多 300 元，退租时双方现场确认。',
}

const write = async (name, blob, bytes) => {
  const file = path.join(outDir, name)
  await fs.promises.writeFile(file, Buffer.from(await blob.arrayBuffer()))
  console.log(`${name}  ${(bytes / 1024).toFixed(1)} KB`)
  return file
}

const revision = await buildRevisionDocxBlob({ text, risks, accepted, edited, meta: DEMO_META })
await write('签前有数_合同修订版_样张.docx', revision.blob, (await revision.blob.size) || 0)

const comment = await buildCommentDocxBlob({ text, risks, accepted, meta: DEMO_META })
await write('签前有数_合同批注版_样张.docx', comment.blob, (await comment.blob.size) || 0)

const skipped = revision.composed.changes.filter((item) => !item.applied)
console.log(
  `\n修订版：替换 ${revision.composed.appliedCount} 处，未替换 ${skipped.length} 处（${skipped
    .map((item) => `${item.mark}:${item.reason}`)
    .join(' / ')}）`,
)
console.log(`批注版：${comment.plan.anchors.length} 条批注，未定位 ${comment.plan.missing.length} 条`)
console.log(`输出目录：${outDir}`)
