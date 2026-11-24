import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import { copyFile, mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  ocrTimeoutMs,
  rapidOcrEnabled,
  rapidOcrScriptPath,
  rapidOcrTimeoutMs,
  rootDir,
  zhipuVisionApiKey,
  zhipuVisionModels,
} from '../config.mjs'

const execFileAsync = promisify(execFile)

async function prepareTesseractLangPath() {
  const langPath = path.join(rootDir, '.cache', 'tesseract-lang')
  const languageFiles = [
    {
      from: path.join(rootDir, 'node_modules', '@tesseract.js-data', 'chi_sim', '4.0.0', 'chi_sim.traineddata.gz'),
      to: path.join(langPath, 'chi_sim.traineddata.gz'),
    },
    {
      from: path.join(rootDir, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0', 'eng.traineddata.gz'),
      to: path.join(langPath, 'eng.traineddata.gz'),
    },
  ]

  await mkdir(langPath, { recursive: true })
  try {
    await Promise.all(languageFiles.map((item) => copyFile(item.from, item.to)))
  } catch (error) {
    // 云端（CloudBase）为避开 tesseract 的 postinstall 脚本不装这些语言包，
    // 这里给出可执行的替代方案，而不是裸的 ENOENT。
    throw new Error('本地 OCR 语言包不可用（云端环境已禁用），请改用粘贴文字或上传 PDF/Word')
  }
  return langPath
}

// 轻量图片魔数校验：只接受 JPG/PNG/WEBP 真实签名，防止伪造扩展名进入 OCR worker
export function detectImageSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) return null
  // JPEG: SOI/marker + EOI
  const jpegEoi = buffer.lastIndexOf(Buffer.from([0xff, 0xd9]))
  if (
    buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    && jpegEoi >= 3 && buffer.length - jpegEoi - 2 <= 64 * 1024
  ) return 'jpeg'
  // PNG: signature + terminal IEND chunk
  const pngEnd = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    && buffer.subarray(-pngEnd.length).equals(pngEnd)
  ) return 'png'
  // WEBP: RIFF size + WEBP + a supported image chunk
  const webpChunk = buffer.subarray(12, 16).toString('ascii')
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    && buffer.readUInt32LE(4) + 8 === buffer.length
    && ['VP8 ', 'VP8L', 'VP8X'].includes(webpChunk)
  ) return 'webp'
  return null
}

