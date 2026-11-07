import fs from 'node:fs'
import path from 'node:path'
const root = process.cwd()
const exts = ['', '.js', '.jsx', '.mjs', '.css', '/index.js', '/index.jsx']
const glob = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(root, dir || '.'), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.cache'].includes(e.name)) continue
    const rel = dir ? `${dir}/${e.name}` : e.name
    if (e.isDirectory()) glob(rel, out)
    else if (/\.(jsx?|mjs|css)$/.test(e.name)) out.push(rel)
  }
  return out
}
const all = glob('')
const entries = all.filter((f) => /^(src\/main\.jsx|server\/.*\.mjs|scripts\/.*\.mjs|tests\/unit\/.*\.mjs|tests\/e2e\/.*|vite\.config\.js|playwright\.config\.js)$/.test(f))
const seen = new Set()
const stack = [...entries]
while (stack.length) {
  const file = stack.pop()
  if (seen.has(file)) continue
  seen.add(file)
  let code = ''
  try { code = fs.readFileSync(path.join(root, file), 'utf8') } catch { continue }
  const re = /(?:from\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(code))) {
    const spec = m[1]
    if (!spec.startsWith('.')) continue
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec))
    const hit = exts.map((x) => base + x).find((c) => fs.existsSync(path.join(root, c)))
    if (hit) stack.push(hit)
  }
}
const dead = all.filter((f) => f.startsWith('src/') && !seen.has(f))
console.log('入口数:', entries.length, '| 可达:', seen.size, '| src 总数:', all.filter(f=>f.startsWith('src/')).length)
console.log('--- 不可达（删除候选） ---')
dead.sort().forEach((f) => console.log(String(fs.readFileSync(path.join(root, f), 'utf8').split('\n').length).padStart(6), f))
console.log('合计行数:', dead.reduce((s,f)=>s+fs.readFileSync(path.join(root,f),'utf8').split('\n').length,0))
