// 法条溯源链接守门测试：
// 1) 每条法律依据的法名必须能解析出权威原文链接（不允许解析失败静默丢链接）
// 2) 链接必须落在权威域名白名单内，且必须是内容页而非站点首页（防止再出现「点开全是 gov.cn 首页」）
// 3) 带条号的依据必须生成 Chrome 文本片段（#:~:text=第X条），打开即定位到条文
// 4) knowledgeBase 的 sourceUrl 不得再出现已验证失效的历史死链
import assert from 'node:assert/strict'
import { LEGAL_BASIS_MAP, LAW_FULL_TEXT_URLS, resolveLegalUrl } from '../src/features/legalBasisMap.js'
import { knowledgeBaseItems } from '../src/data/knowledgeBase.js'
import { analyzeContract } from '../src/features/contractReview.js'

const AUTHORITATIVE_HOSTS = new Set([
  'www.gov.cn',
  'www.12371.cn',
  'cicc.court.gov.cn',
])

// 历史死链黑名单（2026-10-09 用户实测：全部打不开或跳站点首页）
const DEAD_URL_FRAGMENTS = [
  'gov.cn/xinwen/2020-06/01/content_5516649.htm', // 民法典旧页，gov.cn 改版后 404
  'moj.gov.cn/pub/sfbgw/flfggz', // 司法部旧页，重定向死循环
  'npc.gov.cn/npc/c30834', // 人大网旧文章页，重定向回首页
]

const assertAuthoritativeUrl = (url, label) => {
  const parsed = new URL(url.replace(/#:~:text=.*$/, ''))
  assert.ok(
    AUTHORITATIVE_HOSTS.has(parsed.host),
    `${label} 链接域名不在权威白名单: ${url}`,
  )
  assert.ok(parsed.pathname.length > 5, `${label} 疑似站点首页链接: ${url}`)
  for (const dead of DEAD_URL_FRAGMENTS) {
    assert.ok(!url.includes(dead), `${label} 引用了历史死链: ${url}`)
  }
}

// 1) 映射表全量检查
const entries = Object.entries(LEGAL_BASIS_MAP)
assert.ok(entries.length >= 40, `法律依据映射应覆盖 40+ 条风险，当前 ${entries.length}`)

for (const [findingId, legal] of entries) {
  const url = resolveLegalUrl(legal.law)
  assert.ok(url, `${findingId} 的法名「${legal.law}」无法解析出权威链接`)
  assertAuthoritativeUrl(url, findingId)

  // 法名里的条号必须出现在定位片段里
  const article = legal.law.match(/第[一二三四五六七八九十百零0-9]+条/)?.[0]
  if (article) {
    assert.ok(url.includes(`#:~:text=${encodeURIComponent(article)}`), `${findingId} 链接缺少条文定位片段: ${url}`)
  }

  // 法名必须以已知法律开头（防止「民法典第七百条X」这类笔误被静默跳过）
  const knownNames = Object.keys(LAW_FULL_TEXT_URLS)
  assert.ok(
    knownNames.some((name) => legal.law.startsWith(name) || legal.law.includes(name)),
    `${findingId} 法名「${legal.law}」不属于任何已收录法律`,
  )
}

// 2) 关键法条的链接逐条抽查（防法律与链接错配，如民诉法条链接到民法典页）
assert.equal(
  resolveLegalUrl('民法典第七百一十条'),
  `${LAW_FULL_TEXT_URLS.民法典}#:~:text=${encodeURIComponent('第七百一十条')}`,
)
assert.ok(resolveLegalUrl('民事诉讼法第三十五条（协议管辖）').startsWith(LAW_FULL_TEXT_URLS.民事诉讼法))
assert.ok(resolveLegalUrl('住房租赁条例第十条').startsWith(LAW_FULL_TEXT_URLS.住房租赁条例))
assert.ok(resolveLegalUrl('房地产经纪管理办法第二十五条').startsWith(LAW_FULL_TEXT_URLS.房地产经纪管理办法))
assert.equal(resolveLegalUrl('未知法律第一条'), null, '未知法律应返回 null 而非瞎猜链接')

// 3) 审查产出的 finding 必须携带解析后的链接（端到端）
const findings = analyzeContract('退租时甲方可从押金中直接扣除全屋保洁费800元、家具自然折旧费600元及甲方认为必要的其他费用，无需提供证据。')
const depositFinding = findings.find((item) => item.id === 'lease-arbitrary-deposit-deduction')
assert.ok(depositFinding?.legalUrl, '审查结果应携带法条链接')
assert.ok(depositFinding.legalUrl.includes('#:~:text='), '审查结果的法条链接应带条文定位')

// 4) knowledgeBase 不复活历史死链
for (const item of knowledgeBaseItems) {
  if (!item.sourceUrl) continue
  assertAuthoritativeUrl(item.sourceUrl, `知识库「${item.title}」`)
}

console.log(`legal-basis 守门通过：${entries.length} 条依据、${Object.keys(LAW_FULL_TEXT_URLS).length} 个权威源全部合规`)
