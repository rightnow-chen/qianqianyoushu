export default function PrivacyModal({ open, onClose }) {
  if (!open) return null
  return (
    <div className="modal-mask" role="dialog" aria-modal="true" aria-label="隐私说明" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>隐私说明</h3>
        <p>这份合同里有很多不该外传的信息。我们把能承诺的说清楚，做不到的不写。</p>
        <ul>
          <li>身份证号、手机号、银行卡号在上传时就打码，打码后的文本才会送进模型。</li>
          <li>不建账号、不落库、不做云端历史；关闭页面即结束会话。</li>
          <li>审查结果由 AI 生成，可能漏报或误判，不构成法律意见。</li>
          <li>是否签约由你决定：我们只把风险、改法和话术摆出来，不替你判断。</li>
        </ul>
        <div className="modal-ft">
          <button className="btn sm primary" type="button" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
