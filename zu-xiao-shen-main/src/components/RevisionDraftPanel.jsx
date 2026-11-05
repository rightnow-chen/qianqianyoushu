export default function RevisionDraftPanel({
  revisionItems = [],
  revisedContractDraft = '',
  open = false,
  onToggle,
  onExport,
  isExporting = false,
  onGoReview,
}) {
  return (
    <section className="work-panel reference-panel negotiation-draft-panel">
      <div className="draft-panel-intro">
        <div>
          <p className="eyebrow">谈妥后再落稿</p>
          <h2>修订草案</h2>
          <p>把已经和房东谈妥的内容写进草案，下载后可带回审合同页面重新审查。</p>
        </div>
        <span className="draft-panel-status">
          {revisionItems.length ? `已并入 ${revisionItems.length} 项` : '暂未落稿'}
        </span>
      </div>

      <details className="ref-accordion" open={open} onToggle={(event) => onToggle?.(event.target.open)}>
        <summary>
          <span className="ref-title">查看修改内容</span>
          <span className="ref-sub">
            {revisionItems.length ? '可导出 DOCX' : '谈妥后自动生成'}
          </span>
        </summary>
        <div className="ref-body">
          {revisionItems.length ? (
            <>
              <div className="diff-list">
                {revisionItems.map((item) => (
                  <article className="diff-item" key={item.id}>
                    <span>{item.priority}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p className="diff-before">{item.evidence}</p>
                      <p className="diff-after">{item.replacement}</p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="draft-preview">
                <div>
                  <strong>修订版合同草案</strong>
                  <span>{revisionItems.length} 项已并入草案</span>
                </div>
                <pre>{revisedContractDraft}</pre>
              </div>
              <div className="ref-actions draft-panel-actions">
                <button className="ghost-button compact-button" type="button" onClick={onExport} disabled={isExporting}>
                  {isExporting ? '正在生成 DOCX' : '下载优化合同 DOCX'}
                </button>
                <button className="primary-button compact-button" type="button" onClick={onGoReview}>
                  返回审合同，复查修改 →
                </button>
              </div>
            </>
          ) : (
            <p className="empty-note">在谈判台把条款标记为“已谈妥”并落稿后，这里会显示修改前后的对比。</p>
          )}
        </div>
      </details>
    </section>
  )
}
