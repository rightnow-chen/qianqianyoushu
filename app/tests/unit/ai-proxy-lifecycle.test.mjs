import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const child = spawn(process.execPath, ['server/ai-proxy.mjs'], {
  cwd: root,
  env: { ...process.env, AI_PROXY_PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk.toString() })
child.stderr.on('data', (chunk) => { output += chunk.toString() })

await new Promise((resolve, reject) => {
  // Windows 冷启动（首次加载 express/pdfjs 等）可能超过 5 秒，留足余量避免假失败
  const timer = setTimeout(() => reject(new Error(`proxy did not start: ${output}`)), 20000)
  // 用累积输出判断，避免启动日志被拆成多个 chunk 时漏判
  child.stdout.on('data', () => {
    if (output.includes('AI proxy listening')) {
      clearTimeout(timer)
      resolve()
    }
  })
  child.once('error', reject)
  child.once('exit', (code, signal) => {
    clearTimeout(timer)
    reject(new Error(`proxy exited before lifecycle check: code=${code} signal=${signal}; ${output}`))
  })
})

await new Promise((resolve) => setTimeout(resolve, 300))
assert.equal(child.exitCode, null, `proxy exited after startup: ${output}`)

child.kill()
