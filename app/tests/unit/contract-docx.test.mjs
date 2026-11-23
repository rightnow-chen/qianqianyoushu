// 合同导出（V0.2）：修订版 / 批注版的纯逻辑与 docx 产物
// 跑法：node tests/unit/contract-docx.test.mjs
import assert from 'node:assert/strict'
import { buildCommentDocxBlob, buildRevisionDocxBlob, composeRevision, locateQuote, planComments } from '../../src/features/contractDocx.js'
import { resolveProfile, classifyLine } from '../../src/features/contractDocxLayout.js'

const CONTRACT = `房屋租赁合同
第一条　房屋基本情况
甲方将坐落于北京市朝阳区建国路 88 号院 3 号楼 2 单元 1102 室的房屋出租给乙方居住使用。
第二条　租赁期限
租赁期限自 2026 年 12 月 1 日起至 2027 年 11 月 30 日止，共计 12 个月。
第四条　押金
2. 退租时需扣除全屋保洁费，标 准 由 甲 方 核 定。
5. 甲方有权在租赁期内每年上调租金 8%，乙方不得拒绝。
`

const RISKS = [
  {
    id: 'r1',
    level: 'must',
    cat: '押金',
    title: '押金：退租时扣除「全屋保洁费」',
    original: '退租时需扣除全屋保洁费，标准由甲方核定。',
    suggestion: '退租时房屋保持交付时状态即可，如另有保洁需求，费用不超过 300 元且需双方现场确认。',
    consequence: '押金可被任意扣除。',
    law: { name: '《民法典》第七百一十条', version: '2021 施行' },
  },
  {
    id: 'r5',
    level: 'check',
    cat: '租金',
    title: '涨租：每年自动上调 8%',
    original: '甲方有权在租赁期内每年上调租金 8%，乙方不得拒绝。',
    suggestion: '租赁期内租金不变；续租时调价由双方另行协商。',
    consequence: '每年多付约 ¥4,320。',
    law: { name: '《民法典》第七百零四条', version: '2021 施行' },
  },
  {
    id: 'rx',
    level: 'note',
    cat: '附件',
    title: '设施清单未附',
    original: '附件一《家具家电清单》未随本合同附上。', // 原文里没有 → 必须报 not-found
    suggestion: '签约时双方现场清点并附清单。',
    consequence: '退租时无法举证。',
    law: { name: '《民法典》第七百零八条', version: '2021 施行' },
  },
]

// 1. 忽略空白的定位：OCR 把「标准由甲方核定」识别成了「标 准 由 甲 方 核 定」
{
  const hit = locateQuote(CONTRACT, '退租时需扣除全屋保洁费，标准由甲方核定。')
  assert.ok(hit, '应当能在带多余空格的原文里定位到原句')
  assert.equal(CONTRACT.slice(hit.start, hit.end).replace(/\s/g, ''), '退租时需扣除全屋保洁费，标准由甲方核定。')
}

// 2. 完全找不到的句子返回 null，而不是乱猜
{
  assert.equal(locateQuote(CONTRACT, '本合同一式两份。'), null)
}

// 3. 修订版只替换「已采纳」的，没采纳的逐条说明原因
{
  const composed = composeRevision(CONTRACT, RISKS, { accepted: { r1: true } })
  assert.equal(composed.appliedCount, 1, '只应替换 1 处')
  assert.ok(composed.text.includes('费用不超过 300 元'), '替换文本应写进正文')
  assert.ok(!composed.text.includes('标 准 由 甲 方 核 定'), '被替换的原句不该残留')
  assert.ok(composed.text.includes('每年上调租金 8%'), '未采纳的条款应保持原文')

  const byId = Object.fromEntries(composed.changes.map((item) => [item.id, item]))
  assert.equal(byId.r1.reason, 'applied')
  assert.equal(byId.r5.reason, 'not-accepted')
  assert.equal(byId.rx.reason, 'not-found')
}

// 4. 用户改过的建议文本优先于默认建议
{
  const composed = composeRevision(CONTRACT, RISKS, {
    accepted: { r1: true },
    edited: { r1: '退租时按实际损坏结算，保洁费最多 200 元。' },
  })
  assert.ok(composed.text.includes('最多 200 元'))
  assert.ok(!composed.text.includes('不超过 300 元'))
}

