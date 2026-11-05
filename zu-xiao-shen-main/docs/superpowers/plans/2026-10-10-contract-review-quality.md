# 合同审查质量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将租房合同审查 Demo 从“能调用模型并展示风险”升级为“结果可核验、失败不误判、在限定场景有对照证据”的 AI 产品经理作品集项目。

**Architecture:** 保留现有“本地规则 + RAG + 通用模型”的混合架构。P0–P1 先保证输入、输出和证据链可靠；P2–P3 将合同审查拆成风险专题、事实抽取和关联复核；P4–P5 再扩展评测集、RAG 质量和用户反馈闭环。每一步都以小样本回归和对照实验为验收门槛。

**Tech Stack:** React、Node.js、JavaScript、PDF.js、Mammoth、Tesseract.js、OpenAI 兼容聊天接口、现有本地规则引擎和关键词 RAG。

**Spec:** `docs/superpowers/plans/2026-10-10-contract-review-quality.md`

## Global Constraints

- 产品范围固定为首次租房、签约前、租客视角；不宣称覆盖所有合同或提供法律意见。
- 风险结论必须能定位到合同原文；找不到充分证据时只能输出待核验状态。
- “明确不利条款”“信息缺失”“可进一步协商”必须分开，不把三者都显示为高风险。
- 模型输出失败、截断、拒答或证据不完整时，不得显示低风险或生成完整审查评分。
- 每次质量改动都要在同一批正例和负例上比较召回率、误报率、证据支持率、耗时和成本。
- 不通过增加固定关键词来硬编码 01 测试合同；新增规则必须描述一类可复用风险。

## Review Focus

- 长合同或模型输出达到上限时，页面显示“审查未完成”，而不是“低风险”；由 P0 的失败状态回归覆盖。
- 模型引用的金额、日期、期限被改写时，证据校验拒绝该条；只允许空白和换行差异，由 P0 的证据测试覆盖。
- 同一条款包含押金和入户两个独立问题时，两条风险都保留，由 P1 的合并测试覆盖。
- 合同已有“正常损耗不扣”等保护条款时，模型不能只依据其他扣款句子做相反判断，由 P2 的反证复核测试覆盖。
- 低风险合同只有“还可补充”的细节而没有实质不利条款时，不应被堆出高风险，由 P3 的正负例评测覆盖。

## P0：可靠性底线——先保证结果没有欺骗性

目标：修复“模型失败却显示低风险”的致命问题。当前已完成的链路修复应保留，并把它变成作品集里的第一项质量证据。

### Task P0.1：审查响应状态机

**Files:**
- Modify: `src/features/aiAssistant.js`：严格解析审查响应和质量状态。
- Modify: `src/App.jsx`：把 running、complete、incomplete、failed 映射到页面状态。
- Modify: `src/components/ArtifactPreview.jsx`：未完成时显示“暂未评分”。
- Test: `tests/ai-review-reliability.test.mjs`、`tests/ai-review-failure.spec.js`。

**Interfaces:**
- `parseAiReviewResponse(data, sourceText)` 返回 `{ findings, qualityReport }`。
- `qualityReport.status` 取 `complete | incomplete | failed | running`。
- `getRiskSummary(findings, reviewState)` 在非 complete 状态返回 `score: null`。

- [x] 为 `finish_reason=length`、空 content、拒答、非法 JSON、缺字段分别写失败测试。
- [x] 验证失败场景不出现“低风险”“风险分 0”或可保存的完整审查历史。
- [x] 保留已核验的风险线索，但页面明确提示“不能据此判断合同安全”。
- [x] 验证一次失败后重试，只有拿到完整有效 JSON 才恢复评分。
- [x] 运行 `npm run test:review-reliability`，预期所有可靠性测试通过。

### Task P0.2：审查请求传输保护

