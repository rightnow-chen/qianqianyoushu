# 项目长期记忆 — 签前有数（毕业生租房签约决策助手）

> 现行有效版本。详细过程见 `.workbuddy/memory/YYYY-MM-DD.md` 日志。

## 一、产品定位（基于 91 份有效问卷 + 访谈）
- 一句话：帮刚毕业、第一次租房的年轻人在**签约前几分钟**识别合同高风险条款与合同外待核实事项，给出修改建议 + 可发给房东/中介的话术，判断要不要继续签。
- 核心用户：应届生、第一次异地租房（不按租房渠道划分）。
- MVP 闭环：拍照/上传/粘贴（含 OCR）→ 风险摘要（押金/提前退租/维修/水电附加费优先）→ 修改建议与话术 → 待核实清单 → 修改后复查。
- 不进 MVP：验房、退租证据包、身份真伪核验、二房东/隔断房专项、线上签约、小程序、商业化、地图通勤、房源匹配。
- AI 定位：初筛与查漏补缺，不替代律师；每条结论回原文并说明不确定；隐私脱敏为必要内容。

## 二、需求验证与竞品（只记结论，避免重复引用）
- 支持：合同问题覆盖 58.2%／损失≥2000 元 23.1%／纸质或图片输入 70.3%（必须 OCR）／愿改对方合同 34.1%／问题集中度 50.5%。
- **存疑**：AI 使用率 44%、满意度均值 3.25 —— 原报告分项人数合计仅 36 人却用 40 作分母，实算约 3.06，均值被高估。**核对原始数据前不引用**。
- 不支持：中介 vs 非中介 -4.5pp（不能只面向中介用户）。
- 差异化：20 项功能维度中「分场景话术／待核实清单／合同内外一致性核对」3 项国内竞品与通用大模型均未见成熟做法 → 打补缺位，不是做得更好。
- 价格：单次审查撑不起商业化（TheLeaseCheck $9/份、通义 4 元/页）→ 免费初筛 + 增值付费，单次审查当获客入口。
- 信任最短路径：LeaseSnipe「免注册 + 不存储」比免责声明有效 → 隐私脱敏 + 不存储做成默认能力。
- 竞品报告：`桌面\签前有数_竞品分析报告_v0.2.docx`；定位：`桌面\产品定位_修订版.docx`；需求验证：`桌面\签约有数\发现需求验证需求\...docx`。

## 三、事实源
- **UI**：`桌面\签前有数_高保真原型.html`（V3，2311 行，5 屏 + 5 Tab）；旧构建快照 `archive/builds/`。
- **需求**：`桌面\签前有数_PRD框架_v1.2.docx`（15 章；正文导出于 `docs/_prd_v12_dump.txt` 便于 grep）。
- **代码**：`app/`（React + Vite + Express）。
- 核心口径：9 条风险 = 3 必须改 + 2 建议确认 + 4 仅提醒；最坏合计 ¥17,400（**估值**，界面逐处标「估算」）；8 件待核实；对外 3 分钟 / 模型 28 秒；审查尺度严格·逐句 / 标准两档。

