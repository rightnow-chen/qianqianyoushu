from pathlib import Path
import shutil
import sys
from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

sys.stdout.reconfigure(encoding='utf-8')
root = Path('G:/zu-xiao-shen-main')
target = root / '租小审_PRD开发任务拆解.docx'
backup = root / 'prd_docx_qa/租小审_PRD开发任务拆解_修订前.docx'
if not backup.exists():
    shutil.copy2(target, backup)
doc = Document(backup)
ps = doc.paragraphs

changes = {
2: '修订日期 2026 年 9 月 27 日   版本 1.1',
4: '本文将两份原始 PRD 转为可执行、可验收的 Web MVP 开发任务。本版补齐输入校验、行动规则、证据分类、隐私存储、并发保护和交付任务。按本文的明确约定实施；产品目标为 2026 年 9 月 30 日前形成在线演示版本，真实试用结果单独记录。',
11: '具体实现要求：Web 默认首页进入“签前有数”单房源流程，显示产品用途、四步流程、开始评估与演示入口。旧合同审查、验房、退租和补贴模块归入“更多工具”次级入口，保持各自数据隔离，不迁入新评估。演示始终显示标识，使用内存状态，不覆盖真实草稿；退出演示可恢复原真实会话。',
13: '注意事项与复用改造：复用现有导航和 AppErrorBoundary；ProposalHome 仅参考布局。旧入口保持可访问，本次不扩展小程序或多房源能力。切换真实与演示会话须使旧请求失效。',
17: '具体实现要求：monthlyBudget、upfrontBudget 均必填且大于零；moveInDate 为有效日期，expectedLeaseMonths 为必填正整数；maxCommuteMinutes 可不填，填写时为正整数。mustHaves 最多五项，使用稳定 id 关联房源匹配状态。通勤、入住和租期默认是偏好；用户可将其加入不可妥协条件，计入五项上限。',
18: '验收标准：缺失必填、非法数字、负数和无效日期可定位提示；预算填零不通过；刷新恢复结构化输入。未填通勤要求不参与匹配，也不生成该项信息缺口。底线超过五项时阻止继续添加并说明原因。',
19: '注意事项与复用改造：参考 subsidyMatcher.js 的规范化模式；新建严格金额解析函数，不直接复用会将空值或非法值变成零的 parseMoney。DATA-02 提供统一存储接口，表单不直接读写 localStorage。',
23: '具体实现要求：月租 monthlyRent 必填且大于零；预付月数 advanceMonths 为正整数或未知。押金 depositAmount、月固定费用 monthlyFixedFees、水电估算 estimatedMonthlyUtilities、中介费 agencyFee、其他签约付款 otherUpfrontFees 均支持非负金额或未知，明确零元需保留确认状态。补充 listingName、area、commuteMinutes、availableFrom、availableLeaseMonths 和逐项底线状态；房源条件允许未知。',
24: '验收标准：contractText 最多 20000 字符；listingText、communicationText 各最多 3000 字符；按 Unicode 码点计数，前后端一致，超限报错且不静默截断。缺合同可继续但标记部分评估。文本抽取值只作为候选，须用户确认后才更新结构化字段；候选与现有值冲突时同时展示来源。',
25: '注意事项与复用改造：P0 仅要求粘贴文本。现有 fileImport.js 与小程序导入校验作为 P1 参考；PDF、DOCX 和图片导入在核心闭环稳定后接入，不作为首版验收前置条件。其他签约付款逐项说明用途，首期预缴的物业、水电等纳入此项，不重复包含租金、押金和中介费；其月度负担仍计入月度费用。',
29: '具体实现要求：依次展示行动建议、费用、主要原因、条件匹配、合同问题、信息缺口、待确认问题、沟通草稿、下一步动作及分析状态。主要原因最多五条，下一步动作最多三项；未展示原因仍保留在结果中。两种草稿默认各不超过 300 字。展示分析方式、材料覆盖、未完成部分、生成时间和过期状态。',
30: '验收标准：不利条款可定位真实原文；未写明事项单列信息缺口。用户可编辑、复制草稿；输入变化立即标记旧结果过期。取消或 AI 失败时仍能查看本地结果及未完成说明，不出现无依据的“可以继续沟通”。',
31: '注意事项与复用改造：仅参考 businessReportExport.js 的风险、证据和行动结构；报告导出为 P1。接收统一结果模型，界面不自行重写费用或行动规则。',
35: '要修改或创建的模块：新建 features/rentalDecision/moneyValue.js、costCalculator.js、decisionRules.js 及对应测试。',
36: '具体实现要求：月度支出＝月租＋月固定费用＋水电估算；首次付款＝月租×预付月数＋押金＋中介费＋其他签约付款。金额最多两位小数，转换为整数分计算；非法格式、负数、超出安全整数计算范围均报错。区分已确认小计、包含估算的预计金额和未知费用清单；只有全部费用已确认时显示确定总额。',
37: '验收标准：月租 2000 元、预付 3 个月、押金 2000 元、中介费 1000 元、其他 0 元时首次付款为 9000 元；押金未知时不显示完整总额。0.10 元与 0.20 元相加为 0.30 元；空值与零元不同；非法输入不降为零。有未知费用时可展示已确认部分至少 X 元，估算部分不得计入该下限。',
38: '注意事项与复用改造：现有 utils/money.js 的 parseMoney 和整数展示格式不满足新需求；新增独立实现以免改变旧模块行为。预算差额分别标记已确认与预计；任一已确认小计已超相应预算即可确定超支，等于预算不算超支。费用规则不能被 AI 输出覆盖。',
42: '具体实现要求：先执行确定性费用和匹配规则，再合并合同问题与分析覆盖。最高优先级为已确认的硬性条件冲突或已确认费用超预算，输出“建议暂缓签约”。其次为仅预计费用超预算、关键费用未知、已填写要求未确认、偏好不匹配、合同缺失、条款待协商、引用未验证或分析未完成，输出“确认关键问题后再决定”。均未触发时输出“可以继续沟通”，不等于建议签约。',
43: '验收标准：已确认超预算即使另有未知费用也建议暂缓；只有估算超预算时提示预计超支并要求确认。已确认通勤超过上限、可入住日晚于计划日、可租月数小于需求时，属于底线则暂缓，属于偏好则先确认。房源信息为估算或未知时，不认定已确认的硬性冲突。合同有待协商条款或 AI 失败时不能落入可以继续沟通。',
44: '注意事项与复用改造：每项输出要求、实际值、状态、来源和原因。未知不是不满足；AI 或描述文本不能直接确认条件。合同与结构化输入不一致时保留两者并列为待确认，不自动覆盖。LOGIC-02 先基于模拟合同结果验证规则，LOGIC-03 完成后联调；“已沟通”标记不改变风险判定。',
47: '要修改或创建的模块：新建 features/rentalDecision/contractEvidence.js；通过适配层复用 features/contractReview.js 与 aiAssistant.js。P0 不要求改造 server/contract-document-parser.mjs；网络接口由 DATA-03 与 LOGIC-04 接入。',
48: '具体实现要求：contractIssues 保存不利条款，含稳定 id、标题、优先级、来源材料、可定位引用、实际影响及确认或协商建议；missingInfo 保存缺失事项，使用“在本次提供的材料中未发现明确约定”，不伪造引用。重点覆盖押金、解约、维修、涨租、入户、费用、违约金和转租。',
49: '验收标准：每条已展示的不利条款引用均可回溯当前材料版本。无法匹配的 AI 引用及其确定性断言不展示，记录对应事项未验证并将覆盖标为未完成。缺失条款无需不存在的原文；无合同时不生成合同确定性结论。脱敏后的引用须能通过本地映射回到原文；映射失败按未验证处理。',
50: '注意事项与复用改造：复用规则库、合同样本和 ai-review-prompt.md。现有合同分析的 missingFindings 与普通 findings 分开适配；原文定位与材料版本绑定，不能把解释文字当作原文。合同部分默认需完成本地规则与 AI 审查；AI 不可用时保留规则结果并标记 partial。',
53: '要修改或创建的模块：新建 features/rentalDecision/analysisOrchestrator.js、aiClient.js；接入 server/rental-decision-ai.mjs，按需调整 aiConfig.js。',
54: '具体实现要求：先计算费用、匹配和本地合同问题，再请求 AI；AI 返回经校验后重新合并行动建议。状态包括 idle、validating、calculating、analyzing、success、partial、cancelled、error，另以独立 stale 标记结果过期。请求绑定 sessionId、inputRevision、requestId，仅三者均匹配当前状态时可写回。AI 超时默认 60 秒，可手动重试，不自动重试。',
55: '验收标准：分析中不可重复提交；输入改变、取消、清除或切换演示会话即中止请求并使请求编号失效；迟到响应不覆盖新状态。缺合同或 AI 失败为 partial，用户取消为 cancelled；校验失败或无法产生本地结果为 error。重试成功后只有覆盖完整才为 success；API Key 不进入前端。',
56: '注意事项与复用改造：参考 miniapp/src/features/remoteAi.js 的纯数据逻辑。miniapp/src/utils/remoteAiRequest.js 依赖 Taro，不直接导入 Web；抽取可复用的纯逻辑，Web 以 fetch 和 AbortController 实现请求。参考 resilience.spec.js 的异常测试，补充清除与编辑时的响应竞争案例。',
61: '具体实现要求：包含 schemaVersion、updatedAt、sessionId、inputRevision、need、listing、materials、analysis、drafts。金额使用 valueCents 与 confirmed、estimated、unknown 状态；unknown 值为 null，非法输入留在表单错误态。来源 source 独立于确认状态；confirmed 仅表示用户确认输入，不代表平台已核实房源。条件匹配使用 met、unmet、unknown，并保留证据状态和来源。',
62: '验收标准：影响评估的输入变更递增 inputRevision，并令旧分析 stale；仅编辑草稿不改变评估版本。analysis 记录输入版本、请求编号、模式、覆盖与生成时间；drafts 记录基于的版本及是否人工编辑。旧版本数据仅按白名单迁移，不支持的未来版本恢复安全默认状态并提示；组件不直接读写存储。',
63: '注意事项与复用改造：参考 subsidyMatcher.js、evidencePack.js 和 miniapp/src/features/workflowContext.js 的状态设计，保留合法输入但不自动迁入旧合同历史。DATA-01 定义内存模型、持久化投影、AI 请求响应契约及结果模型，后续任务共同遵循。',
67: '具体实现要求：仅持久化预算、偏好、房源简称及区域、费用、条件和安全的进度信息，使用专属 key、schemaVersion、updatedAt。listingText、contractText、communicationText、含引用的分析和沟通草稿仅存当前会话内存。刷新恢复结构化表单，报告与草稿重置并提示重新提供材料；有未保存材料时提供页面说明和浏览器支持范围内的离开提醒。',
68: '验收标准：检查实际 localStorage、sessionStorage 和 IndexedDB，不出现本流程原文、引用或草稿。存储不可用或损坏时仍可在内存完成流程并显示恢复限制。清除取消请求、失效化会话、清空内存和专属存储键，迟到响应及自动保存均不能恢复旧值；不清除旧模块或同源其他应用的数据。',
69: '注意事项与复用改造：仅复用规范化和错误处理思路，不整包保存状态，不调用 localStorage.clear()。新流程不写入 App.jsx 的合同历史、旧 AI 反馈或自动导出数据；演示状态不持久化，切换演示后不得覆盖真实表单。',
72: '要修改或创建的模块：新建 server/rental-decision-ai.mjs 并接入 server/ai-proxy.mjs；定义前后端请求响应校验。server/miniapp-ai.mjs 仅参考纯校验逻辑，本次不调整小程序产品行为。',
73: '具体实现要求：以白名单发送当前任务必需的结构化字段和材料；联网前明确告知合同及沟通材料将发送至服务端和模型服务商，允许仅使用本地结果。姓名、联系方式、证件号、银行卡号和精确地址脱敏，保留判断所需金额、日期与条款关系；脱敏映射仅留本地内存。密钥只读服务端环境变量；日志不记录原文、引用、草稿、密钥或完整请求响应。',
74: '验收标准：前端构建产物、浏览器存储和报告中无真实密钥；请求字段及长度在服务端复核。非法 JSON、字段类型错误、超长响应及引用不匹配均降为 partial，不崩溃且不覆盖规则结果。此接口不把材料或 AI 原文结果写入磁盘、数据库或持久缓存；仅保留不含正文的错误码、耗时及请求编号。',
75: '注意事项与复用改造：参考 privacy.js 和 redactRemoteContext 并补齐脱敏测试；沿用现有来源校验、限流和请求体边界。约束仅覆盖本产品实现，界面不得承诺第三方模型服务商零留存。合同和沟通内容均作为待分析数据，不能作为执行指令。',
78: '任务目标：实现完整的可返回修改流程，验证移动端可用性；约五分钟完成演示案例是待验证目标。',
80: '具体实现要求：分两次交付。UX-01A 先建立首页、需求、房源与合同、评估与沟通的流程骨架与导航状态；UX-01B 在结果和沟通功能完成后检查移动端、键盘操作、返回修改和错误提示。更新材料回到相应表单，不新增独立步骤。',
81: '验收标准：375px 与 390px 无横向溢出；错误可定位、操作可用键盘完成；当前会话内返回或请求失败不丢输入。刷新后的恢复范围严格遵循 DATA-02，不能声称刷新恢复合同原文。',
86: '具体实现要求：分别展示来源与确定程度，来源包括合同原文、沟通记录、用户填写、AI 建议；确定程度包括用户确认、估算、待确认。口头承诺不能自动等同合同约定；展示材料覆盖、未验证引用、缺失字段、费用未知项和分析过期状态。',
87: '验收标准：用户能区分已确认小计与预计金额；有未知项不显示完整总价，包含估算不得标成确定下限。AI 失败、缺合同和引用丢弃均显示覆盖不足；无绝对安全或绝对合法表述。',
92: '具体实现要求：最多选择三项稳定 id 关联的问题；生成礼貌询问与明确协商两版草稿，默认每版不超过 300 字，只使用已提供的事实并保留估算、承诺等限定。支持编辑、复制、录入对方回复和重新分析；AI 不可用时由本地模板生成可用草稿，不自动联系任何人。',
93: '验收标准：话术与所选问题对应，无虚构金额、事实或承诺。重评不覆盖人工编辑稿，标记其依据版本过期并提供主动替换入口；替换前保留当前编辑稿供确认。修改材料后评估更新时间改变；勾选已沟通或已处理不能消除原问题，须依据新材料重评。',
94: '注意事项与复用改造：参考 evidencePack.js 的文本生成逻辑，通过本流程存储接口隔离草稿。草稿仅在会话内保留；复制失败提供手动选中文本的方式。',
96: '任务目标：建立覆盖预算超支、合同风险、信息缺失的三类可重复演示与自动化评测案例。',
97: '要修改或创建的模块：新建 data/rentalDecisionDemo.js、features/rentalDecision/feedback.js；补充 demo、规则与 E2E 测试。真实试用记录由 USER-01 负责。',
98: '具体实现要求：三类案例包含预期建议、原因、引用和沟通动作；AI 返回以固定模拟响应完成自动化测试，另覆盖超时、取消、非法输出及旧响应。演示始终标识且与真实会话隔离。feedback 仅记录不含原文和身份信息的任务结果，默认不上传。',
99: '验收标准：三类案例在固定响应下稳定通过；AI 失败仍有本地结果和可复制草稿。覆盖明确零元与未知、估算超支、条款缺失、引用失败、刷新与清除、草稿保护和演示切换。测试数据或自动化通过不得写作真实用户验证结果。',
102: '第一阶段 数据与边界：DATA-01 → DATA-02 → DATA-03。DATA-03 先完成接口契约、校验、脱敏及模拟响应，真实调用在 LOGIC-04 集成。',
106: '金额按分准确计算，空值、非法值、零元、估算和未知可区分；首次付款示例为 9000 元，未知项不冒充完整总额。',
107: '已确认超预算或硬性冲突建议暂缓；仅估算超支、偏好冲突、条款待协商或分析未完成要求先确认；AI 不覆盖确定规则。',
108: '不利条款必须绑定真实原文；缺失事项单列；无法匹配的引用不显示确定性断言，并标记覆盖不足。',
109: 'AI 失败仍保留费用、匹配和本地合同结果，提示未完成范围并支持重试。',
110: '两版沟通草稿可生成、编辑和复制；人工编辑内容不被重评覆盖；已沟通不等于风险消除。',
111: '输入变化立即标记结果过期；取消、清除、编辑或切换演示后，旧响应不能写回当前状态。',
112: '刷新仅恢复白名单中的结构化输入；原文、引用报告和草稿不持久保存；清除后不恢复且不影响旧模块数据。',
113: '375px 与 390px 手机宽度无横向溢出；三类演示、真实流程和失败路径可运行，演示不覆盖真实草稿。',
115: '文档依据：graduation-rental-decision-light-prd.docx 与 产品定位.docx。实现参考：zu-xiao-shen-main/ 目录中的 Web、小程序和服务端代码。本版细化规则优先用于本次 Web MVP；原始定位文档保持不变。',
}