// 5. 段落没丢：替换后行数应与原文一致（替换是就地替换，不增删行）
{
  const composed = composeRevision(CONTRACT, RISKS, { accepted: { r1: true, r5: true } })
  assert.equal(composed.text.split('\n').length, CONTRACT.split('\n').length)
}

// 6. 批注版：原文一字不动，锚点覆盖全部能定位的条目
{
  const plan = planComments(CONTRACT, RISKS)
  assert.equal(plan.anchors.length, 2, '两条能定位，一条定位不到')
  assert.equal(plan.missing.length, 1)
  assert.equal(plan.missing[0].id, 'rx')
  assert.equal(
    plan.segments.map((item) => item.text).join(''),
    CONTRACT,
    '批注版正文必须与原文逐字一致',
  )
}

// 6b. 只导出勾选的批注：selected 决定挂哪几条，没勾的不挂（用户点「添加批注」的语义）
{
  const plan = planComments(CONTRACT, RISKS, { selected: { r1: true } })
  assert.equal(plan.anchors.length, 1, '只勾了一条就只挂一条批注')
  assert.equal(plan.anchors[0].risk.id, 'r1')
  const none = planComments(CONTRACT, RISKS, { selected: {} })
  assert.equal(none.anchors.length, 0, '一条都没勾就不该有批注')
  assert.equal(
    plan.segments.map((item) => item.text).join(''),
    CONTRACT,
    '按勾选筛选后正文仍是原文',
  )
}

// 7. 两条风险指向同一句时，批注只留一条，另一条进 missing（overlap）
{
  const duplicated = [RISKS[0], { ...RISKS[1], id: 'dup', original: RISKS[0].original }]
  const plan = planComments(CONTRACT, duplicated)
  assert.equal(plan.anchors.length, 1)
  assert.ok(plan.missing.some((item) => item.id === 'dup' && item.reason === 'overlap'))
}

// 8. 真正生成 docx：批注版挂 Word 原生批注，修订版用红色下划线并在正文里替换
{
  const JSZip = (await import('jszip')).default
  const readPart = async (blob, name) => {
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
    const file = zip.file(name)
    return file ? file.async('string') : null
  }

  const commentDoc = await buildCommentDocxBlob({ text: CONTRACT, risks: RISKS, meta: { fileName: '测试合同.txt' } })
  const commentXml = await readPart(commentDoc.blob, 'word/comments.xml')
  const commentBody = await readPart(commentDoc.blob, 'word/document.xml')
  assert.ok(commentXml?.includes('w:comment'), '批注版必须生成 comments.xml')
  assert.ok(commentXml.includes('费用不超过 300 元'), '批注内容要带上建议改为')
  assert.ok(commentBody.includes('commentReference'), '正文要挂上批注引用')
  assert.ok(commentBody.includes('标 准 由 甲 方 核 定'), '批注版正文必须是原文，含 OCR 多余空格也照原样保留')

  const revisionDoc = await buildRevisionDocxBlob({
    text: CONTRACT,
    risks: RISKS,
    accepted: { r1: true },
    meta: { fileName: '测试合同.txt' },
  })
  const revisionBody = await readPart(revisionDoc.blob, 'word/document.xml')
  assert.equal(revisionDoc.composed.appliedCount, 1)
  assert.ok(revisionBody.includes('费用不超过 300 元'), '替换后的文字要写进正文')
  assert.ok(!revisionBody.includes('标 准 由 甲 方 核 定'), '被替换掉的原句不该留在正文里')
  assert.ok(/<w:u [^>]*\/>|<w:u\/>/.test(revisionBody), '替换段要有下划线')
  assert.ok(!revisionBody.includes('commentReference'), '修订版不该出现批注引用')
}

// 9. 版式：按来源派生骨架
{
  assert.equal(resolveProfile({ fileKind: 'DOCX' }), 'preserve', 'Word 保留原件结构')
  assert.equal(resolveProfile({ fileKind: 'PDF' }), 'preserve', 'PDF 保留原件结构')
  assert.equal(resolveProfile({ fileKind: 'TXT' }), 'template', '文本套示范文本骨架')
  assert.equal(resolveProfile({ fileKind: 'PNG' }), 'template', '图片 OCR 套示范文本骨架')
  assert.equal(resolveProfile({ isDemo: true, fileKind: 'PDF' }), 'template', '演示数据一律展示规范骨架')
  assert.equal(classifyLine('合同编号：CY-2026-1102'), 'contractNo')
  assert.equal(classifyLine('房屋租赁合同'), 'title')
  assert.equal(classifyLine('出租人（甲方）：李××'), 'party')
  assert.equal(classifyLine('第一条　房屋基本情况'), 'heading')
  assert.equal(classifyLine('甲方将房屋出租给乙方。'), 'body')
}