**Files:**
- Modify: `server/ai-chat-request.mjs`、`server/ai-proxy.mjs`：审查请求不静默裁掉合同尾部，输出预算与模型思考模式按审查任务配置。
- Modify: `src/App.jsx`：审查请求传递 `task: 'contract-review'` 和专用 `maxTokens`。
- Test: `tests/ai-chat-request.test.mjs`。

- [x] 用带有末尾唯一标记的长合同验证发送内容仍包含标记。
- [x] 用超长请求验证返回明确的 413 错误。
- [x] 验证普通聊天不继承合同审查的模型参数。
- [x] 记录模型、结束原因、token 用量和耗时，但不记录合同正文和 API 密钥。

**P0 完成门槛：** 任何模型失败都不会被展示成低风险；01 合同能稳定得到“完成或未完成”的真实状态。达到这里，可以在简历写“建立 AI 审查失败兜底和证据校验机制”，不能写“审查准确率提升”。

## P1：证据质量——让每条风险都能被面试官现场核对

目标：提高 precision 和可解释性，避免模型“说得像风险但证据不支持”。

### Task P1.1：证据对象统一化

**Files:**
- Modify: `src/features/aiAssistant.js`：统一 evidence、evidenceLocation、relatedEvidence、verificationStatus。
- Modify: `src/components/ReviewAtoms.jsx`、`src/components/DocumentView.jsx`：支持主证据和关联证据定位。
- Test: `tests/ai-review-reliability.test.mjs`、新增证据位置测试。

**Interfaces:**
- 每条 finding 至少包含：`evidence`、`evidenceLocation`、`verificationStatus`。
- 跨条款风险可包含 `relatedEvidence: [{ text, location, role }]`。
- `verificationStatus` 取 `verified | partial | rejected`。

- [x] 主证据只允许来自原文，金额和数字变化必须 rejected。
- [x] 允许模型省略换行，但返回原文中的完整连续片段。
- [x] 同一证据中的不同风险按 `id/title/dimension` 区分，不按证据重叠简单去重。
- [x] 页面明确显示“证据”“关联条款”“待核验”，让面试官能从卡片跳到原文。

### Task P1.2：风险输出减负

**Files:**
- Modify: `src/features/aiAssistant.js`：首轮只要求 title、level、dimension、explain、suggestion、evidence、replacement。
- Modify: `src/App.jsx`：谈判话术和法律依据在用户展开或进入谈判台时单独生成。
- Test: 审查响应字段和输出截断回归。

- [x] 首轮不要求模型同时生成长篇法条、谈判话术和完整合同改写。
- [x] 验证 01 合同能在预算内返回完整 JSON。
- [x] 后续生成的依据必须从知识库返回，不能让模型自由编造法条号。

**P1 完成门槛：** 每条风险都能回到原文，跨条款问题至少显示两处证据；现场演示可以从风险卡定位合同。达到这里，可以在简历写“构建可核验的合同风险审查链路”，仍不写“法律准确率达到某百分比”。

## P2：审查标准——把“风险”从模型自由发挥变成可检查的产品规则

目标：建立 5–8 张租客视角审查标准卡，明确正例、负例和需要关联的条款。

### Task P2.1：标准卡数据结构

**Files:**
- Create: `src/data/contractReviewPlaybook.js`：风险主题、触发条件、例外、证据要求、建议动作。
- Modify: `src/features/contractReview.js`：本地规则引用标准卡 id。
- Modify: `src/features/aiAssistant.js`：将标准卡作为专题审查上下文。
- Test: `tests/contract-review-playbook.test.mjs`。

**Interfaces:**
- `playbook[id] = { id, title, dimension, severity, trigger, counterSignals, requiredEvidence, examples, nonExamples, action }`。
- 第一批主题：押金结算、自动续租与费用变化、维修责任、入户与默认同意、提前解约与损失。

- [ ] 每张卡写一个“应报”例子和一个“不得报”例子。
- [ ] 把“明确不利”“缺少约定”“需要核对”分为不同结果类型。
- [ ] 给 01 和 05 样本逐项建立 expected / none / evidence 的标准答案。

