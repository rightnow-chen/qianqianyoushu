# 签前有数 · 工作区导航

面向第一次租房的毕业生，在签约前识别合同风险、给出修改建议与谈判话术的 AI 助手。
本仓库同时存放**产品文档**与**可运行的代码工程**，按用途分层，不再混放。

## 目录说明

| 目录 | 放什么 | 什么时候看 |
|---|---|---|
| `app/` | 唯一代码工程（React + Vite 前端、Express 服务端、测试、部署配置） | 改功能、跑演示 |
| `docs/product/` | PRD、产品定位与 MVP 边界、指标体系、**MVP v0.1 对齐与实施计划** | 讲清楚"做什么、不做什么" |
| `docs/prototype/` | 高保真原型 V3（UI 唯一事实源） | 改界面前先看它 |
| `docs/tech/` | 技术栈与架构说明、弃用清单 | 接手代码、复原旧界面 |
| `docs/log/` | 迭代日志 | 回顾决策过程 |
| `research/scripts/` | 需求验证、数据分析、文档生成类一次性脚本 | 复算问卷、重出报告 |
| `research/artifacts/` | 文档结构分析产物（json） | 排查报告生成问题 |
| `deliverables/reports/` | 对外报告与立项材料（docx + 流水线产物） | 投递、答辩 |
| `deliverables/test-kits/` | 两套租房合同测试包（含标准答案与 zip） | 做效果验证 |
| `deliverables/decks/` | 面试答辩手册 | 面试 |
| `deliverables/samples/` | 海外合同样本 | 对比参考 |
| `archive/render/` | 历史文档渲染产物与 QA 页面 | 排查排版问题 |
| `archive/screenshots/` | 24 张迭代过程截图 | 回看旧版界面 |
| `archive/builds/` | 原型构建快照（zip + 解压目录） | 需要对照旧版本时 |

## 运行代码

```bash
cd app
npm install
npm run dev             # 只跑前端，5173
npm run dev:full        # 前端 + 本地 AI 代理（8787），走真实模型/OCR 时用
```

真实模型调用需要先复制 `.env.example` 为 `.env` 并填入密钥（`.env` 已被 git 忽略）。

**不配密钥也能完整走通主路径**：规则引擎、文件解析、金额计算全在本地，模型只是"补漏"。演示入口：`#work?demo=1`（样例数据）、`#work?demo=1&m=1`（手机形态）。

验证：

```bash
cd app
npm run build        # 构建通过 = 引用路径无断裂
npm run lint         # ESLint 零告警
npm run test:unit    # 9 个单测（金额口径 / 映射层 / 规则库 / 法条守门）
npm run test:e2e     # MVP 主路径 12 步（自己起静态服务器）
npm run verify:mvp   # PRD 9.10 十二项走查
```

测试与脚本的分工：

| 位置 | 用途 | 运行方式 |
|---|---|---|
| `app/tests/unit/` | 纯 Node 断言测试，不启浏览器 | `npm run test:unit` |
| `app/tests/e2e/` | 新 IA 的端到端主路径（`mvp-flow.mjs`，独立可跑） | `npm run test:e2e` |
| `app/tests/e2e-legacy/` | 旧 IA 的 5 个 Playwright 用例，**不拦版本**，留着待重写 | `npm run test:e2e:legacy` |
| `app/scripts/` | 基准评测、数据生成、真实合同跑批 | `npm run test:xxx` |
| `app/scripts/verify/` | 一次性界面走查与截图 | `npm run verify:mvp` |

`scripts/verify/` 的截图统一输出到 `scripts/verify/out/`（已被 git 忽略），不会再污染工程根目录。

## 服务端结构

`app/server/ai-proxy.mjs` 只做装配（83 行）：CORS、JSON 解析、挂路由、静态托管、监听。具体能力下沉为：

| 位置 | 职责 |
|---|---|
| `server/config.mjs` | 环境变量、九家模型提供商预设与解析、路径常量 |
| `server/lib/logger.mjs` | 白名单字段的结构化脱敏日志 |
| `server/lib/guards.mjs` | 限流、本地额度、小程序鉴权、来源校验、上传解析 |
| `server/lib/usage-store.mjs` | 小程序额度与幂等记录存储单例 |
| `server/services/ai-completion.mjs` | 上游模型调用，含超时与客户端取消 |
| `server/services/ocr.mjs` | 智谱视觉 → RapidOCR → Tesseract 三级兜底 |
| `server/services/miniapp-chat.mjs` | 小程序问答与分段合同复核的编排 |
| `server/routes/*.mjs` | 按资源拆分：health / auth / ai / miniapp-ai / rag / ocr / contract / subsidy |

依赖方向单向：`config → lib → services → routes → ai-proxy`，无循环引用。

## 当前状态（2026-11-08）

**MVP v0.1 已收口**：5 屏（首页 / 上传质检 / 确认六字段 / 分析 / 工作台）+ 5 Tab（概览 / 风险 / 修改 / 话术 / 待核实），整条闭环接的是真实引擎，不是写死的演示数据。

| 项 | 结果 |
|---|---|
| 引擎对接 | `contractReview`（50 组租赁规则）→ `riskMapper`（severity→必须改/建议确认/仅提醒、类别→金额键、句子级定位、两档话术、降级判断） |
| 金额 | 全部由月租 / 押金 / 租期算出，界面逐处标「估算」；`amount-engine.test.mjs` 锁口径；PRD 9.5 已补「金额来源 / 表述纪律 / 口径演进」四段 |
| 验收 | PRD 9.10 十二项走查 **12/12**；主路径 e2e **12 步**；9 个单测全绿；ESLint 零告警 |
| 旧界面 | 40 个文件移入 `archive/legacy-ia/`（tag `v0.9-legacy-sidebar`），清单见 `docs/tech/弃用清单_legacy-ia.md` |
| 旧用例 | 5 个旧 IA 的 Playwright 用例移入 `tests/e2e-legacy/`，不参与发布门槛；其中 3 个覆盖的健壮性行为需在 V0.2 重写 |
| 体量 | `src/` 10,436 行 JS/JSX + 2,563 行 CSS（旧版 11,952 + 9,494） |

**V0.2 待接**：修订版/批注版 docx 导出（`utils/docxExport.js` 已就位未接）、口头承诺录入、合同内外一致性核对、修改后复查。

**仍待处理**：`real-contract-samples/` 可并入 `tests/fixtures/`；`scripts/verify/` 下 `_flow1–6`、`verify-decision/negotiation/takeaway/no-evidence` 是针对旧流程的一次性脚本，确认无用后可整体移入 `archive/`。
