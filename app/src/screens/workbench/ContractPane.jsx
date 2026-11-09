import { previewKindOf } from '../../features/filePreview.js'
import OriginalDoc from './OriginalDoc.jsx'
import PaperDoc from './PaperDoc.jsx'

/**
 * 结果页左栏：PDF / Word 显示原件，其余一律重排成一张纸。
 *
 * 分界不是「有没有文件」，而是「这份文件有没有版式值得还原」：
 * PDF / Word 的字体、缩进、表格是原件的一部分，掉了就读不出原貌。
 *
 * 图片不走原件：照片放在这里既没法定位，也不帮人读合同——
 * 用户要看的是识别出来的字，而字已经被重排成了条款结构。
 * TXT 和粘贴的文本本来就没有版式，套一层纸比摊成一坨左对齐的字好读。
 */
export default function ContractPane({ pages, risks, activeId, locateSignal, onPickRisk, file, meta }) {
  const kind = previewKindOf({
    fileName: meta?.fileName || file?.name || '',
    source: meta?.source || '',
    mime: file?.type || '',
  })
  const hasOriginal = Boolean(file) && (kind === 'pdf' || kind === 'word')

  if (hasOriginal) {
    return (
      <OriginalDoc
        kind={kind}
        file={file}
        risks={risks}
        activeId={activeId}
        locateSignal={locateSignal}
        onPickRisk={onPickRisk}
      />
    )
  }

  return (
    <PaperDoc
      kind={kind}
      pages={pages}
      risks={risks}
      activeId={activeId}
      locateSignal={locateSignal}
      onPickRisk={onPickRisk}
    />
  )
}
