// 合同导入相关常量：支持的文件类型、大小限制与 OCR 置信度阈值。

export const CONTRACT_TEXT_EXTENSIONS = ['txt', 'md', 'markdown']

export const CONTRACT_WORD_EXTENSIONS = ['doc', 'docx']

export const CONTRACT_PDF_EXTENSIONS = ['pdf']

export const CONTRACT_IMAGE_MIME_PATTERN = /^image\/(png|jpe?g|webp|bmp)$/i

export const CONTRACT_IMPORT_MAX_BYTES = 8 * 1024 * 1024

// 图片 OCR 结果低于该置信度时，提示用户人工核对合同原文。
export const OCR_REVIEW_WARNING_CONFIDENCE = 80
