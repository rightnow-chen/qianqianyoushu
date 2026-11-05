// 军师生成质量 —— 离线评测（CI 门禁，不依赖 API key）
// 覆盖：提示词结构 / 四段式约束 / 兜底区分 / 脱敏
// 运行：node server/evaluate-advisor.mjs
import { offlineCases, liveCases } from './data/advisor-eval-cases.mjs'
import {
  buildNegotiationSystemPrompt,
  createNegotiationMessages,
  createLocalNegotiationFallback,
} from '../src/features/negotiationAi.js'
import { redactSensitiveText } from '../src/utils/privacy.js'

// 复用一个有代表性的 finding，供离线断言使用
const sampleFinding = {
  title: '出租方可随时进入房屋',
  levelText: '高风险',
  evidence: '甲方及中介人员有权在合理时间进入房屋检查、维修或带人看房，无需另行征得乙方同意。',
  suggestion: '要求除紧急维修外，进入前提前通知并经承租人确认。',
  negotiation: '房东您好，关于进入房屋的条款，希望除紧急维修外能提前通知并经我同意，您看可以吗？',
  legalBasis: '民法典第七百一十条',
}
const sampleState = { status: 'pending' }

const ctx = {
  buildNegotiationSystemPrompt,
  createLocalNegotiationFallback,
  redactSensitiveText,
  finding: sampleFinding,
  state: sampleState,
}

let passCount = 0
const failures = []

for (const testCase of offlineCases) {
  let result
  try {
    result = testCase.run(ctx)
  } catch (error) {
    result = { pass: false, detail: `抛异常：${error.message}` }
  }
  if (result.pass) {
    passCount += 1
    console.log(`PASS ${testCase.id}  ${testCase.name}`)
  } else {
    failures.push({ id: testCase.id, name: testCase.name, detail: result.detail })
    console.log(`FAIL ${testCase.id}  ${testCase.name}\n      -> ${result.detail}`)
  }
}

// 额外校验：createNegotiationMessages 结构正确（system 开头、user 结尾、聊天历史 role 合法）
try {
  const msgs = createNegotiationMessages({
    finding: sampleFinding,
    state: sampleState,
    tone: 'online',
    chatHistory: [{ role: 'user', content: '你好' }, { role: 'assistant', content: '你好' }],
    userPrompt: '给我话术',
    ragItems: [],
  })
  const systemFirst = msgs[0]?.role === 'system'
  const userLast = msgs[msgs.length - 1]?.role === 'user'
  const rolesValid = msgs.every((m) => ['system', 'user', 'assistant'].includes(m.role))
  if (systemFirst && userLast && rolesValid) {
    passCount += 1
    console.log('PASS messages-structure  消息结构正确（system 开头 / user 结尾 / role 合法）')
  } else {
    failures.push({ id: 'messages-structure', name: '消息结构', detail: `systemFirst=${systemFirst} userLast=${userLast} rolesValid=${rolesValid}` })
    console.log('FAIL messages-structure  消息结构异常')
  }
} catch (error) {
  failures.push({ id: 'messages-structure', name: '消息结构', detail: error.message })
}

const total = offlineCases.length + 1
console.log(`\n军师离线评测：${passCount}/${total} passed`)
if (liveCases.length) {
  console.log(`真模型用例 ${liveCases.length} 条（需 API key，用 node server/evaluate-advisor-live.mjs 运行）`)
}

if (failures.length > 0) {
  console.log('\n失败明细：')
  failures.forEach((f) => console.log(`  - ${f.id}：${f.detail}`))
  process.exitCode = 1
}