titles = {
8:'FE 01 首页与流程入口',14:'FE 02 用户租房需求表单',20:'FE 03 房源与合同输入页',26:'FE 04 评估结果与沟通页',
33:'LOGIC 01 费用计算与预算判断',39:'LOGIC 02 房源匹配与行动建议',45:'LOGIC 03 合同问题与证据绑定',51:'LOGIC 04 AI 分析与失败处理',
58:'DATA 01 统一评估数据模型',64:'DATA 02 本地持久化与清除',70:'DATA 03 AI 请求与服务端处理',
77:'UX 01 分步流程与移动端',83:'UX 02 来源与不确定性表达',89:'UX 03 沟通草稿与重新评估',95:'UX 04 演示案例与自动化验证',
}
changes.update(titles)
for i,text in changes.items():
    ps[i].text = text

def before(anchor,text,style='Normal'):
    return anchor.insert_paragraph_before(text,style)

before(ps[7], '实施边界：P0 为免登录、单套房源、文本输入和签约前闭环；文件导入、报告导出、历史记录、多房源比较为 P1。小程序、验房、退租、补贴、地图、交易和房源真实性判断不进入本次开发范围。旧模块仅保留兼容入口。')
before(ps[7], '路径约定：代码根目录为 G:\\zu-xiao-shen-main\\zu-xiao-shen-main；新业务逻辑放在 src/features/rentalDecision/，页面组件放在 src/components/rentalDecision/。本文任务编号在正文沿用 FE-01 等形式，标题中的空格形式与其一一对应。')

