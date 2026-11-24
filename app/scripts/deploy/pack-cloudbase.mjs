// 打包 CloudBase HTTP 云函数：把 app/server 复制进 cloudfunctions/api/server，
// 并生成一份只含生产依赖的 package.json。源码只在 app/server 维护一份，
// 这个脚本是唯一同步点，避免两边改漏。
//
// 用法：node scripts/deploy/pack-cloudbase.mjs
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const serverSrc = path.join(appRoot, 'server')
const fnDir = path.join(appRoot, 'cloudfunctions', 'api')
const serverDst = path.join(fnDir, 'server')

// 只在函数里真正用到的生产依赖。前端/构建/测试依赖不进函数，减小体积、加快冷启动。
const rootPkg = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8'))
const fnDeps = [
  'cors',
  'dotenv',
  'express',
  'multer',
  'mammoth',
  'pdfjs-dist',
  'docx',
  'tesseract.js',
  '@tesseract.js-data/chi_sim',
  '@tesseract.js-data/eng',
]
const pickedDeps = {}
for (const name of fnDeps) {
  if (rootPkg.dependencies?.[name]) pickedDeps[name] = rootPkg.dependencies[name]
  else console.warn(`[pack] 警告：package.json 里没有依赖 ${name}，跳过`)
}

rmSync(serverDst, { recursive: true, force: true })
mkdirSync(fnDir, { recursive: true })
cpSync(serverSrc, serverDst, { recursive: true })

const fnPkg = {
  name: 'signahead-api',
  private: true,
  version: '0.0.0',
  type: 'module',
  description: 'CloudBase HTTP function for signahead /api routes',
  scripts: { start: 'node index.mjs' },
  dependencies: pickedDeps,
}
writeFileSync(path.join(fnDir, 'package.json'), `${JSON.stringify(fnPkg, null, 2)}\n`)

console.log('[pack] 完成：server 已同步到 cloudfunctions/api/server')
console.log(`[pack] 函数依赖 ${Object.keys(pickedDeps).length} 个：${Object.keys(pickedDeps).join(', ')}`)
console.log('[pack] 下一步：确认 .env 里的 DEEPSEEK_API_KEY 已配到 CloudBase 环境变量，再部署函数')
