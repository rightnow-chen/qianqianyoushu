import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
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
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto(base, { waitUntil: 'networkidle' });

const route = page.locator('.proposal-demo-route');
await route.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await route.screenshot({ path: 'shot-demo-route.png' });

const head = await page.locator('#proposal-demo-route-title').innerText();
const steps = await page.locator('.proposal-route-step h3').allInnerTexts();
const fast = await page.locator('.proposal-route-fast strong').allInnerTexts();
const btns = await page.locator('.proposal-route-step button').allInnerTexts();
console.log('标题:', head);
console.log('完整路线步骤:', JSON.stringify(steps));
console.log('按钮:', JSON.stringify(btns));
console.log('快速路线:', JSON.stringify(fast));
console.log('errors:', errors.length ? errors.slice(0, 5) : '(none)');
await browser.close();
server.close();