### Task P2.2：专题审查提示

**Files:**
- Modify: `src/features/aiAssistant.js`：按标准卡分专题调用或批量调用模型。
- Modify: `server/ai-proxy.mjs`：支持审查阶段标识、超时、重试和结果合并。
- Test: 专题审查输入输出回归。

- [ ] 先让模型提取条款事实，再按专题检查，避免一次 Prompt 同时完成所有任务。
- [ ] 每个专题要求搜索定义、条件、例外、处罚后果和附件引用。
- [ ] 专题结果合并时保留来源主题，不把同一条风险重复展示。

**P2 完成门槛：** 在 3 个重点主题上，产品能明确解释“为什么报、为什么不报、看了哪些条款”。达到这里，可以在简历写“设计租房合同审查 Playbook，覆盖 5 类高价值风险场景”，但要附样本和测试范围。

## P3：复杂合同理解——处理跨条款、定义和反证

目标：解决当前最能被豆包拉开差距的地方：风险不是一句话，而是多条款组合出来的。

### Task P3.1：合同结构和事实索引

**Files:**
- Modify: `src/utils/contractBlocks.js`、`src/utils/fileImport.js`：保留条款编号、标题、表格和附件来源。
- Create: `src/features/contractFacts.js`：提取金额、日期、期限、通知方式、主体、定义和引用。
- Test: `tests/contract-facts.test.mjs`、Word/PDF/OCR 结构回归。

- [ ] 每个条款生成稳定 id，例如 `clause-3-payment`。
- [ ] 定义“租金逾期”“月度应付款”等术语并记录原文位置。
- [ ] 记录正文、附件、表格、补充协议的来源和优先级。
- [ ] 数字字段保留原文和规范化值，避免 OCR 或模型改写金额。

### Task P3.2：关联条款复核

**Files:**
- Create: `src/features/contractReviewGraph.js`：建立定义—引用—后果关系。
- Modify: `src/features/aiAssistant.js`：把关联条款作为复核上下文。
- Test: 01 的 A1、A5、A11、A14、A15 专项回归。

- [ ] 对“租金逾期”沿用第三条定义到第九条后果的链条做测试。
- [ ] 对正文、表格和补充协议冲突做优先级测试。
- [ ] 复核阶段要求模型列出支持结论的多处证据，并检查相反保护条款。
- [ ] 发现矛盾时输出“待核对版本”，不要擅自选择一处作为最终合同规则。

**P3 完成门槛：** 在保留的盲测集上，跨条款专项召回率达到预设目标，并且比“同一模型一次性直接审查”有可复现提升。达到这里，简历才可以写“通过结构化条款和关联证据降低跨条款漏检”，并附具体数据。

## P4：RAG 和评测——证明知识检索真的带来收益

目标：让 RAG 从固定关键词检索升级为可评估的专题知识检索，并证明它对风险解释和建议质量有帮助。

### Task P4.1：风险驱动检索

**Files:**
- Modify: `server/rag-engine.mjs`：增加风险主题、同义表达、适用范围和来源等级。
- Modify: `src/features/aiAssistant.js`：按风险卡和合同事实生成检索查询。
- Test: `server/data/ai-eval-cases.mjs`、RAG 评测脚本。

- [ ] 每个主题单独召回相关法规、示范文本和产品建议。
- [ ] 检索结果返回来源、适用范围、更新时间和匹配原因。
- [ ] 评估 top-k 命中率，错误法规或不适用范围不得进入最终依据。
- [ ] 不使用 RAG 结果直接决定“有无风险”；RAG 只提供依据和解释材料。

### Task P4.2：对照实验报告

**Files:**
- Create: `scripts/evaluate-contract-review-quality.mjs`。
- Create: `docs/contract-review-quality-report.md`。
- Modify: `scripts/contract-review-benchmark-data.mjs`：区分调试集、验证集、盲测集。

