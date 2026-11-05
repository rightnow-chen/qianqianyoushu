// 验证：签约判断页可达性 + 四步流程完整走查
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
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

// A. URL 直达 ?module=verdict —— 验证别名问题
await page.goto(base + '/?module=verdict', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const urlLandsOn = await page.evaluate(() => document.querySelector('.nav-item.active, .nav-list .active')?.textContent?.trim() || 'unknown');
const hasDecision = await page.locator('.decision-result').count();
console.log('A. ?module=verdict → active nav:', urlLandsOn, '| decision-result count:', hasDecision);

// B. 演示案例进入后，找所有跳转签约判断的出口
await page.goto(base + '/?module=proposal', { waitUntil: 'networkidle' });
await page.locator('.proposal-secondary-action', { hasText: '看一个真实案例' }).click();
await page.waitForTimeout(1200);

const ctaScan = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, a').forEach(el => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (/签约|判断|建议|结论/.test(t) && t.length < 30) out.push(t);
  });
  return out;
});
console.log('B. 审合同页里带签约/判断字样的可点击项:', JSON.stringify(ctaScan));

// C. 滚到合同页底部看 CTA
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, '12-review-bottom.png') });
const bottomBtns = await page.evaluate(() => [...document.querySelectorAll('.step-cta button, .step-cta a, button[class*="cta"]')].map(b => b.textContent.trim()));
console.log('C. 底部CTA:', JSON.stringify(bottomBtns));

// D. 尝试点这些 CTA
for (const sel of ['.step-cta button', 'button:has-text("签约")']) {
  const el = page.locator(sel).first();
  if (await el.count()) {
    await el.click().catch(() => {});
    await page.waitForTimeout(1000);
    const nowDecision = await page.locator('.decision-result').count();
    console.log('D. 点击', sel, '→ decision-result:', nowDecision, '| url:', page.url());
    if (nowDecision) {
      await page.screenshot({ path: path.join(OUT, '30-decision.png'), fullPage: true });
      break;
    }
  }
}

console.log('errors:', errors.length ? errors.join('\n') : '(none)');
await browser.close();
server.close();
