// 完整四步流程走查
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const OUT = path.join(__dirname, 'portfolio-shots');
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
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  console.log('shot:', name);
}
async function clickFirst(selectors, label) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      try { await el.click({ timeout: 3000 }); console.log('clicked:', label, '<-', sel); return true; } catch (e) { console.log('click fail', sel, e.message.split('\n')[0]); }
    }
  }
  console.log('NOT FOUND:', label);
  return false;
}

await page.goto(base, { waitUntil: 'networkidle' });

// 1. 看一个真实案例
await clickFirst(['text=看一个真实案例'], 'demo case');
await shot('10-review-top');
await shot('11-review-full', true);

// 2. 侧边栏切谈判台
await clickFirst(['text=谈判台'], 'negotiation tab');
await shot('20-negotiation');
console.log('NEG URL:', page.url());

// 3. 签约建议
await clickFirst(['text=签约建议'], 'decision tab');
await shot('30-decision');
await shot('31-decision-full', true);

console.log('--- errors ---');
console.log(errors.length ? errors.slice(0, 8).join('\n') : '(none)');
await browser.close();
server.close();
