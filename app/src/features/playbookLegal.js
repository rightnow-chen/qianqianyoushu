// 标准卡 → 法条映射：让 AI 补盲风险按 playbookId 拿到可核实的法条。
//
// 背景（2026-11-23 诊断）：
//   - AI 审查 prompt 明令禁止模型生成法条（aiAssistant.js 的 JSON schema 无该字段），
//     所以 AI 补盲风险的 legalBasis 只能是兜底文案，永远没有具体条号。
//   - 唯一补法条的 enrichFindingsWithLegalBasis 靠逐字证据匹配；AI 补盲的本就是本地
//     规则没覆盖的条款，本地无同句 finding 可借，继承必然失败。
//   - 法条表 LEGAL_BASIS_MAP 的 key 是本地 finding id（lease-xxx），AI 带的是标准卡 id
//     （deposit-settlement 等），两套 id 对不上，无法按卡查表。
//
// 本模块以标准卡的 legalSources 为唯一权威源（contractReviewPlaybook.js，逐条核实过）：
//   - 住房租赁条例第 9/10/11/12 条：中国政府网 2025 国务院公报全文核对（2026-11-23）。
//   - 民法典第 704/705/709/710/712/713/714/716/718/733/585/563 条：
//     共产党员网民法典全文页抓取逐条核对（正文 118332 字，2026-11-23）。
// 不在表里 = 不给法条（诚实标「未匹配到具体法条」），绝不凭印象编条号。

import { contractReviewPlaybook } from '../data/contractReviewPlaybook.js'
import { resolveLegalUrl } from './legalBasisMap.js'

// 标准卡 id → 用于展示和链接的法条简称 + 依据描述。
// lawLabel 必须能被 resolveLegalUrl 解析（含法名 + 条号），否则链接隐藏。
// basis 用条文要旨描述，不是法条全文——法条原文走链接。
const CARD_LEGAL = {
  'deposit-settlement': {
    lawLabel: '住房租赁条例第十条',
    basis: '押金数额、返还时间和扣减情形应在合同中约定，无正当理由不得扣减。',
  },
  'renewal-rent-change': {
    lawLabel: '民法典第七百零四条、第七百零五条',
    basis: '租金及支付方式、租赁期限应由双方约定，续租与租期变更需协商一致。',
  },
  'repair-duty': {
    lawLabel: '民法典第七百一十条、第七百一十二条、第七百一十三条',
    basis: '出租人负有维修义务；正常使用损耗不担责，承租人可请求维修或在出租人未维修时自行维修。',
  },
  'entry-and-consent': {
    lawLabel: '住房租赁条例第九条第三项、第十一条第五项',
    basis: '未经承租人同意不得擅自进入租赁住房；对出租人依法确需进入的应予配合。',
  },
  'early-termination-loss': {
    lawLabel: '民法典第五百八十五条、第五百六十三条',
    basis: '违约金过分高于损失可请求调整；合同解除应符合法定或约定情形。',
  },
  'utilities-and-fees': {
    lawLabel: '民法典第七百零四条',
    basis: '租金及费用支付方式应在合同中明确约定，避免单方定价或不透明代收。',
  },
  'sublease-and-cohabitation': {
    lawLabel: '民法典第七百一十六条、第七百一十八条',
    basis: '转租应经出租人同意；知道转租后六个月内未提出异议的视为同意。',
  },
  'attachments-and-inventory': {
    lawLabel: '民法典第七百一十条、第七百一十四条、第七百三十三条',
    basis: '承租人应妥善保管；正常损耗不担责，租期届满按使用后状态返还。',
  },
  'pet-and-use-restrictions': {
    lawLabel: '民法典第七百零九条',
    basis: '承租人应按约定方法或租赁物性质使用，使用限制的处罚应与实际损害相称。',
  },
}

// 只保留标准卡里确实存在的 id，避免数据文件改了以后映射表残留幽灵条目。
export const PLAYBOOK_LEGAL_MAP = Object.fromEntries(
  Object.entries(CARD_LEGAL).filter(([id]) => Boolean(contractReviewPlaybook[id])),
)

/**
 * 按标准卡 id 取法条元数据（法条简称 / 依据描述 / 原文链接）。
 * 取不到返回 null——调用方据此保持「未匹配到具体法条」的诚实文案。
 */
export function legalForPlaybook(playbookId) {
  const entry = PLAYBOOK_LEGAL_MAP[String(playbookId || '')]
  if (!entry) return null
  return {
    legalLaw: entry.lawLabel,
    legalBasis: entry.basis,
    legalUrl: resolveLegalUrl(entry.lawLabel),
  }
}
