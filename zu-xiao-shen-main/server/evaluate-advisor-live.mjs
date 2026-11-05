// 军师生成质量 —— 真模型评测（需 DEEPSEEK_API_KEY，走 8787 代理）
// 覆盖：四段式完整 / 话术字数 / 话术用「」包裹 / 不编造法条
// 运行：node server/evaluate-advisor-live.mjs [--runs 3]
//   --runs N：每条用例采样 N 次（默认 3），按通过率判定，避免 temperature 随机性误报
import { liveCases, AUTHORITY_LAW_TERMS } from './data/advisor-eval-cases.mjs'
import { createNegotiationMessages } from '../src/features/negotiationAi.js'

const PROXY_URL = process.env.AI_PROXY_URL || 'http://127.0.0.1:8787/api/ai/chat'
const ORIGIN = process.env.AI_PROXY_ORIGIN || 'http://localhost:5173'

const runsArg = process.argv.find((a) => a === '--runs')
const RUNS = runsArg ? Math.max(1, parseInt(process.argv[process.argv.indexOf(runsArg) + 1], 10) || 1) : 3
const PASS_RATE_THRESHOLD = 0.67 // 通过率低于此值判 FAIL

// 提取「」包裹的话术段落，用于字数断言
function extractScript(reply) {
  const match = reply.match(/「([\s\S]*?)」/)
  return match ? match[1] : ''
}

// 检查 reply 是否引用了权威法条池之外的法条编号（如「民法典第八百条」）
function findFabricatedLaw(reply) {
  const suspicious = reply.match(/(?:民法典|刑法|合同法|城市房地产管理法|治安管理处罚法)\s*第?[零一二三四五六七八九十百千0-9]+条/g) || []
  const fabricated = suspicious.filter((term) => {
    const normalized = term.replace(/\s+/g, '')
    return !AUTHORITY_LAW_TERMS.some((auth) => normalized.includes(auth) || auth.includes(normalized))
  })
  return fabricated
}

// 对单次回复做断言，返回问题数组
function evaluateReply(reply, testCase) {
  const { expectKeywords, expectFourSections, expectScriptWrapped, expectNoFabricatedLaw } = testCase
  const problems = []

  if (!reply) {
    problems.push('content 为空')
    return problems
  }

  if (expectFourSections) {
    const sections = ['对方立场', '应对策略', '可直接发的话术', '底线提醒']
    const missing = sections.filter((s) => !reply.includes(s))
    if (missing.length) problems.push(`缺段落：${missing.join('、')}`)
  }
  if (expectKeywords?.length) {
    const missed = expectKeywords.filter((kw) => !reply.includes(kw))
    if (missed.length) problems.push(`缺要点：${missed.join('、')}`)
  }
  if (expectScriptWrapped) {
    const script = extractScript(reply)
    if (!script) problems.push('话术未用「」包裹')
    else if (script.length > 120) problems.push(`话术超长：${script.length} 字`)
  }
  if (expectNoFabricatedLaw) {
    const fabricated = findFabricatedLaw(reply)
    if (fabricated.length) problems.push(`疑似编造法条：${fabricated.join('、')}`)
  }
  return problems
}

// 单次采样（每次带独立 x-rental-safe-account，绕过 40 次/天额度限制，也不污染用户额度）
// content 为空属于推理模型偶发长思考溢出，自动重试一次
async function sampleOnce(messages) {
  const evalAccount = `advisor-eval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'x-rental-safe-account': evalAccount },
      body: JSON.stringify({ messages, temperature: 0.4, maxTokens: 3000 }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${data?.message || 'unknown'}`)
    const content = data?.choices?.[0]?.message?.content || ''
    if (content) return content
  }
  return ''
}

let passCount = 0
const failures = []

for (const testCase of liveCases) {
  const messages = createNegotiationMessages({
    finding: testCase.finding,
    state: testCase.state,
    tone: 'online',
    chatHistory: [],
    userPrompt: testCase.userPrompt,
    ragItems: [],
  })

  let okRuns = 0
  const runProblems = []

  for (let i = 0; i < RUNS; i += 1) {
    try {
      const reply = await sampleOnce(messages)
      const problems = evaluateReply(reply, testCase)
      if (problems.length === 0) okRuns += 1
      else runProblems.push(`第${i + 1}次：${problems.join('；')}`)
    } catch (error) {
      runProblems.push(`第${i + 1}次请求失败：${error.message}`)
    }
  }

  const passRate = okRuns / RUNS
  const pass = passRate >= PASS_RATE_THRESHOLD - 1e-9

  if (pass) {
    passCount += 1
    console.log(`PASS ${testCase.id}  ${testCase.name}（通过率 ${Math.round(passRate * 100)}%）`)
  } else {
    failures.push({ id: testCase.id, name: testCase.name, detail: `通过率 ${Math.round(passRate * 100)}% < ${PASS_RATE_THRESHOLD * 100}%` })
    console.log(`FAIL ${testCase.id}  ${testCase.name}（通过率 ${Math.round(passRate * 100)}%）`)
    runProblems.forEach((p) => console.log(`      -> ${p}`))
  }
}

console.log(`\n军师真模型评测：${passCount}/${liveCases.length} passed（每条采样 ${RUNS} 次，通过率阈值 ${PASS_RATE_THRESHOLD * 100}%）`)
if (failures.length > 0) {
  console.log('\n失败明细：')
  failures.forEach((f) => console.log(`  - ${f.id}：${f.detail}`))
  process.exitCode = 1
}
