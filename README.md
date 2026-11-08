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

## 踩过的坑（不要改回去）

### PDF 解析必须用 `pdfjs-dist` 的 legacy 构建

- **现象**：上传 PDF 时弹一句英文 `hashOriginal.toHex is not a function`，文件完全传不上去。
- **原因**：`pdfjs-dist` 6.x 的**标准构建**在 worker 里调用 `Uint8Array.prototype.toHex`——ES2026 的新方法，Chrome / Edge 要到 133 才原生支持。360、QQ、微信内置浏览器和旧版 Edge 的 Chromium 内核普遍低于这个版本，于是第一步计算文档指纹就崩了。标准构建里**没有任何 polyfill**。
- **修法**：`src/utils/fileImport.js` 引 `pdfjs-dist/legacy/build/pdf.worker.mjs` 与 `pdfjs-dist/legacy/build/pdf.mjs`。legacy 构建自带 full polyfill（`Uint8Array.prototype.toHex` / `fromHex`），代码一行不用改，代价是 worker 从 1.6MB 涨到约 2.4MB。
- **守门**：`tests/unit/contract-import.test.mjs` 第 5–7 组分别断言源码引用、`node_modules` 里的 legacy worker、`dist` 构建产物三处都不能退回标准构建。哪天 pdfjs 官方补上 polyfill，第 6 组会打印提示，那时才考虑切回。
- **顺带修的两件**：
  - 底层解析库抛出的技术异常不再直接进 UI，一律收敛成中文提示（`ContractImportError`），原始异常只写控制台。
  - 扫描件 PDF 没有文字层，抽出的正文不足 30 个汉字/字母时直接提示改用拍照上传走 OCR，不再让一份空合同走到确认页。

### 质检页的「识别率」只对拍照成立

- **现象**：传 PDF 也显示「文字识别率 第 2 页 61%」「反光区域集中在押金条款」，而且标题写「共 2 页」、下面却说「其余 3 页 96% 以上」。
- **原因**：`UploadScreen` 是原型阶段的静态文案，数字全是写死的——`21 处文字层缺失`、`第 2 页 61%`、`反光`、`第 4 条 · 押金`、`低置信度 2 处`。左右两栏还互相矛盾：缩略图每页都打勾、写着「文字层完整」，标题却说缺失 21 处。
- **修法**：`features/uploadQuality.js` 按来源分派 `mode`（`ocr` / `text` / `plain`），返回结构化的 `checks` / `advice` / `previewText`；`UploadScreen` 改成纯数据驱动。PDF / Word 走「文字来源：自带文字层，逐字提取，不经过 OCR」+ 一段提取预览（用来发现多栏串行），不出「识别率 / 反光 / 重拍 / 补拍」；逐页缩略图只在拍照、或确实有坏页时出现（22 页文件铺 22 个打勾方块只是噪音）。
- **守门**：`tests/unit/upload-quality.test.mjs` 8 组，其中 PDF 与纯文本两组显式断言文案里**不出现**「识别率 / 反光 / 重拍 / 置信度」。
- **顺带修的**：`countMasked` 的手机号正则缺前后边界，18 位身份证号里的 11 位子串会被算成一个手机号（实测 2 个身份证被报成「3 个手机号」）；PDF 页数改用 `pdf.numPages`，不再拿字数估。

### 确认页左侧必须显示「用户上传的那份文件」

- **现象**：上传任何文件，确认页左边都是同一份示例合同（北京朝阳区建国路 88 号、月租 4,500 元）；右边的六字段却是从真实文件里读的，两边对不上。
- **原因**：`ConfirmScreen` 的预览是原型阶段的静态 JSX，从来没接过 `session.fileText`。
- **修法**：`features/filePreview.js` 按来源分派——PDF 用 pdf.js 渲染**原件页面**（能翻页，看得出印章/表格/排版），图片直接显示原图，Word 渲染 `mammoth` 解析出的标题/段落/列表层级并明说「排版无法还原」，TXT 与粘贴显示原文。**只有拍照才有「照片 / 识别文字」两档**：PDF / Word / TXT 的文字是文件自带的，摆一个「识别全文」会让人以为那堆字是认出来的，还多一次没必要的点击。
- **守门**：`mvp-flow.mjs` 第 3 步断言预览里**不能出现**示例合同的「建国路 88 号」；第 15 步上传真实 PDF，断言画布上真的画了内容（采样像素，不是一块白板），且**没有**切换按钮。

### `PDFDocumentProxy` 没有 `destroy()`

- **现象**：确认页点「识别全文」、或点「开始审查」之后，整页变成空白；控制台是 `TypeError: i.destroy is not a function`。两个看起来无关的动作，其实是同一个崩溃。
- **原因**：`PaperPreview` 卸载时调 `pdf.destroy()`，但 pdfjs 6 的 `PDFDocumentProxy` **只有 `cleanup()`，没有 `destroy()`**——要释放 worker 必须留着 `getDocument()` 返回的 `loadingTask` 再销毁它。异常抛在 React 的卸载阶段，没有组件接得住，整棵树被带走，页面剩白板。
- **修法**：`openPdfPreview` 保存 `task`，`destroy()` 调 `task.destroy()` 并吞掉异常；解析期间用户切走了就立刻销毁句柄，不往 ref 里留。
- **守门**：`mvp-flow.mjs` 第 16 步从 PDF 确认页点「开始审查」，断言进到结果页且正文不为空。