before(ps[101], '五 部署与用户验证', 'Heading 1')
before(ps[101], 'OPS 01 在线部署与交付检查', 'Heading 2')
before(ps[101], '任务目标：在 2026 年 9 月 30 日前形成无需登录即可访问的在线演示版本；交付日期为目标，实际完成情况据实记录。')
before(ps[101], '要修改或创建的模块：按实际托管方案调整部署配置、README 和环境变量示例；新增 docs/rental-decision-release-checklist.md，记录版本、验证结果和回滚步骤。')
before(ps[101], '具体实现要求：前端与 AI 代理均可访问，密钥仅在服务端配置。上线前运行 lint、build、规则及新增流程测试；对受影响的旧入口做回归。部署后实测真实输入、三类演示、移动端、AI 失败、刷新和清除，不以本地通过代替线上验证。')
before(ps[101], '验收标准：交付可访问链接、通过与未通过的检查记录以及回滚方式。真实模型未配置或未验证时明确标记，仅本地演示通过不计作完整 AI 交付；发布需具备目标环境访问权限及发布授权。')
before(ps[101], 'USER 01 目标用户试用与反馈整理', 'Heading 2')
before(ps[101], '任务目标：邀请 3 至 5 位毕业生或首次租房用户，验证他们能否完成流程、理解原因并采取下一步动作。')
before(ps[101], '要修改或创建的模块：新增 docs/rental-decision-user-test.md，包含任务脚本、匿名记录表与问题清单；复用 UX-04 的演示材料。')
before(ps[101], '具体实现要求：记录实际完成时间、卡点、是否能复述建议原因、是否找到下一步、是否复制话术及是否能重评。招募与联系由项目负责人组织；仅记录经同意的匿名观察，不收集真实合同原文。开发阶段先准备脚本，试用后按严重程度安排修复。')
before(ps[101], '验收标准：保留 3 至 5 份真实匿名记录和改进结论；尚未招募或未完成时标记待验证，不虚构反馈。约五分钟为目标，不预写成已达成结果。可运行版本完成与用户验证完成分别记录。')

