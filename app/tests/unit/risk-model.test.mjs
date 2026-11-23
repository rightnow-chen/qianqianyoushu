// 档位映射单测：锁死「严重度 + 置信度 + findingType → 用户看到的档位」的换算。
// 背景：2026-11-16 诊断发现分档漂移长期无人发现，因为这一层没有任何单测。
// 2026-11-17 缺陷库评测驱动加入 findingType 参与定档，这里把新旧口径一起锁死。
// 运行：node tests/unit/risk-model.test.mjs

import assert from 'node:assert/strict'
import { levelFromSeverity, LEVELS, LEVEL_ORDER, countByLevel, lawDisplay } from '../../src/features/riskModel.js'

// ---- 基础三档映射（不传 findingType，必须与旧版完全一致）----
assert.equal(levelFromSeverity('high', 'confirmed'), 'must', '高风险+确定 → 必须改')
assert.equal(levelFromSeverity('high', 'verify'), 'must', '高风险+需确认 → 必须改')
assert.equal(levelFromSeverity('high', 'inferred'), 'check', '高风险+AI推断 → 降级为建议确认（PRD FR-10）')
assert.equal(levelFromSeverity('medium', 'confirmed'), 'check', '中风险 → 建议确认')
assert.equal(levelFromSeverity('medium', 'verify'), 'check', '中风险 → 建议确认')
assert.equal(levelFromSeverity('low', 'confirmed'), 'note', '低风险 → 仅提醒')
assert.equal(levelFromSeverity('unknown', 'confirmed'), 'note', '未知严重度 → 保守按仅提醒')

// ---- findingType 参与定档（新增口径）----
// 有明确不利机制的 finding，severity=medium 时不能被拉成 check
assert.equal(levelFromSeverity('medium', 'confirmed', 'explicit_disadvantage'), 'must', '明确不利机制+中风险 → 必须改（修往轻判）')
assert.equal(levelFromSeverity('medium', 'verify', 'explicit_disadvantage'), 'must', '明确不利机制+需确认 → 必须改')
assert.equal(levelFromSeverity('medium', 'confirmed', 'missing_term'), 'must', '缺失关键条款+中风险 → 必须改')
assert.equal(levelFromSeverity('medium', 'verify', 'missing_term'), 'must', '缺失关键条款+需确认 → 必须改')

// needs_review 表达"待核对"，保持原映射，不能一刀切抬档
assert.equal(levelFromSeverity('medium', 'confirmed', 'needs_review'), 'check', '待核对+中风险 → 建议确认（不抬档）')
assert.equal(levelFromSeverity('low', 'confirmed', 'needs_review'), 'note', '待核对+低风险 → 仅提醒')
assert.equal(levelFromSeverity('medium', 'confirmed', null), 'check', '无 findingType → 维持旧映射')
assert.equal(levelFromSeverity('medium', 'confirmed', 'unknown_type'), 'check', '未知 findingType → 维持旧映射')

// high 遇到 inferred 的降级规则不受 findingType 影响（PRD FR-10 优先级更高）
assert.equal(levelFromSeverity('high', 'inferred', 'explicit_disadvantage'), 'check', 'AI推断的高风险仍降级，findingType 不覆盖置信度降级')

// ---- 常量与计数（回归保护）----
assert.deepEqual(Object.keys(LEVELS), ['must', 'check', 'note'])
assert.deepEqual(LEVEL_ORDER, ['must', 'check', 'note'])
const counted = countByLevel([{ level: 'must' }, { level: 'must' }, { level: 'check' }, { level: 'bogus' }])
assert.deepEqual(counted, { must: 2, check: 1, note: 1, total: 4 }, '未知档位归入 note 且计入总数')

// ---- 法条显示归一：真实 {name,basis} 与演示 {name,version,scope} 两套结构 ----
// 回归背景：界面曾直接读 version/scope，真实合同里这俩不存在，渲染成「法律依据 ·· 」。
const realLaw = lawDisplay({ name: '《民法典》第五百八十五条', basis: '违约金过分高于损失可请求减少。', url: 'https://x/law', verified: true })
assert.equal(realLaw.headline, '《民法典》第五百八十五条', '真实结构取 name')
assert.equal(realLaw.detail, '违约金过分高于损失可请求减少。', '真实结构取 basis')
assert.equal(realLaw.url, 'https://x/law')

const demoLaw = lawDisplay({ name: '《民法典》第七百一十条', version: '2021 施行', scope: '北京 · 全国性法律', url: '' })
assert.equal(demoLaw.headline, '《民法典》第七百一十条', '演示结构仍取 name')
assert.equal(demoLaw.detail, '2021 施行 · 北京 · 全国性法律', '演示结构无 basis 时用 version·scope 兜底')

const emptyLaw = lawDisplay({ name: null, basis: '', url: '' })
assert.equal(emptyLaw.headline, '未匹配到具体法条', '无法条时诚实标注，绝不编造条号')
assert.equal(emptyLaw.detail, '', '无描述就不显示，不出现空点')
assert.equal(lawDisplay(null).headline, '未匹配到具体法条', 'law 缺失也不崩')

console.log('risk-model 单测通过：基础三档 + findingType 抬档 + 向后兼容 + 常量计数 + 法条显示归一')
