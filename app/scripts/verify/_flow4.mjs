// 移动端 + AI 助手检查
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

// AI 助手（桌面）
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base + '/?module=contract', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const aiBtn = page.locator('button:has-text("AI 助手")').first();
if (await aiBtn.count()) {
  await aiBtn.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, '40-ai-assistant.png') });
  console.log('AI assistant shot ok');
} else {
  console.log('AI 助手按钮没找到');
}
await page.close();

// 移动端 390px
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.goto(base, { waitUntil: 'networkidle' });
await m.waitForTimeout(700);
await m.screenshot({ path: path.join(OUT, '50-mobile-home.png'), fullPage: false });
// 移动端审合同
await m.locator('.proposal-primary-action').click().catch(() => {});
await m.waitForTimeout(900);
await m.screenshot({ path: path.join(OUT, '51-mobile-review.png') });
// 横向溢出检查
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('mobile horizontal overflow px:', overflow);

await browser.close();
server.close();
console.log('done');
