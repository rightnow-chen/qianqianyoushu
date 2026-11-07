/** 空结果时各 Tab 的统一说法：不摆空白面板，给一个能点的下一步。 */
export default function EmptyPane({ title, desc, onTab }) {
  return (
    <div className="pane">
      <div className="empty-state">
        <div className="es-t">{title}</div>
        <div className="es-s">{desc}</div>
        <div className="es-a">
          <button className="btn sm" type="button" onClick={() => onTab('ov')}>
            回到概览
          </button>
          <button className="btn sm" type="button" onClick={() => onTab('check')}>
            看待核实清单
          </button>
        </div>
      </div>
    </div>
  )
}