export async function recognizeImageWithZhipuVision(buffer, {
  apiKey = zhipuVisionApiKey,
  models = zhipuVisionModels,
  fetchImpl = fetch,
  timeoutMs = ocrTimeoutMs,
} = {}) {
  const imageSignature = detectImageSignature(buffer)
  if (!imageSignature) throw new Error('invalid image signature')
  if (!apiKey) throw new Error('zhipu vision api key is not configured')

  const mimeType = imageSignature === 'jpeg' ? 'image/jpeg' : `image/${imageSignature}`
  let lastError = null
  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const upstreamResponse = await fetchImpl('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: model === 'glm-4v-flash' ? 1_024 : 4_096,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` } },
              {
                type: 'text',
                text: '请对这张房屋租赁合同图片进行OCR。只输出图片中可辨认的合同原文，保留标题、条款编号、标点和换行；被遮挡或无法辨认的内容用□表示，不得猜测、补写、解释、总结或使用Markdown代码块。',
              },
            ],
          }],
        }),
      })
      const data = await upstreamResponse.json().catch(() => ({}))
      if (!upstreamResponse.ok) {
        const error = new Error(data?.error?.message || data?.message || `zhipu vision failed (${upstreamResponse.status})`)
        error.status = upstreamResponse.status
        throw error
      }
      const text = String(data?.choices?.[0]?.message?.content || '')
        .replace(/^```(?:text|markdown)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim()
      if (text.length < 20) throw new Error('zhipu vision returned empty text')
      return {
        text,
        confidence: null,
        engine: model,
        mode: 'remote-zhipu-vision',
        language: 'zh+en',
      }
    } catch (error) {
      lastError = error
      if (![400, 404, 429, 500, 502, 503, 504].includes(Number(error?.status))) break
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError || new Error('zhipu vision unavailable')
}

function rapidOcrPythonCandidates() {
  const configured = String(process.env.RAPIDOCR_PYTHON_BIN || process.env.PYTHON_BIN || '').trim()
  return [...new Set([configured, 'python3', 'python'].filter(Boolean))]
}

function rapidOcrConfidence(score) {
  const normalized = Number(score) || 0
  return Math.max(0, Math.min(100, Math.round(normalized * 100)))
}

async function runRapidOcrPython(pythonBin, imagePath, timeoutMs, execFileImpl = execFileAsync) {
  const { stdout } = await execFileImpl(pythonBin, [rapidOcrScriptPath, imagePath], {
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  return JSON.parse(String(stdout || '{}'))
}

export async function recognizeImageWithRapidOcr(buffer, {
  pythonBins = rapidOcrPythonCandidates(),
  execFileImpl = execFileAsync,
  timeoutMs = rapidOcrTimeoutMs,
} = {}) {
  const imageSignature = detectImageSignature(buffer)
  if (!imageSignature) {
    const error = new Error('invalid image signature')
    error.code = 'invalid-image-signature'
    throw error
  }

  const tempDir = path.join(rootDir, '.cache', 'rapidocr-inputs')
  await mkdir(tempDir, { recursive: true })
  const extension = imageSignature === 'jpeg' ? 'jpg' : imageSignature
  const imagePath = path.join(tempDir, `${Date.now()}-${crypto.randomUUID()}.${extension}`)
  await writeFile(imagePath, buffer)

  try {
    let lastError = null
    for (const pythonBin of pythonBins) {
      try {
        const result = await runRapidOcrPython(pythonBin, imagePath, timeoutMs, execFileImpl)
        const text = String(result.text || '').trim()
        if (!text) throw new Error('rapidocr returned empty text')
        return {
          text,
          confidence: rapidOcrConfidence(result.avgScore),
          engine: 'rapidocr',
          mode: 'offline-rapidocr',
          language: 'zh+en',
          itemCount: Number(result.count) || 0,
        }
      } catch (error) {
        lastError = error
        if (error.code && error.code !== 'ENOENT') break
      }
    }
    throw lastError || new Error('rapidocr unavailable')
  } finally {
    await unlink(imagePath).catch(() => {})
  }
}

// tesseract.js 带 postinstall 脚本，云端（CloudBase）在线装依赖时会因安全策略拒绝执行而报错。
// 因此不顶层静态 import，改为用到时才动态加载：本地开发装了就照常用，云端没装时抛出清晰错误，
// 由上层 recognizeImageWithFallback 捕获并降级（提示改用粘贴文字 / PDF / Word）。
async function defaultCreateWorker(...args) {
  let mod
  try {
    mod = await import('tesseract.js')
  } catch (error) {
    throw new Error('本地 OCR 引擎未安装（云端环境已禁用），请改用粘贴文字或上传 PDF/Word')
  }
  return mod.createWorker(...args)
}

const OCR_UNAVAILABLE_MSG = '本地 OCR 引擎不可用（云端环境已禁用），请改用粘贴文字或上传 PDF/Word'

export async function recognizeImageOffline(buffer, {
  createWorkerImpl = defaultCreateWorker,
  prepareLangPath = prepareTesseractLangPath,
  timeoutMs = ocrTimeoutMs,
} = {}) {
  let langPath
  try {
    langPath = await prepareLangPath()
  } catch {
    // 云端没装语言包/只读文件系统等，统一给可执行提示，不漏裸 ENOENT
    throw new Error(OCR_UNAVAILABLE_MSG)
  }
  // tesseract 的 worker 出错时会回调 options.errorHandler；不给它，
  // createWorker 内部会在 process.nextTick 里直接 throw —— 整个 Node 进程退出。
  // 实测：识别一张 IDAT 有多余数据块的 PNG，接口先正常返回 200，服务随后猝死。
  const workerErrors = []
  let worker
  try {
    worker = await createWorkerImpl('chi_sim+eng', 1, {
      langPath,
      cachePath: path.join(rootDir, '.cache', 'tesseract'),
      gzip: true,
      errorHandler: (error) => workerErrors.push(error),
    })
  } catch (error) {
    // 已经是友好提示就透传，否则统一转换（云端动态 import 失败会到这里）
    if (/改用粘贴文字|不可用/.test(error?.message || '')) throw error
    throw new Error(OCR_UNAVAILABLE_MSG)
  }
  let timeoutId = 0

  try {
    const result = await Promise.race([
      worker.recognize(buffer),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('offline OCR timed out')), timeoutMs)
      }),
    ])
    const text = result.data.text.trim()
    // 一字没读出来时，把 worker 层面的错误带出来，否则只剩一句「结果过弱」查不到原因
    if (!text && workerErrors.length) {
      throw new Error(`offline OCR worker error: ${workerErrors[0]?.message || 'unknown'}`)
    }
    return {
      text,
      confidence: Math.round(result.data.confidence || 0),
    }
  } finally {
    clearTimeout(timeoutId)
    // terminate 失败也不该把请求打成 500：识别结果已经拿到了
    await worker.terminate().catch((error) => {
      workerErrors.push(error)
    })
  }
}

export async function recognizeImageWithFallback(buffer, {
  enableZhipuVision = Boolean(zhipuVisionApiKey),
  recognizeZhipuVisionImpl = recognizeImageWithZhipuVision,
  enableRapidOcr = rapidOcrEnabled,
  recognizeRapidOcrImpl = recognizeImageWithRapidOcr,
  recognizeTesseractImpl = recognizeImageOffline,
  rapidOcrOptions = {},
  tesseractOptions = {},
} = {}) {
  let fallbackReason = ''
  if (enableZhipuVision) {
    try {
      return await recognizeZhipuVisionImpl(buffer)
    } catch (error) {
      fallbackReason = error?.message || 'zhipu vision failed'
    }
  }
  if (enableRapidOcr) {
    try {
      return await recognizeRapidOcrImpl(buffer, rapidOcrOptions)
    } catch (error) {
      fallbackReason = error?.message || 'rapidocr failed'
    }
  }

  const result = await recognizeTesseractImpl(buffer, tesseractOptions)
  return {
    ...result,
    engine: 'tesseract',
    mode: 'offline-tesseract',
    language: 'chi_sim+eng',
    fallback: Boolean(enableZhipuVision || enableRapidOcr),
    fallbackFrom: enableZhipuVision ? 'remote-zhipu-vision' : enableRapidOcr ? 'offline-rapidocr' : null,
    fallbackReason: fallbackReason ? fallbackReason.slice(0, 160) : null,
  }
}