## 四、架构现状（2026-11-16）
- 5 屏 + 5 Tab；`riskMapper.js` 把引擎的 high/medium/low 翻成「必须改/建议确认/仅提醒」+ 金额键 + 句子定位 + 两档话术 + 降级判断；语义只在输出层换算，不改引擎。
- **审查链路已接成双引擎（2026-11-17 核实，旧记录"UI 只接规则侧"已过时）**：`App.jsx#runAnalysis` 现在两段跑——先 `analyzeContract`（规则秒出，立刻落地）→ 再 `reviewContractWithAi`（`aiReview.js`）异步补盲 → `mergeFindings(localFindings, aiFindings)`（本地全量保留、AI 只补覆盖不到的）→ 再次 `toRiskModel`。
  - AI 那一路：`loadKnowledge` 走 `/api/rag/search`（本地混合检索，非向量库）取 6 条 → `createAiReviewPrompt`（两阶段 + 标准卡 + 合同事实索引）→ `/api/ai/chat`（temperature=0、maxTokens 6000、超时 90s）→ `parseAiReviewResponse`（finish_reason/JSON/schema/证据逐字核验，核验不过就丢弃）。
  - 失败分层：规则抛错 → 整页空结果 + degradation.failed；AI 失败（超时/网络/格式）→ **保留规则结果**，只把 `aiReview.status='failed'` + 中文 message，绝不拿空数组冒充"没风险"。`runId` 防旧请求覆盖新上传结果。
  - **AI finding 的法条继承（2026-11-23 两轮修完）**：`App.jsx` merge 前先 `enrichFindingsWithLegalBasis(aiFindings, localFindings)`——本地同句逐字匹配优先继承，落空则按标准卡查 `playbookLegal.js#PLAYBOOK_LEGAL_MAP`（9 张卡的法条复用卡内已核实的 `legalSources`，非 AI 现编），只补 legalLaw/legalBasis/legalUrl。**坑1**：不能用 `finding.playbookId || getPlaybookIdForFinding(f)` 短路——AI 常给幻觉/本地 id（非空但不在映射表），必须 `legalForPlaybook(id) || legalForPlaybook(getPlaybookIdForFinding(f))` 验证后回退。**坑2**：`getPlaybookIdForFinding` 必须把 evidence 一起看（`text=title+evidence`），AI 标题常泛化；特定卡（入户/违约多倍/宠物等）优先于泛卡（押金/费用），否则 evidence 里的「押金」会抢走违约卡。单测 `playbook-legal.test.mjs` #8/#9 钉死这两个回归。标准卡无「格式条款」卡，AI 给错 id 会错配（如「最终解释」补成押金法条），属粗粒度代价，已标「不当法律意见」。
- 后端：`npm start` = `server/ai-proxy.mjs` 端口 8787，同端口提供 `dist` 与 `/api`；`vite preview` 无 `/api`，OCR 与 AI 都会失败。自检 `/api/ai/smoke`（不耗额度）。
- 模型：`deepseek-v4-flash`（`constants/aiConfig.js`，另有 deepseek-chat / reasoner 可选）。
- 测评资产：`scripts/test-contract-review-benchmark.mjs` 14 份合同 176/176 全中 —— **但测试集是自造变体，属过拟合，不代表真实召回**。真样本在 `deliverables/test-kits/contract-review-advanced-kit-20261009/`（01 正文 md / 02 同文 PDF）。

