// 钉住一件事：tesseract worker 的异步错误必须被 errorHandler 接住。
//
// 现场是这么崩的：识别一张 IDAT 有多余数据块的 PNG，接口先正常返回 200，
// 几百毫秒后 createWorker 在 process.nextTick 里 throw，整个 Node 进程退出——
// 用户看到的是「网站突然打不开」，日志里只有一行 libpng warning。
// 根因是 createWorker 的 errorHandler 没传，它只能 throw。
import assert from 'node:assert/strict'
import { recognizeImageOffline } from '../../server/services/ocr.mjs'

/** 造一个假 worker：把 createWorker 收到的 options 交给用例检查。 */
function stubWorker(seen, recognizeImpl, { terminateThrows = false } = {}) {
  return async (_langs, _oem, options) => {
    seen.options = options
    return {
      recognize: async () => recognizeImpl(options),
      terminate: async () => {
        if (terminateThrows) throw new Error('terminate failed')
      },
    }
  }
}

// 1. 正常识别：两端空白裁掉、置信度取整、errorHandler 必须注册
const seen = {}
const ok = await recognizeImageOffline(Buffer.from('x'), {
  createWorkerImpl: stubWorker(seen, () => ({ data: { text: ' 租金 2800 元 ', confidence: 91.4 } })),
  prepareLangPath: async () => '/tmp',
})
assert.equal(ok.text, '租金 2800 元', '识别结果两端的空白应裁掉')
assert.equal(ok.confidence, 91, '置信度应四舍五入成整数')
assert.equal(typeof seen.options.errorHandler, 'function', '必须把 errorHandler 交给 createWorker')

// 2. worker 抛异步错误时，由 errorHandler 接住，不能落到 process.nextTick 的 throw
assert.doesNotThrow(() => seen.options.errorHandler(new Error('Error attempting to read image')))

// 3. terminate 抛错不能把「已经识别成功」的请求打成 500
const terminated = await recognizeImageOffline(Buffer.from('x'), {
  createWorkerImpl: stubWorker({}, () => ({ data: { text: '押金 2800 元', confidence: 88 } }), { terminateThrows: true }),
  prepareLangPath: async () => '/tmp',
})
assert.equal(terminated.text, '押金 2800 元', 'terminate 失败不该影响已经拿到的识别结果')

// 4. 一个字都没读到、且 worker 报过错：要把原始错误带出来，方便定位
await assert.rejects(
  () =>
    recognizeImageOffline(Buffer.from('x'), {
      createWorkerImpl: async (_langs, _oem, options) => ({
        recognize: async () => {
          options.errorHandler(new Error('Error attempting to read image'))
          return { data: { text: '   ', confidence: 0 } }
        },
        terminate: async () => {},
      }),
      prepareLangPath: async () => '/tmp',
    }),
  /offline OCR worker error/,
  '读不出字且有 worker 错误时，应抛出带原因的异常',
)

console.log('ocr-worker passed: errorHandler 接管、terminate 容错、空结果带原因')
