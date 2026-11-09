import { previewKindOf } from '../../features/filePreview.js'
import OriginalDoc from './OriginalDoc.jsx'
import PaperDoc from './PaperDoc.jsx'

/**
 * 结果页左栏：有原件就显示原件，没有就重排成一张纸。
 *
 * 分界不是「有没有文件」，而是「这份文件有没有版式可以还原」：
 * PDF / Word / 图片有，TXT 和粘贴的文本没有——给纯文本套一层纸，
 * 比摊成一坨左对齐的字更好读。
 */
export default function ContractPane({ pages, risks, activeId, locateSignal, onPickRisk, file, meta }) {
  const kind = previewKindOf({
    fileName: meta?.fileName || file?.name || '',
    source: meta?.source || '',
    mime: file?.type || '',
  })
  const hasOriginal = Boolean(file) && kind !== 'text'

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
      pages={pages}
      risks={risks}
      activeId={activeId}
      locateSignal={locateSignal}
      onPickRisk={onPickRisk}
    />
  )
}
