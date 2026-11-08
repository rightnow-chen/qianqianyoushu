# 弃用清单 · legacy-ia

> 日期：2026-11-07 ｜ 对应 tag：`v0.9-legacy-sidebar`（旧外壳完整现场）、`legacy-ia`（删改前一刻）
> 处理方式：**移动到 `archive/legacy-ia/`，不删除**。需要复原时把文件搬回原路径即可，git 里也有完整历史。

## 为什么退场

旧界面是「侧栏 4 模块 + 预算通勤决策 + 自由 AI 对话」的工具箱心智：用户自己找入口、自己判断该用哪个功能。
MVP v0.1 是「一条直线」：上传 → 质检 → 确认六字段 → 审查 → 概览/风险/修改/话术/待核实。
两套心智不能共存——留着侧栏，用户第一眼就会去找"我要点哪个"，而这条流程的全部价值就在于不用选。

## 退场文件（40 个，全部在 `archive/legacy-ia/` 下同路径保存）

### 旧框架与旧首页（4）

| 文件 | 原职责 | 替换者 |
|---|---|---|
| `src/components/AppSidebar.jsx` | 左侧 4 模块导航 | 无（刻意去掉，顶栏三步进度取代） |
| `src/components/AppTopbar.jsx` | 旧顶栏 | `src/components/TopBar.jsx` |
| `src/components/ProposalHome.jsx` | 旧首页（定位与演示路线） | `src/screens/LandingScreen.jsx` |
| `src/components/AnnouncementStrip.jsx` | 公告条 | 无 |

### 审查与谈判旧界面（7）

| 文件 | 原职责 | 替换者 |
|---|---|---|
| `src/components/ReviewInputPanel.jsx` | 合同输入面板 | `src/screens/UploadScreen.jsx` + `ConfirmScreen.jsx` |
| `src/components/ReviewAtoms.jsx` | 风险卡片等原子组件 | `screens/workbench/RiskTab.jsx`（卡片内联） |
| `src/components/RevisionDraftPanel.jsx` | 修订稿预览 | `screens/workbench/FixTab.jsx` |
| `src/components/NegotiationDesk.jsx` | 谈判台 | `screens/workbench/ScriptTab.jsx` |
| `src/components/DocumentView.jsx` | 合同原文视图 | `screens/workbench/ContractPane.jsx`（句子级高亮） |
| `src/components/RiskGuideModal.jsx` | 风险口径说明 | 概览页底部 `data-source` 行 + 行动条免责语（不再单开弹窗） |
| `src/components/ArtifactPreview.jsx` | 产物预览 | 导出走 `features/reportText.js` 直接开打印页 |

### 预算 / 通勤 / 决策（5）

| 文件 | 原职责 | 现状 |
|---|---|---|
| `src/components/DecisionInputForms.jsx` | 预算与房源录入 | V0.1 不做（PRD 明确排除） |
| `src/components/DecisionResult.jsx` | 签约结论卡 | 由 `computeVerdict` 三档结论取代 |
| `src/components/DecisionStepper.jsx` | 步骤引导 | 由顶栏三步进度取代 |
| `src/features/decision.js` / `decisionInput.js` / `decisionUi.js` | 预算冲突、通勤匹配、结论分级 | V0.1 不做 |

### 自由 AI 对话（3）

| 文件 | 原职责 | 现状 |
|---|---|---|
| `src/components/AiAssistantPanel.jsx` | 自由问答面板 | V0.1 不做（会冲掉"结论回指原文"这条底线） |
| `src/components/AiMessageContent.jsx` | 消息渲染 | 同上 |
| `src/features/assistantUi.js` | 助手视图模型 | 同上 |

### 被替换的视图模型与样式（8）

| 文件 | 原职责 | 替换者 |
|---|---|---|
| `src/features/reviewUi.js` / `reviewQualityUi.js` / `reviewAudit.js` | 审查卡片、质量门、审计的视图模型 | 逻辑并入 `riskMapper.js` + `riskModel.js` |
| `src/features/negotiationUi.js` | 谈判视图模型 | `scriptTemplates.js` |
| `src/features/topbarUi.js` | 顶栏文案映射 | 并入 `TopBar.jsx` |
| `src/App.css` | 9,446 行旧样式 | `src/styles/tokens.css` + `src/styles/app.css`（2,443 行） |
| `src/data/proposalContent.jsx` | 旧首页文案数据 | 并入 `LandingScreen.jsx` |
| `src/data/demoContracts.js` | 旧演示合同 | `src/data/demoCase.js` |