// 10. 两版排版一致：页边距 / 页眉页码 / 段样式同一套；页码字段齐全
{
  const JSZip = (await import('jszip')).default
  const read = async (blob, name) => {
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
    return zip.file(name)?.async('string') || null
  }
  const commentDoc = await buildCommentDocxBlob({ text: CONTRACT, risks: RISKS, selected: { r1: true }, meta: { fileName: 'x.txt' } })
  const revisionDoc = await buildRevisionDocxBlob({ text: CONTRACT, risks: RISKS, accepted: { r1: true }, meta: { fileName: 'x.txt' } })

  const cBody = await read(commentDoc.blob, 'word/document.xml')
  const rBody = await read(revisionDoc.blob, 'word/document.xml')
  const cMargin = cBody.match(/<w:pgMar[^>]*\/>/)?.[0]
  const rMargin = rBody.match(/<w:pgMar[^>]*\/>/)?.[0]
  assert.ok(cMargin && rMargin, '两版都必须写页边距')
  assert.equal(cMargin, rMargin, '批注版与修订版页边距必须一致')

  const cFooter = await read(commentDoc.blob, 'word/footer1.xml')
  const rFooter = await read(revisionDoc.blob, 'word/footer1.xml')
  assert.ok(cFooter?.includes('PAGE') && cFooter.includes('NUMPAGES'), '页脚必须有「第 X 页 / 共 Y 页」字段')
  assert.equal(cFooter, rFooter, '两版页脚页码必须一致')

  const cHeader = await read(commentDoc.blob, 'word/header1.xml')
  const rHeader = await read(revisionDoc.blob, 'word/header1.xml')
  assert.ok(cHeader?.includes('批注版') && rHeader?.includes('修订版'), '页眉标注各自版本')
  assert.equal(cHeader.replace('批注版', 'X'), rHeader.replace('修订版', 'X'), '两版页眉除版本名外必须一致')
}

// 11. 两种骨架：template 不重复标题（原文自带 title 行只出现一次）；preserve 保留原文编号、不套封面
{
  const JSZip = (await import('jszip')).default
  const textsOf = async (blob) => {
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
    const xml = await zip.file('word/document.xml').async('string')
    return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1])
  }
  // template（演示/文本/图片）：封面不重复写「房屋租赁合同」。
  // CONTRACT 原文自带 1 行标题，导出后应恰好 1 次；封面只放版本标记，不额外造标题。
  const tpl = await buildRevisionDocxBlob({
    text: CONTRACT,
    risks: RISKS,
    accepted: { r1: true },
    meta: { fileName: 'x.txt' },
    profile: 'template',
  })
  const tt = await textsOf(tpl.blob)
  assert.equal(tt.filter((t) => t === '房屋租赁合同').length, 1,
    '标题只保留正文自带的 1 行，封面不得再重复一个')
  assert.ok(tt.some((t) => t === '（修订版）'), 'template 封面用版本标记代替重复标题')

  // preserve（Word/PDF）：保留原文自带的合同编号，标题不额外重复
  const raw = '合同编号：HT-001\n房屋租赁合同\n第一条 房屋基本情况\n甲方将房屋出租给乙方。\n'
  const pres = await buildRevisionDocxBlob({
    text: raw,
    risks: [{ id: 'x', level: 'note', cat: '其他', title: 't', original: '甲方将房屋出租给乙方。', suggestion: '改', consequence: 'c' }],
    accepted: { x: true },
    meta: { fileName: '原件.docx' },
    profile: 'preserve',
  })
  const pt = await textsOf(pres.blob)
  assert.ok(pt.includes('合同编号：HT-001'), 'preserve 必须保留原文自带的合同编号')
  assert.equal(pt.filter((t) => t === '房屋租赁合同').length, 1, 'preserve 不套封面，标题只保留原文的 1 处')
  assert.ok(pt.some((t) => t.includes('原件.docx')), 'preserve 用文件名作小标题，便于对照原件')
}

console.log('contract-docx: 全部断言通过（定位 2 / 修订 3 / 批注 2 / 产物 1 / 版式 2 / 骨架 1）')