- [ ] 固定同一个模型、温度、合同、立场和输出格式，比较四组：直接问模型、本地规则、规则加 RAG、规则加 RAG 加专题复核。
- [ ] 至少记录重大风险召回率、精确率、证据支持率、误报数、平均耗时和成本。
- [ ] 用 20–30 份探索样本起步，其中保留至少 20% 负例和未参与调试的验证样本。
- [ ] 对争议风险记录“人工待核验”，不要强行二元判定。

**P4 完成门槛：** 有一份面试官可打开的报告，能说明当前方案在哪些场景提升、在哪些场景没有提升。达到这里，简历可以写“搭建合同审查评测集和 A/B 对照，按召回、误报和证据支持率迭代”，这是最值得写的成果。

## P5：作品集表达和后续产品化

目标：把质量工作转化成面试官看得懂的产品决策，而不是继续无限加技术。

### Task P5.1：Demo 交互和结果分层

**Files:**
- Modify: `src/components/ReviewInputPanel.jsx`、`src/components/ReviewAtoms.jsx`、`src/App.jsx`。
- Create: `docs/portfolio/contract-review-case-study.md`。

- [ ] 首页 Demo 只展示一个复杂合同和一个低风险对照。
- [ ] 风险卡按“明确风险、待核对、信息缺失”分组。
- [ ] 每条卡片展示原文、关联条款、为什么提示、建议动作和复查入口。
- [ ] 失败状态展示输入、输出、证据三类质量指标，不把 0 风险解释成安全。

### Task P5.2：简历版本和面试话术

**Files:**
- Create: `docs/portfolio/contract-review-resume-bullets.md`。

- [ ] 没有盲测数据前，只写：
  “设计并实现租客视角的 AI 租房合同审查流程，融合本地规则、知识检索、模型语义复核和原文证据校验，支持风险解释、协商建议与修订复查。”
- [ ] 完成 P0–P1 后可补：
  “针对模型输出截断、证据失配和失败误判建立可靠性兜底，审查失败不再输出低风险结论。”
- [ ] 完成 P2–P3 后可补：
  “将押金、续租、维修、入户和解约拆为审查标准，增加跨条款关联证据和反证复核。”
- [ ] 完成 P4 后再写具体数字；数字必须来自盲测报告，不能来自同一批调试样本。
- [ ] 面试被问“为什么不直接问豆包”时，回答产品差异：标准化审查范围、原文证据、失败可见、修改复查和可测量质量；不要声称模型本身更强。

**P5 完成门槛：** Demo 可在 5 分钟内展示一个命中案例、一个负例、一次失败重试和一次修改后复查；简历、项目文档和实际代码的范围与数据一致。

## 推荐的停止点

如果时间有限，做到 P0–P2 就可以作为作品集版本提交：

- P0：不误判失败为低风险；
- P1：风险有原文证据和可定位结果；
- P2：有明确的租客审查标准和正负例。

做到 P0–P2 时，建议简历写“实现了可核验的租房合同审查 Demo”，不要写“超过通用大模型准确率”。

做到 P3，才可以写“支持复杂合同的跨条款风险识别”，前提是有专门评测结果。

做到 P4，才可以写“在某某测试集上将某项召回率从 A 提升至 B”，并同时写样本规模、对照组和限制。

做到 P5，才是完整的 AI 产品经理作品集交付：产品范围、技术链路、失败案例、评测结果和迭代取舍都能在面试中讲清楚。

## 自我检查

- Spec coverage：P0 覆盖失败状态和传输；P1 覆盖证据；P2 覆盖标准卡；P3 覆盖结构和跨条款；P4 覆盖 RAG 和盲测；P5 覆盖 Demo 与简历表达。
- Placeholder scan：没有使用 TBD、TODO 或未定义的函数接口。
- Type consistency：`parseAiReviewResponse`、`qualityReport.status`、`verificationStatus`、`relatedEvidence` 的接口在任务之间保持一致。
- Review focus coverage：五类重点失败场景分别由 P0.1、P1.1、P1.1、P2.1、P3.2 的测试承担。
