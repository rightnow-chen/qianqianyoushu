// 作品集评审用：全流程截图脚本
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
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
console.log('server on', base);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

async function shot(name, full = false) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  console.log('shot:', name);
}

await page.goto(base, { waitUntil: 'networkidle' });
await shot('01-home', true);

// 打开 AI 助手（悬浮按钮）
try {
  const fab = page.locator('button[aria-label*="助手"], .assistant-fab, .ai-fab').first();
  if (await fab.count()) { await fab.click(); await shot('02-assistant'); }
} catch (e) { console.log('assistant skip', e.message); }

console.log('--- console errors ---');
console.log(errors.length ? errors.slice(0, 10).join('\n') : '(none)');

await browser.close();
server.close();