before(ps[103], '第二阶段 本地判断：LOGIC-01 → LOGIC-02 → LOGIC-03。LOGIC-02 先使用 DATA-01 契约与模拟合同结果；LOGIC-03 完成后验证合同问题会正确影响行动建议。')
before(ps[103], '第三阶段 可操作流程：UX-01A → FE-01 → FE-02 → FE-03。先打通真实与演示入口、输入校验和恢复，页面消费统一数据与规则。')
before(ps[103], '第四阶段 分析与结果：LOGIC-04 → FE-04 → UX-02 → UX-03。集成真实 AI、结果覆盖与证据定位，再完成草稿和重新评估。')
before(ps[103], '第五阶段 交付验证：UX-01B → UX-04 → OPS-01 → USER-01。演示样本与用户试用脚本可提前准备；上线后记录真实观察并修复影响主流程的问题。')
before(ps[103], '顺序说明：每阶段完成时运行与变更相应的检查；费用、匹配、版本和证据规则使用单元测试，完整流程与存储边界使用 E2E。不得以跳过 DATA-03 或原文持久保存换取演示完成。')
before(ps[115], '提供无需登录的在线演示链接与部署检查记录；未完成的真实 AI 验证如实说明。', 'List Bullet')
before(ps[115], '完成 3 至 5 位目标用户真实试用并记录观察；如尚未完成，用户验证保持待验证状态，不计入已完成项。', 'List Bullet')