### 算不出金额时不能显示 ¥0

- **现象**：上传国家示范文本（没有填金额），结果页大红字写「最坏情况合计损失 ¥0」，旁边却有 1 条「必须改」的押金风险。结论句还写「可能让你多损失 ¥0」。
- **原因**：`amountForRisk` 在 `value === 0` 时照常拼 `−¥0`。0 有两种含义——「真的不亏」和「还不知道亏多少」，界面必须分开。
- **修法**：`amountForRisk` 加 `missing` 标记，值为 0 时文案改成「金额待补」；`computeWorstCase` 多返回 `unpriced`（有几条必须改算不出钱）；概览的金额位置显示「待补」+ 一句「没读到月租或押金，补上就会重算」；`computeVerdict` 的两档结论也改口径，不再出现 `¥0`。
- **守门**：`tests/unit/amount-engine.test.mjs` 第 11 组断言 `missing === true`、文本是「金额待补」、结论里不含 `¥0`。

### 金额提取必须容忍千分位

- **现象**：合同写「月租金 4,500 元」，确认页读成 500；「押金 13,500 元」读成 500。金额差一个数量级，用户只会认为产品算错。
- **原因**：`AMOUNT_RE` 用的是 `\d+(?:\.\d+)?`，碰到逗号就断开，只匹配到逗号后面那几位。真实合同样本恰好写成「2800 元」不带逗号，所以一直没暴露。
- **修法**：改成 `\d[\d,]*(?:\.\d+)?`，并在取值时把「万元」换算成元（`1.2 万元` → `12000`），百分比保持原值。
- **守门**：`tests/unit/contract-facts.test.mjs` 断言 4,500 → 4500、13,500 → 13500、5.4 万元 → 54000。

### 静态服务器必须给 `.mjs` 正确的 MIME

- **现象**：e2e 里上传 PDF 后什么都不发生，没有报错也没有跳转。
- **原因**：`mvp-flow.mjs` 自带的静态服务器 MIME 表里没有 `.mjs`，pdf.js 的 worker 拿不到 JS 内容，`getDocument` 静默失败。
- **教训**：部署时同样要确认 `.mjs` 返回 `text/javascript`，否则线上 PDF 上传会「没反应」。已在 e2e 的 MIME 表里补上。

## 当前状态（2026-11-08）

**MVP v0.1 已收口**：5 屏（首页 / 上传质检 / 确认六字段 / 分析 / 工作台）+ 5 Tab（概览 / 风险 / 修改 / 话术 / 待核实），整条闭环接的是真实引擎，不是写死的演示数据。

| 项 | 结果 |
|---|---|
| 引擎对接 | `contractReview`（50 组租赁规则）→ `riskMapper`（severity→必须改/建议确认/仅提醒、类别→金额键、句子级定位、两档话术、降级判断） |
| 金额 | 全部由月租 / 押金 / 租期算出，界面逐处标「估算」；`amount-engine.test.mjs` 锁口径；PRD 9.5 已补「金额来源 / 表述纪律 / 口径演进」四段 |
| 验收 | PRD 9.10 十二项走查 **12/12**；主路径 e2e **16 步**（含两份 docx 真实下载解包、PDF 确认页渲染原件、从 PDF 确认页进结果页不白屏）；13 个单测全绿；ESLint 零告警 |
| 确认页 | 左侧显示用户上传的原件：PDF 渲染真实页面可翻页、图片显示原图、Word 按原文层级还原、TXT 显示全文；「照片 / 识别文字」只对拍照出现；算不出金额时显示「待补」而不是 ¥0 |
| 导出 | 审查报告（打印成 PDF）、**合同修订版 docx**（已采纳的修改标红 + 文末修改清单）、**合同批注版 docx**（Word 原生批注挂原句，正文一字未改）、只复制文字 |
| 旧界面 | 40 个文件移入 `archive/legacy-ia/`（tag `v0.9-legacy-sidebar`），清单见 `docs/tech/弃用清单_legacy-ia.md` |
| 旧用例 | 5 个旧 IA 的 Playwright 用例移入 `tests/e2e-legacy/`，不参与发布门槛；其中 3 个覆盖的健壮性行为需在 V0.2 重写 |
| 体量 | `src/` 10,436 行 JS/JSX + 2,563 行 CSS（旧版 11,952 + 9,494） |

**V0.2 已完成**：修订版 / 批注版 docx 导出（`features/contractDocx.js`）。样张可直接打开检查：`node scripts/export-sample-docx.mjs` → `generated-reports/contract-docx/`。

**V0.2 待接**：口头承诺录入、合同内外一致性核对、修改后复查。

**仍待处理**：`real-contract-samples/` 可并入 `tests/fixtures/`；`scripts/verify/` 下 `_flow1–6`、`verify-decision/negotiation/takeaway/no-evidence` 是针对旧流程的一次性脚本，确认无用后可整体移入 `archive/`。