## 五、必须遵守的技术约定（踩过的坑）
- **PDF 必须用 `pdfjs-dist/legacy/build/*`**：标准构建依赖 `Uint8Array.prototype.toHex`（Chrome 133+），旧内核报 `hashOriginal.toHex is not a function`。`contract-import.test.mjs` 5–7 组钉死，别为省体积改回。
- **`PDFDocumentProxy` 无 `destroy()`**：释放 worker 用 `getDocument()` 返回的 `loadingTask.destroy()`。调错 → React 卸载抛 TypeError → 整页白屏。
- **金额**：`AMOUNT_RE` 用 `\d[\d,]*`（合同写 `4,500 元`）；「万元」换算成元；读不到就是 0，确认页黄底要求手填，**不许用默认值假装读到**。`amountForRisk.missing` + `computeWorstCase.unpriced` 区分「真不亏」与「算不出」，禁止出现 `−¥0`。OCR 会把千分位读成点（`2,800`→`2.800`），已按千分位剥离。
- **金额 0 的三种情形要分开说**：无必须改条款 → `—` +「不需要估算损失」；未读到月租/押金 →「待补」；条款无可定价机制（违约金按天）→ 说「没有固定金额，取决于真出事怎么算」。
- **CSS 类名别用通用词**：风险卡片金额曾拼成 `rc-amt loss`，撞上概览大卡片的 `.loss`，`padding:12px 15px` + `border` + `flex` 全被带过来，带金额的卡片 40px→72px，看着像「必须改和建议确认宽度不一致」。等级类一律带前缀（`amt-loss/gain/zero`），概览那块已改名 `.loss-card`。
- **静态服务器**：`.mjs` 必须返回 `text/javascript`，否则「上传 PDF 完全没反应」。
- **单端口**：`server/config.mjs` 自动并入 `http://localhost:<port>`，否则 `npm start` 下静态资源被 CORS 拦（`MIME text/html` + 500）。
- **tesseract worker 错误会炸进程**：必须传 `options.errorHandler` + `terminate().catch`；`ai-proxy.mjs` 有 `unhandledRejection`/`uncaughtException` 记日志不退出。`ocr-worker.test.mjs` 钉死。
- **质检语义按来源分派**：识别率/反光/重拍/置信度**只对拍照 OCR 成立**；PDF/Word 说「自带文字层，不经过 OCR」；TXT 不编页数。`uploadQuality.js` + `upload-quality.test.mjs` 钉死。
- **「识别」只属于拍照**：PDF/Word/TXT 不给「识别全文」按钮；图片第二档用 `previewText.js#layoutContractLines` 重排。
- **结果页左栏**：`ContractPane` 是分派器（PDF=canvas+TextLayer、Word=docx-preview、图片=只给重排文字、纯文本=PaperDoc）。高亮用 **Custom Highlight API**（`docHighlight.js`），不插 DOM。
- **文档导出**：`contractDocx.js` 修订版 = 直接替换 + 红色下划线 + 文末修改清单（docx@9.7 无 `w:ins/w:del` API，**不是** Word 修订痕迹）；批注版用原生批注，且**只导出用户勾选的**（`commented` 状态 → `planComments({selected})`；按钮在 FixTab，真记录状态不再是纯 toast）。
- **导出版式（2026-11-19）**：版式唯一来源 `contractDocxLayout.js` —— 两版共用页边距/页眉页码/段落样式，保证排版一致。按来源分骨架：`resolveProfile` → demo/TXT/图片=`template`（参照住建+市场监管示范文本通用结构：合同编号/居中标题/甲乙方/签章栏/页码，**不宣称某地方法定版本**），DOC/DOCX/PDF=`preserve`（保留原文结构，不套模板）。封面只放版本标记，不重复写标题（原文 title 行渲染成大字）。诚实边界：PDF 无法逐像素还原 docx，Word 是提取后重建非原文件改。
- **改源码后必须重建**：`test:e2e` 用 4311 静态服务读 `dist`，源码改了不 build 就是测旧代码（踩过）。`rm -rf dist && npm run build` 再跑。
- **构建顺序**：`vite preview` 服务 `dist` 时 build 会失败。先停 preview → `rm -rf dist` → build → 再起。
- **`npm start`（8787）正在跑时别 `rm -rf dist`（2026-11-23 踩过）**：它会瞬间读 `dist/index.html`，目录没了就抛 `ENOENT ... dist/index.html` 直接退出进程（不只是 404）。重建前先停 8787 → `rm -rf dist` → build → 重新 `npm start`（后台起）。若已崩，重启后验证 `curl localhost:8787` = 200 + `/api/ai/smoke` 两个 success。
- **safe-delete 危险习惯**：shim 曾连带删掉 `deliverables/test-kits/` 下 16 个已跟踪文件。**每次 rm 后立刻 `git status --short`**，见到 ` D` 就 `git checkout -- <path>`。
- **测试入口**：`npm run test:e2e` = `mvp-flow.mjs`（现在 20 步），**不是** playwright；旧 IA 在 `tests/e2e-legacy/`（`playwright.legacy.config.js`）。另有 `test:unit` / `verify:mvp` / `test:contract-review-benchmark` / `test:review-reliability`。
- **产品决策**：城市参数不做（用户明确没能力）；法条核实按武汉口径。

## 六、待验证
- AI 与律师结论一致性、采纳与付费行为、目标用户（应届生）选择仍属假设。
- 合同审查准确率**没有真实合同标准答案集**，无法量化召回与误报；同一份合同两次 AI 输出条数差异大（历史 11 条 vs 2026-11-16 实测 5 条），稳定性未验证。
