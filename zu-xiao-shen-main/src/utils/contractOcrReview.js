/**
 * OCR 合同文本审查辅助：判断图片 OCR 抽出的文本是否足以进入合同审查，
 * 以及是否需要人工核对关键字段。
 *
 * 说明：真正的 OCR（tesseract.js 本地 / 服务端 /api/ocr/image）在
 * `src/utils/fileImport.js` 中完成；本模块只负责「抽出的文本质量与关键字段
 * 完整性」的事后校验，避免把残缺、占位或纯数字的 OCR 结果直接送进审查引擎。
 */

// 关键字段占位/缺失信号：OCR 抽不出、被遮挡、或原合同本就用占位符
const PLACEHOLDER_RE = /待确认|待定|待填|待补|详见|见附件|（空白）|\(空白\)|___+|×{2,}|X{2,}|□+/i

// 关键字段定义：字段名 → 是否属于「必须核对」的核心字段
const KEY_FIELDS = [
  { name: '租赁期限', label: '租赁期限/起止日期', pattern: /(租赁期限|租赁时间|租赁期间|租期|起租|租赁起止)/, required: true },
  { name: '租金', label: '月租金金额', pattern: /(月租金|租金|每月租金|房租)/, required: true },
  { name: '押金', label: '押金金额', pattern: /押金/, required: false },
  { name: '支付方式', label: '支付方式', pattern: /(支付方式|付款方式|押付|付租)/, required: false },
]

// 金额/日期是否缺失：字段出现了，但后面没有具体数字或日期
function hasConcreteValue(text, fieldPattern) {
  const match = text.match(fieldPattern)
  if (!match) return null // 字段本身没出现
  const idx = match.index
  const after = text.slice(idx, idx + 60)
  return /\d/.test(after)
}

function isUsableOcrText(text, confidence) {
  const normalized = String(text || '').trim()
  const readableChars = normalized.match(/[\p{Script=Han}A-Za-z]/gu) || []
  const digitOnly = normalized && /^[\d\s.,:;/-]+$/.test(normalized)

  return normalized.length >= 12 && readableChars.length >= 6 && !digitOnly && Number(confidence || 0) >= 35
}

/**
 * 审查 OCR 抽出的合同文本。
 *
 * @param {string} text      OCR 抽出的原始文本
 * @param {number} confidence  OCR 置信度（0-100），默认按可用文本处理
 * @returns {{
 *   ok: boolean,                 // 文本可用，可直接进入审查
 *   usable: boolean,             // 文本本身是否可用（区别于字段缺失）
 *   requiresManualCheck: boolean,// 是否需要人工核对关键字段
 *   missingFields: string[],     // 缺失/待确认的关键字段 label
 *   reasons: string[],           // 人类可读的原因说明
 *   confidence: number,
 * }}
 */
export function reviewContractOcrText(text, confidence = 100) {
  const normalized = String(text || '').trim()
  const usable = isUsableOcrText(normalized, confidence)

  const missingFields = []
  const reasons = []

  for (const field of KEY_FIELDS) {
    const hasValue = hasConcreteValue(normalized, field.pattern)
    if (hasValue === null) {
      // 字段本身没出现 —— 对 required 字段视为缺失
      if (field.required) {
        missingFields.push(field.label)
        reasons.push(`${field.label}未识别到`)
      }
      continue
    }
    if (hasValue === false) {
      missingFields.push(field.label)
      reasons.push(`${field.label}内容待确认或缺失`)
      continue
    }
    // 字段出现且有数字，但需检查是否本身就是占位符
    const seg = normalized.match(field.pattern)?.index ?? -1
    if (seg >= 0) {
      const nearby = normalized.slice(seg, seg + 40)
      if (PLACEHOLDER_RE.test(nearby)) {
        missingFields.push(field.label)
        reasons.push(`${field.label}疑似占位符（待确认/待定）`)
      }
    }
  }

  if (!usable) {
    reasons.unshift(`OCR 文本质量不足（长度 ${normalized.length}、置信度 ${Number(confidence) || 0}%）`)
  }

  const requiresManualCheck = missingFields.length > 0

  return {
    ok: usable && !requiresManualCheck,
    usable,
    requiresManualCheck,
    missingFields,
    reasons,
    confidence: Number(confidence) || 0,
  }
}
