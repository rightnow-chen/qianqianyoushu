// 核心流程走查：审合同 → 谈判台 → 签约建议
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'portfolio-shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  let fp = path.join(DIST, p);
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
console.log('server on', base);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

async function shot(name, full = false) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  console.log('shot:', name);
}
const snap = () => page.evaluate(() => {
  const txts = [];
  document.querySelectorAll('button, a, [role="button"], summary, h1, h2, h3').forEach(el => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const r = el.getBoundingClientRect();
    if (t && r.width > 0 && r.height > 0) txts.push(`${el.tagName}:${t}`);
  });
  return [...new Set(txts)].slice(0, 60).join(' | ');
});

await page.goto(base, { waitUntil: 'networkidle' });

// 进审合同
for (const sel of ['text=开始体验合同审查', 'text=查看完整合同', 'text=审合同']) {
  const el = page.locator(sel).first();
  if (await el.count()) { await el.click(); console.log('clicked', sel); break; }
}
await shot('10-review-entry');
console.log('REVIEW:', await snap());

await browser.close();
server.close();
console.log('--- errors ---');
console.log(errors.length ? errors.slice(0, 8).join('\n') : '(none)');
