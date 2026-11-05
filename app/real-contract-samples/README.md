# 真实合同样本目录（用于漏检/误报评测）

本目录放**真实、已脱敏**的租房合同样本，配合 `scripts/run-real-contract-review.mjs` 检验审查引擎在真实措辞下的召回质量。

## 脱敏要求（务必先做）

删除或替换以下信息，再放入本目录：

- 姓名、手机号、身份证号、银行账号
- 精确到门牌号的地址
- 任何可定位到具体个人的信息

示例见 `sample-landlord-self-drafted.txt`（已用 `【脱敏-...】` 占位）。

## 文件约定

每个样本由两个文件组成：

| 文件 | 是否必需 | 说明 |
|---|---|---|
| `<名称>.txt` 或 `.md` | 必需 | 脱敏后的合同正文 |
| `<名称>.expect.json` | 可选 | 人工标注，缺省则该样本只展示结果、不参与漏检/误报判定 |

标注文件格式：

```json
{
  "note": "这段合同的特点，供报告阅读者参考",
  "expect": ["lease-early-exit-stacked-penalty"],
  "none": ["lease-unilateral-rent-adjustment"]
}
```

- `expect`：这份合同里**应该**被识别出的风险 id（漏检检测）
- `none`：这份合同里**不应该**被误报的风险 id（误报检测）
- 风险 id 清单见 `scripts/contract-review-benchmark-data.mjs` 的 `contractRiskScenarios`，或直接看一次完整报告里引擎召回出的 `id`

## 运行

```bash
node scripts/run-real-contract-review.mjs                 # 默认目录 + strict + partyB
node scripts/run-real-contract-review.mjs --dir=my-cases --depth=balanced
```

报告输出到 `generated-reports/real-contract-review/report.md`（人读）和 `report.json`（机器读）。

## 拿到真实失败样本后

1. 确认已脱敏
2. 标注风险 id + 期望是否报警
3. 通过后，把该样本沉淀进 `scripts/contract-review-benchmark-data.mjs` 作为长期回归用例
