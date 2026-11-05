// 军师生成质量评测集 —— 用例数据
// 双层设计：
//   1. 离线层（evaluate-advisor.mjs 直接断言，不依赖 API key，做 CI 门禁）
//   2. 真模型层（evaluate-advisor-live.mjs，有 DEEPSEEK_API_KEY 时跑生成质量）

// 权威法条池：来自 knowledgeBase.js 与 legalBasisMap.js 的 source 字段，
// 用于断言「军师不得编造不存在的法条编号」。评测里出现的法条名必须命中此池。
export const AUTHORITY_LAW_TERMS = [
  '民法典',
  '第七百零三条',
  '第七百一十条',
  '第七百二十二条',
  '第七百三十三条',
  '第五百八十五条',
  '第四百九十六条',
  '住房租赁条例',
  '商品房屋租赁管理办法',
  '国务院令',
]

// 离线层用例：验证提示词结构、四段式约束、兜底区分、脱敏、空 content 保护
export const offlineCases = [
  {
    id: 'prompt-four-section',
    name: '军师 system prompt 必须注入四段式输出约束',
    run(ctx) {
      const p = ctx.buildNegotiationSystemPrompt({ finding: ctx.finding, state: ctx.state, tone: 'online' })
      const required = ['对方立场', '应对策略', '可直接发的话术', '底线提醒']
      const missing = required.filter((k) => !p.includes(k))
      return { pass: missing.length === 0, detail: missing.length ? `缺少段：${missing.join('、')}` : '四段式齐全' }
    },
  },
  {
    id: 'prompt-no-fabricate',
    name: 'system prompt 必须包含「不编造法条」红线',
    run(ctx) {
      const p = ctx.buildNegotiationSystemPrompt({ finding: ctx.finding, state: ctx.state, tone: 'online' })
      return { pass: p.includes('不编造'), detail: p.includes('不编造') ? '含不编造约束' : '缺不编造约束' }
    },
  },
  {
    id: 'prompt-inject-evidence',
    name: 'system prompt 必须注入合同原文证据与建议底线',
    run(ctx) {
      const p = ctx.buildNegotiationSystemPrompt({ finding: ctx.finding, state: ctx.state, tone: 'online' })
      const hasEvidence = p.includes(ctx.finding.evidence)
      const hasSuggestion = p.includes(ctx.finding.suggestion)
      return { pass: hasEvidence && hasSuggestion, detail: `证据=${hasEvidence} 建议=${hasSuggestion}` }
    },
  },
  {
    id: 'fallback-local-mode',
    name: '仅本地模式下兜底话术须明确指向「隐私开关」，而非「离线」',
    run(ctx) {
      const r = ctx.createLocalNegotiationFallback({ finding: ctx.finding, state: ctx.state, mode: 'local' })
      return {
        pass: r.includes('仅本地分析') && !r.includes('军师离线'),
        detail: r.includes('仅本地分析') ? '正确提示本地模式' : '误报为离线',
      }
    },
  },
  {
    id: 'fallback-offline-mode',
    name: '真离线兜底话术须明确「无法连接 AI 服务」',
    run(ctx) {
      const r = ctx.createLocalNegotiationFallback({ finding: ctx.finding, state: ctx.state, mode: 'offline' })
      return { pass: r.includes('军师离线') || r.includes('无法连接'), detail: '正确提示离线' }
    },
  },
  {
    id: 'fallback-keeps-script',
    name: '本地兜底须携带 finding 的预案话术（保证不空窗）',
    run(ctx) {
      const r = ctx.createLocalNegotiationFallback({ finding: ctx.finding, state: ctx.state, mode: 'offline' })
      return { pass: r.includes('预案话术') && r.includes('应对策略'), detail: '预案完整' }
    },
  },
  {
    id: 'redact-sensitive',
    name: '脱敏：手机号、身份证号不得出现在发给模型的内容中',
    run(ctx) {
      const { redactSensitiveText } = ctx
      const raw = '张三 13800138000 110101199001011234 王五 13900139000'
      const out = redactSensitiveText(raw)
      return {
        pass: !/\d{11}/.test(out) && !/\d{17}[\dXx]/.test(out),
        detail: out,
      }
    },
  },
]

// 真模型层用例：需要真实 API，断言生成质量
// finding 字段取自项目风险模型；expected 用「要点关键词」做粗粒度断言，避免过度拟合
export const liveCases = [
  {
    id: 'live-high-entry',
    name: '高风险「无通知进入」开场话术',
    finding: {
      title: '出租方可随时进入房屋',
      levelText: '高风险',
      evidence: '甲方及中介人员有权在合理时间进入房屋检查、维修或带人看房，无需另行征得乙方同意。',
      suggestion: '要求除紧急维修外，进入前提前通知并经承租人确认。',
      legalBasis: '民法典第七百一十条',
    },
    state: { status: 'pending' },
    userPrompt: '我还没跟房东正式提这一条，给我一版友好但立场清楚的开场说法。',
    expectKeywords: ['通知', '进入'],
    expectFourSections: true,
    expectScriptWrapped: true,
  },
  {
    id: 'live-deposit-deduction',
    name: '押金随意扣减的应对',
    finding: {
      title: '押金可任意扣减',
      levelText: '高风险',
      evidence: '退租时押金可扣除保洁费、维修费及管理费，无需提供票据。',
      suggestion: '要求扣减必须有实际损失、清单和票据，正常损耗不得扣款。',
      legalBasis: '住房租赁条例',
    },
    state: { status: 'negotiating' },
    userPrompt: '房东坚持要扣我 800 保洁费，但房子我走时是干净的，怎么回他？',
    expectKeywords: ['票据', '清单', '损耗'],
    expectFourSections: true,
    expectScriptWrapped: true,
  },
  {
    id: 'live-maintenance-transfer',
    name: '维修责任全转租客的反驳',
    finding: {
      title: '维修责任全部由租客承担',
      levelText: '高风险',
      evidence: '房屋内水、电、暖气及电器维修费用均由乙方承担。',
      suggestion: '自然老化与房东提供的设施故障应由出租人承担维修。',
      legalBasis: '民法典第七百一十条',
    },
    state: { status: 'pending' },
    userPrompt: '合同让我全包维修费，这合理吗？我该怎么和房东谈？',
    expectKeywords: ['维修', '老化'],
    expectFourSections: true,
    expectScriptWrapped: true,
  },
  {
    id: 'live-no-fabricate-law',
    name: '不编造法条：军师输出法条必须命中权威池',
    finding: {
      title: '违约金过高',
      levelText: '中风险',
      evidence: '提前解约须支付剩余租期全部租金作为违约金。',
      suggestion: '违约金应以实际损失为限，明显过高可请求调整。',
      legalBasis: '民法典第五百八十五条',
    },
    state: { status: 'pending' },
    userPrompt: '这个违约金条款是不是太高了，能谈吗？',
    expectKeywords: ['违约金'],
    expectFourSections: true,
    expectScriptWrapped: true,
    expectNoFabricatedLaw: true,
  },
]