### 只服务于旧界面的工具（3）

| 文件 | 原职责 | 说明 |
|---|---|---|
| `src/utils/artifactContent.js` | 产物内容拼装 | 由 `reportText.js` 取代 |
| `src/utils/clipboard.js` | 旧复制封装 | 各组件内直接调 `navigator.clipboard` |
| `src/constants/contractImport.js` | 旧导入参数 | **已搬回** `src/constants/`：`fileImport.js` 仍在用它 |

### 失效测试（10）

`tests/unit/` 下 `assistant-ui`、`decision-ui`、`negotiation-ui`、`review-ui`、`sidebar-order`、`topbar-ui`、`proposal-entry`、`review-quality-ui`、`review-audit`、`contract-layout` 十个用例，断言的是已退场的 UI 契约，随模块一起移出。

`package.json` 里对应的 6 条脚本（`test:review-quality-ui`、`test:review-audit`、`test:review-ui`、`test:negotiation-ui`、`test:decision-ui`、`test:assistant-ui`、`test:topbar-ui` 中指向已删文件的部分）已于 2026-11-08 清掉，并补上 `test:unit` / `test:e2e` / `verify:mvp` 三条真有落点的入口。

### 旧 IA 的 Playwright 用例（5，**未删除**，移到 `app/tests/e2e-legacy/`）

| 文件 | 断言的是 | 处理 |
|---|---|---|
| `app.spec.js` | docx 上传 → 使用总览 → 导出 | 移出默认门槛；V0.2 按新 5 屏重写 |
| `apply-all-review.spec.js` | 一键应用全部改写后复查 | 同上（新 IA 只有逐条采纳） |
| `ai-review-failure.spec.js` | 模型输出截断 / JSON 破损兜底 | 移出默认门槛；**行为仍需守住**，对应新 IA 的降级三档 |
| `module-navigation.spec.js` | 提案路由跳「补贴匹配」 | 模块已退场，确认后可直接删 |
| `resilience.spec.js` | `?module=checkin` 分享链接恢复「入住验房」 | 同上，对应物是 `#work?tab=…&active=…` 深链 |

它们单独用 `playwright.legacy.config.js` 运行（`npm run test:e2e:legacy`），不参与 `npm run test:e2e`（该命令只跑新 IA 主路径 `tests/e2e/mvp-flow.mjs` 12 步）。

## 没有退场、且必须继续保留的能力

| 能力 | 文件 | 为什么留 |
|---|---|---|
| 规则引擎 | `features/contractReview.js`（2,300+ 行，50 组租赁规则） | 产品资产，`riskMapper` 的唯一输入 |
| 事实抽取 | `features/contractFacts.js` | 六字段初值来源 |
| 法条映射 | `features/legalBasisMap.js` + `constants/legal.js` | 「无依据不出结论」 |
| 文件解析 | `utils/fileImport.js` | PDF / docx / 图片，图片走服务端 `/api/ocr/image` |
| 脱敏 | `utils/privacy.js` | 上传即脱敏是信任前提 |
| 服务端 | `server/`（OCR、RAG、法条库、9 家模型代理） | 模型接入与 OCR 兜底 |
| 规则库与用例 | `data/contractReviewPlaybook*.js` | 埋雷合同回归 |

## 三处当前没被引用的能力（保留但要记一笔）

| 文件 | 行数 | 状态 | 用途 |
|---|---|---|---|
| `src/utils/docxExport.js` | 200 | 未接入 | V0.2「导出合同原文（修订版 / 批注版）」要用它生成 docx；菜单项已就位并标灰 |
| `src/utils/contractOcrReview.js` | — | 未接入 | 客户端图片预处理 + OCR 兜底，服务端不可用时才会用 |
| `src/utils/imageTools.js` | 53 | 未接入 | 图片压缩/纠偏，供上面那个文件使用 |

这三个不是垃圾，是 V0.2 的地基；但**现在确实没有任何代码 import 它们**。要么在 V0.2 接上，要么到时候一起搬进 `archive/`，不要长期悬着。

## 复原方法

```bash
# 单个文件
cp archive/legacy-ia/src/components/AppSidebar.jsx app/src/components/

# 整块回到旧界面（不推荐，仅应急）
git checkout v0.9-legacy-sidebar -- app/src
```
