import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'portfolio-shots');
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

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(base + '/?module=proposal', { waitUntil: 'networkidle' });
await page.locator('.proposal-secondary-action', { hasText: '看一个真实案例' }).click();
await page.waitForTimeout(1500);

const btn = page.locator('button:has-text("全部采纳")').first();
await btn.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(400);
await btn.click({ force: true, timeout: 8000 }).catch(e => console.log('click fail:', e.message.split('\n')[0]));
await page.waitForTimeout(1800);

const state = await page.evaluate(() => (document.body.innerText.match(/已采纳[^\n]*/g) || []).slice(0, 4));
console.log('采纳状态:', JSON.stringify(state));
const exports = await page.evaluate(() => [...document.querySelectorAll('button, a')].map(b => (b.textContent || '').trim()).filter(t => /优化合同|修订|解读报告|导出|下载/.test(t) && t.length < 40));
console.log('导出/修订按钮:', JSON.stringify([...new Set(exports)].slice(0, 12)));
await page.screenshot({ path: path.join(OUT, '61-revision.png'), fullPage: false });
await browser.close();
server.close();
console.log('done');
