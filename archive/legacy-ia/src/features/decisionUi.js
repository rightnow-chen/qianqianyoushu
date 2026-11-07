const DECISION_OUTCOME_LABELS = {
  pause: '不建议签',
  confirm: '谈清楚再签',
  'more-info': '信息不足，暂时不能判断',
  incomplete: '信息不足，暂时不能判断',
  go: '可以签',
}

const TRUST_DISPLAY_LABELS = {
  contract: '合同里已写明',
  verbal: '房东口头说过',
  guess: '还需要确认',
}

export function getDecisionOutcomeLabel(key) {
  return DECISION_OUTCOME_LABELS[key] || '信息不足，暂时不能判断'
}

export function getDecisionStageCopy({ fullyFilled, contractReviewed } = {}) {
  if (!fullyFilled) {
    return {
      label: '等待补充信息',
      note: '补齐预算、入住日期和月租后，再开始判断。',
    }
  }
  if (!contractReviewed) {
    return {
      label: '初步判断',
      note: '还没结合合同风险，当前结果只作为参考。',
    }
  }
  return {
    label: '完整判断',
    note: '已结合预算、房源条件和合同风险。',
  }
}

export function getTrustDisplayLabel(key) {
  return TRUST_DISPLAY_LABELS[key] || '还需要确认'
}
