// 页面级埋点（PRD 9.9）。V0.1 只写内存 + console，不接第三方，避免隐私争议。
const buffer = []
const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV

export function track(event, payload = {}) {
  const record = { event, ...payload, at: Date.now() }
  buffer.push(record)
  if (typeof window !== 'undefined') window.__qyysEvents = buffer
  if (isDev) console.debug('[track]', event, payload)
  return record
}

export function getTrackedEvents() {
  return [...buffer]
}
