// 合同导入的边界与兼容性测试。
// 重点守两条：
// 1) PDF 必须走 pdfjs-dist 的 legacy 构建 —— 标准构建依赖 Uint8Array.prototype.toHex，
//    在 Chrome/Edge < 133、部分国产浏览器与微信内置浏览器里不存在，
//    表现为上传 PDF 时抛 `hashOriginal.toHex is not a function`（用户看到的是这句英文）。
// 2) 底层解析库抛出的技术异常不能直接弹给用户，必须收敛成一句人话。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, '../..')

const { extractContractTextFromFile, ContractImportError } = await import('../../src/utils/fileImport.js')

let passed = 0
const ok = (name) => {
  passed += 1
  console.log(`  ✓ ${name}`)
}

const makeFile = (name, content, type = 'text/plain') => new File([content], name, { type })

// 1. TXT 正常读取（不影响既有能力）
{
  const file = makeFile('合同.txt', '第一条 房屋基本情况\n甲方（出租人）：张三\n月租金人民币 3000 元整。')
  const result = await extractContractTextFromFile(file)
  assert.equal(result.source, 'TXT / MD')
  assert.ok(result.text.includes('房屋基本情况'), 'TXT 应能正常读出正文')
  ok('TXT 正常解析')
}

// 2. 超过 8MB 先拦下，不进解析
{
  const file = makeFile('big.pdf', new Uint8Array(9 * 1024 * 1024))
  await assert.rejects(
    () => extractContractTextFromFile(file),
    (error) => {
      assert.ok(error instanceof ContractImportError, '应是可读错误')
      assert.match(error.message, /8MB/)
      return true
    },
  )
  ok('超大文件被拦下')
}

// 3. 不支持的格式给出支持列表，而不是默认失败
{
  const file = makeFile('virus.exe', 'x', 'application/octet-stream')
  await assert.rejects(
    () => extractContractTextFromFile(file),
    (error) => {
      assert.ok(error instanceof ContractImportError)
      assert.match(error.message, /TXT、MD、DOCX、PDF/)
      return true
    },
  )
  ok('不支持的格式给出支持清单')
}

// 4. PDF 解析失败必须转成中文人话，不能泄露底层英文异常
//    （在 Node 里 pdfjs 无法完整工作，这里正好当作「底层炸了」的场景）
{
  const file = makeFile('broken.pdf', '%PDF-1.4 这不是一个真的 PDF', 'application/pdf')
  await assert.rejects(
    () => extractContractTextFromFile(file),
    (error) => {
      assert.ok(error instanceof ContractImportError, '底层异常应被包成 ContractImportError')
      assert.match(error.message, /PDF/, '应说明是 PDF 的问题')
      assert.match(error.message, /粘贴/, '应给出下一步动作')
      assert.ok(
        !/toHex|undefined|is not a function|TypeError/i.test(error.message),
        `不能把英文技术异常弹给用户，实际是：${error.message}`,
      )
      return true
    },
  )
  ok('PDF 解析失败转成中文提示')
}

// 5. 静态约束：源码必须引用 legacy 构建
{
  const source = fs.readFileSync(path.join(appRoot, 'src/utils/fileImport.js'), 'utf8')
  assert.ok(
    source.includes('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
    'pdf.worker 必须用 legacy 构建（标准构建缺 Uint8Array.prototype.toHex）',
  )
  assert.ok(
    source.includes("import('pdfjs-dist/legacy/build/pdf.mjs')"),
    '主线程也必须用 legacy 构建',
  )
  assert.ok(
    !/import\('pdfjs-dist'\)/.test(source),
    '不能再用默认入口 pdfjs-dist（会解析到标准构建）',
  )
  ok('pdfjs 引用指向 legacy 构建')
}

// 6. legacy 构建确实自带 toHex polyfill；标准构建没有
{
  const legacyWorker = fs.readFileSync(
    path.join(appRoot, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
    'utf8',
  )
  assert.ok(
    /Uint8Array\.prototype\.toHex/.test(legacyWorker),
    'legacy worker 应包含 toHex 兼容实现',
  )

  const stdWorker = fs.readFileSync(
    path.join(appRoot, 'node_modules/pdfjs-dist/build/pdf.worker.mjs'),
    'utf8',
  )
  const stdHasPolyfill = /Uint8Array\.prototype\.toHex\s*\)?/.test(stdWorker)
  if (stdHasPolyfill) {
    console.log('  ! 标准构建已自带 toHex 兼容，后续升级 pdfjs 时可以切回默认入口')
  }
  ok('legacy worker 含 toHex 兼容实现')
}

// 7. 若已构建，产物里的 worker 也必须是 legacy 版本
{
  const assetsDir = path.join(appRoot, 'dist/assets')
  if (fs.existsSync(assetsDir)) {
    const workers = fs
      .readdirSync(assetsDir)
      .filter((name) => /^pdf\.worker-.*\.mjs$/.test(name))
    if (workers.length) {
      const built = fs.readFileSync(path.join(assetsDir, workers[0]), 'utf8')
      assert.ok(built.includes('Uint8Array.prototype.toHex'), '构建产物里的 pdf worker 应是 legacy 版本')
      ok('构建产物为 legacy worker')
    }
  }
}

console.log(`\n合同导入测试：${passed} 组全部通过`)
