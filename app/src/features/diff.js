// 字符级 diff（LCS）。修改页的「删红增绿」靠它，不能整段替换——
// 用户要能一眼看出改了哪几个字，这是 PRD FR-07 的核心差异点。

/** @returns {{op:'eq'|'del'|'ins', text:string}[]} */
export function diffChars(oldText = '', newText = '') {
  const a = Array.from(oldText)
  const b = Array.from(newText)
  const n = a.length
  const m = b.length

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: 'eq', text: a[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: 'del', text: a[i] })
      i += 1
    } else {
      ops.push({ op: 'ins', text: b[j] })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ op: 'del', text: a[i] })
    i += 1
  }
  while (j < m) {
    ops.push({ op: 'ins', text: b[j] })
    j += 1
  }

  return mergeOps(ops)
}

function mergeOps(ops) {
  const merged = []
  ops.forEach((item) => {
    const last = merged[merged.length - 1]
    if (last && last.op === item.op) last.text += item.text
    else merged.push({ ...item })
  })
  return merged
}

/**
 * 拆成「原文片段」与「建议片段」，各自标出变更字符，供渲染删红/增绿。
 */
export function buildDiff(oldText = '', newText = '') {
  const ops = diffChars(oldText, newText)
  const oldParts = []
  const newParts = []
  ops.forEach((item) => {
    if (item.op === 'eq') {
      oldParts.push({ text: item.text, changed: false })
      newParts.push({ text: item.text, changed: false })
    } else if (item.op === 'del') {
      oldParts.push({ text: item.text, changed: true })
    } else {
      newParts.push({ text: item.text, changed: true })
    }
  })
  return { oldParts, newParts, ops }
}
