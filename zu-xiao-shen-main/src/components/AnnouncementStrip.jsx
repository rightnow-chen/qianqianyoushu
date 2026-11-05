import { ArrowRight, X } from 'lucide-react'

export default function AnnouncementStrip({ guideTriggerRef, onOpenGuide, onDismiss }) {
  return (
    <div className="announcement-strip">
      <span>● 演示不断线</span>
      <strong>模型暂不可用时，会自动切换本地租房规则和知识库兜底</strong>
      <button className="announcement-link" type="button" ref={guideTriggerRef} onClick={onOpenGuide}>
        查看合同审查流程
        <ArrowRight size={14} aria-hidden="true" />
      </button>
      {onDismiss && (
        <button className="announcement-dismiss" type="button" aria-label="关闭提示" onClick={onDismiss}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
