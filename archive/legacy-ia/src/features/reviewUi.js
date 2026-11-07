import { reviewDepthOptions } from '../constants/reviewOptions.js'

export function getReviewProfileSummary(profile = {}) {
  const depth = reviewDepthOptions.find((item) => item.value === profile.reviewDepth)?.label || '标准'
  return {
    text: '按租客视角检查租房合同',
    depth,
  }
}

export function getFindingPrimaryAction({ level, status = 'pending' } = {}) {
  if (status === 'resolved') return { label: '写入正式合同', kind: 'apply' }
  if (level === 'low') return { label: '查看建议', kind: 'details' }
  if (status === 'negotiating') return { label: '继续谈这一条', kind: 'negotiate' }
  return { label: '去谈这一条', kind: 'negotiate' }
}
