# tests/e2e-legacy —— 旧 IA 的 Playwright 用例（已移出默认门槛）

这 5 个 `.spec.js` 断言的是**旧界面**（左侧栏 4 模块 + 预算通勤决策 + 自由 AI 对话）的选择器与路由：

| 文件 | 覆盖的旧行为 | 在 MVP v0.1 里的对应物 |
|---|---|---|
| `app.spec.js` | 上传 docx → 使用总览 → 导出报告 | 5 屏流程（`tests/e2e/mvp-flow.mjs`）+ 导出（V0.2 接 `docxExport.js`） |
| `apply-all-review.spec.js` | 「一键应用全部改写」后重新审查 | 风险页「标记已处理」+ 修改页逐条采纳（未做全量应用） |
| `ai-review-failure.spec.js` | 模型输出截断 / JSON 破损时的兜底 | 降级三档（`failed / partial / ok`）+ 非租房合同识别 |
| `module-navigation.spec.js` | 提案路由跳到「补贴匹配」模块顶部 | 无（补贴模块已退场） |
| `resilience.spec.js` | `?module=checkin` 分享链接恢复「入住验房」 | `#work?tab=risk&active=r1` 深链 |

前三条覆盖的是**真实健壮性行为**，不是废代码——重构 IA 时旧界面没了，它们跟着失效，但行为仍需被守住。
重写顺序建议：`ai-review-failure` → `apply-all-review` → `app`，后两条（模块导航、分享链接）确认已退场即可删除。

## 为什么不在 `npm run test:e2e` 里

`npm run test:e2e` 是 MVP v0.1 的发布门槛，只跑新 IA 的主路径。旧用例留着可运行、但不拦版本：

```bash
npx playwright test --config=playwright.legacy.config.js
```

要看旧界面现场：`git checkout legacy-ia`（该 tag 是重装前的完整快照）。
