import { analyzeContract } from '../src/features/contractReview.js'

// 用户 2026-10-09 截图中的高风险测试合同（逐字重建）
const contract = `房屋租赁合同

甲方（出租人） 陈某某
乙方（承租人） 吴某某

房屋：成都市武侯区某路18号2单元701室；用途：居住。

一、租期
租期为2026年11月1日至2027年10月31日，月租金人民币3,600元，押金人民币3,600元。乙方每月1日前付租。

二、租赁期间如周边租金上涨
甲方可随时单方面调整月租金；乙方不接受调整的，应在7日内搬离，押金不予退还。

三、乙方退租时
甲方可直接扣除全屋保洁费800元、家具自然折旧费600元及甲方认为必要的其他费用，无需提供证据。剩余押金在退租后60个工作日内退还。

四、乙方逾期支付租金超过3日
甲方可立即换锁并收回房屋。已交租金和押金均不退还；乙方另付六个月租金作为违约金。

五、甲方可随时持备用钥匙进入入户检查或带看
无须事先通知乙方。

六、甲方提供的家具电器发生任何故障
均由乙方自行维修；甲方不承担维修责任。

七、甲方提前解约无须赔偿
乙方提前解约须另付三个月租金作为违约金。

八、未尽事宜由甲方最终解释。双方签字后生效。

甲方签字：陈某某 乙方签字：吴某某 签订日期：2026年10月`

const findings = analyzeContract(contract)
console.log('=== 命中的风险（%d 条）===', findings.length)
findings.forEach((f) => console.log(`- [${f.level}] ${f.id}：${f.title}｜hits=${JSON.stringify(f.hits)}｜hg=${JSON.stringify(f.highlightHits || null)}`))
console.log('')
console.log('=== meta ===')
if (findings.analysisMeta) {
  console.log('missing:', findings.analysisMeta.missingFindings.map((f) => `${f.id}:${f.title}`))
  console.log('consistency:', findings.analysisMeta.consistencyFindings.map((f) => `${f.id}:${f.title}`))
  console.log('coverage:', JSON.stringify(findings.analysisMeta.coverage))
}
