import { defineConfig } from '@playwright/test'

// 旧 IA（侧栏 / 使用总览 / 谈判台 / 预算通勤 / 自由 AI 对话）的 Playwright 用例。
// 这 5 个用例断言的是旧界面的选择器（.nav-list、.proposal-route-step、补贴匹配、入住验房…），
// MVP v0.1 重装 IA 后必然失败，因此从默认门槛 `tests/e2e/` 移出，单独用本配置运行。
//
//   npx playwright test --config=playwright.legacy.config.js
//
// 需要还原旧界面现场：git checkout legacy-ia
export default defineConfig({
  testDir: './tests/e2e-legacy',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