table = doc.tables[0]
rows = [
('contractReview.js','复用本地规则；通过适配层区分不利条款、缺失事项和覆盖范围。'),
('evidencePack.js','参考来源、问题和沟通文本结构；不复用整包持久化。'),
('aiAssistant.js 与 remoteAi.js','参考输出处理与纯数据逻辑，增加契约及引用校验。'),
('miniapp 的 remoteAiRequest.js','仅参考超时、取消及错误分类；Taro 请求与登录不进入 Web。'),
('subsidyMatcher.js','参考默认值与规范化；新流程使用独立存储白名单。'),
('money.js privacy.js clipboard.js','金额新增严格解析与分单位计算；脱敏补齐姓名和地址；复制复用。'),
('fileImport.js 与 contractTextImport.js','P1 参考导入实现与校验，不作为 P0 前置依赖。'),
('businessReportExport.js','仅参考结果结构；报告导出为 P1。'),
('demoContracts.js 与 ai-eval-cases.mjs','参考案例与预期输出，增加三类签约决策及异常案例。'),
]
for row,values in zip(table.rows[1:],rows):
    for cell,value in zip(row.cells,values): cell.text=value

# Preserve original fonts, page size and margins; simplify headings and pagination.
for p in doc.paragraphs:
    pf=p.paragraph_format
    pf.widow_control=True
    pf.keep_together=True
    if p.text.startswith('任务目标：'):
        pf.keep_with_next=True
    if p.style.name.startswith('Heading'):
        pf.keep_with_next=True
        pf.space_before=Pt(12 if p.style.name=='Heading 1' else 9)
        pf.space_after=Pt(5)
    elif p.style.name=='Normal' or p.style.name=='List Bullet':
        pf.space_after=Pt(5)
        pf.line_spacing=1.18
    for r in p.runs:
        r.font.name='Microsoft YaHei'
        r._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Microsoft YaHei')
        r.font.color.rgb=RGBColor(0,0,0)
    for border in p._p.xpath('./w:pPr/w:pBdr'):
        border.getparent().remove(border)

