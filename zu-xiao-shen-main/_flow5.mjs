// 采纳建议 → 修订草案 → 导出检查
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const OUT = path.join(__dirname, 'portfolio-shots');
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
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(base + '/?module=proposal', { waitUntil: 'networkidle' });
await page.locator('.proposal-secondary-action', { hasText: '看一个真实案例' }).click();
await page.waitForTimeout(1500);

// 滚到风险点区域，点全部采纳
await page.locator('button:has-text("全部采纳")').first().click().catch(e => console.log('全部采纳 fail', e.message.split('\n')[0]));
await page.waitForTimeout(1500);
const accepted = await page.evaluate(() => {
  const el = document.querySelector('[class*="accepted"], .finding-progress, .summary-numbers');
  return el ? el.textContent.slice(0, 120) : '(none)';
});
console.log('采纳后状态:', accepted.replace(/\s+/g, ' '));
await page.screenshot({ path: path.join(OUT, '60-accepted.png'), fullPage: false });

// 找导出 DOCX 按钮
const exportBtns = await page.evaluate(() => [...document.querySelectorAll('button, a')].map(b => (b.textContent || '').trim()).filter(t => /导出|下载|DOCX|docx/.test(t) && t.length < 30));
console.log('导出相关按钮:', JSON.stringify(exportBtns));
await page.screenshot({ path: path.join(OUT, '61-revision.png'), fullPage: true });

console.log('errors:', errors.length ? errors.join('\n') : '(none)');
await browser.close();
server.close();
