# 签前有数 · 工作区导航

面向第一次租房的毕业生，在签约前识别合同风险、给出修改建议与谈判话术的 AI 助手。
本仓库同时存放**产品文档**与**可运行的代码工程**，按用途分层，不再混放。

## 目录说明

| 目录 | 放什么 | 什么时候看 |
|---|---|---|
| `app/` | 唯一代码工程（React + Vite 前端、Express 服务端、测试、部署配置） | 改功能、跑演示 |
| `docs/product/` | PRD、产品定位与 MVP 边界、指标体系 | 讲清楚"做什么、不做什么" |
| `docs/log/` | 迭代日志 | 回顾决策过程 |
| `research/scripts/` | 需求验证、数据分析、文档生成类一次性脚本 | 复算问卷、重出报告 |
| `research/artifacts/` | 文档结构分析产物（json） | 排查报告生成问题 |
| `deliverables/reports/` | 对外报告与立项材料（docx + 流水线产物） | 投递、答辩 |
| `deliverables/test-kits/` | 两套租房合同测试包（含标准答案与 zip） | 做效果验证 |
| `deliverables/decks/` | 面试答辩手册 | 面试 |
| `deliverables/samples/` | 海外合同样本 | 对比参考 |
| `archive/` | 历史渲染产物、构建快照、截图 | 只在需要回溯时看 |

## 运行代码

```bash
cd app
npm install
npm run dev:full        # 前端 + 本地 AI 代理（8787）
```

只跑前端：`npm run dev`。真实模型调用需要先复制 `.env.example` 为 `.env` 并填入密钥（`.env` 已被 git 忽略）。

验证：

```bash
cd app
npm run build           # 构建通过 = 引用路径无断裂
node tests/legal-basis.test.mjs
```

## 当前状态

- 已完成：目录分层（P0 基线 + P1 搬运），构建与单元测试均通过。
- 未做（按需再推进）：`app/` 根层 24 张截图与 12 个临时 `_flow*.mjs` 移入 `archive/`；`tests/` 拆分 e2e 与单测；`server/ai-proxy.mjs`（1431 行）按资源拆分。