for name in ['Title','Heading 1','Heading 2']:
    doc.styles[name].font.color.rgb=RGBColor(0,0,0)
    for border in doc.styles[name].element.xpath('./w:pPr/w:pBdr'):
        border.getparent().remove(border)
for row_index,row in enumerate(table.rows):
    trpr=row._tr.get_or_add_trPr()
    cant=OxmlElement('w:cantSplit');trpr.append(cant)
    if row_index==0:
        repeat=OxmlElement('w:tblHeader');trpr.append(repeat)
    for cell in row.cells:
        tcpr=cell._tc.get_or_add_tcPr()
        borders=OxmlElement('w:tcBorders')
        for name in ['top','left','bottom','right']:
            edge=OxmlElement('w:'+name);edge.set(qn('w:val'),'single');edge.set(qn('w:sz'),'4');edge.set(qn('w:color'),'D9D9D9');borders.append(edge)
        tcpr.append(borders)
        for p in cell.paragraphs:
            p.paragraph_format.space_after=Pt(4)
            p.paragraph_format.space_before=Pt(4)
            for r in p.runs:
                r.font.name='Microsoft YaHei';r.font.size=Pt(9)
                r._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Microsoft YaHei')
                r.font.color.rgb=RGBColor(255,255,255) if row_index==0 else RGBColor(0,0,0)

doc.core_properties.title='租小审 PRD 开发任务拆解'
doc.core_properties.subject='毕业生租房签约决策助手 Web MVP 开发与验收任务'
doc.core_properties.version='1.1'
doc.save(target)
check=Document(target)
assert len([p for p in check.paragraphs if p.style.name=='Heading 2'])==17
text='\n'.join(p.text for p in check.paragraphs)
for needle in ['DATA-03','USER-01','inputRevision','3000','9000','60 秒','待验证','localStorage.clear()']:
    assert needle in text,needle
print(f'Saved {target}; {len(check.paragraphs)} paragraphs; 17 task headings; backup retained.')
