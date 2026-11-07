// 导出：报告走系统打印（可另存为 PDF，不引第三方库），纯文本走剪贴板。
import { formatMoney, amountForRisk } from './amountEngine.js'
import { levelLabel } from './riskModel.js'

function esc(text = '') {
  return String(text).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch])
}

export function buildReportHtml({ meta, risks, amounts, worst, verdict, checks }) {
  const rows = risks
    .map((risk, index) => {
      const amount = amountForRisk(risk, amounts)
      return `<tr>
        <td>${index + 1}</td>
        <td>${levelLabel(risk.level)}</td>
        <td><b>${esc(risk.title)}</b><div class="sub">第 ${risk.location.article} 条 · 第 ${risk.location.sentence} 句 · 第 ${risk.location.page} 页 · ${risk.confidence}</div></td>
        <td class="num">${amount.text}</td>
      </tr>`
    })
    .join('')

  const details = risks
    .map(
      (risk, index) => `<div class="item">
        <h3>${index + 1}. ${esc(risk.title)} <span class="lv">${levelLabel(risk.level)}</span></h3>
        <p class="lab">合同原文</p><p class="quote">${esc(risk.original)}</p>
        <p class="lab">建议改为</p><p class="quote new">${esc(risk.suggestion)}</p>
        <p class="lab">为什么改</p><p>${esc(risk.why)}</p>
        <p class="lab">法律依据</p><p>${esc(risk.law.name)} · ${esc(risk.law.version)} · ${esc(risk.law.scope)}</p>
        <p class="lab">发给房东（礼貌版）</p><p class="quote">${esc(risk.scripts.polite)}</p>
      </div>`,
    )
    .join('')

  const checkItems = checks.map((item, index) => `<li>${item.done ? '☑' : '☐'} ${index + 1}. ${esc(item.q)}</li>`).join('')

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>合同审查报告 · 签前有数</title>
<style>
  body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#1B2430;font-size:12px;line-height:1.75;margin:32px}
  h1{font-size:19px;margin:0 0 4px}
  h2{font-size:14px;margin:22px 0 8px;border-bottom:1px solid #E4E9F0;padding-bottom:5px}
  h3{font-size:12.5px;margin:14px 0 4px}
  .meta{color:#78849A;font-size:11px;margin-bottom:14px}
  .verdict{padding:10px 12px;background:#F4F8FF;border:1px solid #DCE7FA;border-radius:6px}
  .verdict b{font-size:14px}
  .total{font-size:22px;font-weight:700;color:#D93B3B}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th,td{border-bottom:1px solid #EDF1F6;padding:6px 4px;text-align:left;vertical-align:top}
  th{color:#78849A;font-weight:500}
  td.num{text-align:right;white-space:nowrap}
  .sub{color:#9AA4B2;font-size:10px}
  .lab{color:#78849A;font-size:10.5px;margin:8px 0 2px}
  .quote{margin:0;padding:6px 8px;background:#FDF4F3;border:1px solid #F4DBD8;border-radius:4px}
  .quote.new{background:#F1FAF5;border-color:#CFE9DB}
  .lv{font-size:10px;color:#D93B3B;border:1px solid #F0C9C4;border-radius:3px;padding:0 4px;margin-left:4px}
  .item{border-top:1px dashed #E4E9F0;padding-top:6px}
  ul{padding-left:18px}
  .foot{margin-top:22px;color:#9AA4B2;font-size:10.5px;border-top:1px solid #E4E9F0;padding-top:8px}
  @media print{body{margin:14mm}}
</style></head><body>
<h1>房屋租赁合同 · 审查报告</h1>
<div class="meta">${esc(meta.fileName)} · ${esc(meta.type)} · ${esc(meta.city)} · 月租 ¥${formatMoney(meta.rent)} · 租期 ${meta.months} 个月 · 押金 ¥${formatMoney(meta.deposit)}</div>
<div class="verdict"><b>${esc(verdict.title)}</b><div>${esc(verdict.desc)}</div></div>
<h2>最坏情况合计 ¥${formatMoney(worst.total)}</h2>
<div>${worst.items.map((item) => `${esc(item.label)} ¥${formatMoney(item.value)}（${esc(item.note)}）`).join('　·　')}</div>
<div class="meta">金额按月租与押金估算，实际以合同约定和真实损失为准。</div>
<h2>风险清单（${risks.length} 条）</h2>
<table><thead><tr><th>#</th><th>等级</th><th>条款</th><th>金额</th></tr></thead><tbody>${rows}</tbody></table>
<h2>逐条详情与修改建议</h2>
${details}
<h2>合同外待核实 ${checks.length} 件</h2>
<ul>${checkItems}</ul>
<div class="foot">本报告由 AI 生成，可能存在遗漏，不构成法律意见 · 是否签约由你决定 · 签前有数</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`
}

export function buildPlainText({ risks, amounts, checks }) {
  const must = risks.filter((risk) => risk.level === 'must')
  const lines = ['【必须改的 3 条】']
  must.forEach((risk, index) => {
    lines.push(`${index + 1}. 第 ${risk.location.article} 条：${risk.suggestion}`)
  })
  lines.push('', '【发给房东的话术】')
  must.slice(0, 3).forEach((risk, index) => {
    lines.push(`${index + 1}. （第 ${risk.location.article} 条 · ${amountForRisk(risk, amounts).text}）`)
    lines.push(risk.scripts.polite)
    lines.push('')
  })
  lines.push('【合同外还要问清的 ' + checks.filter((item) => !item.done).length + ' 件】')
  checks
    .filter((item) => !item.done)
    .forEach((item, index) => {
      lines.push(`${index + 1}. ${item.q}`)
    })
  return lines.join('\n')
}
