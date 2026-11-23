import { lawDisplay } from '../../features/riskModel.js'

/**
 * 法律依据行：RiskTab 与 FixTab 共用。
 * law 有两套结构（真实 {name,basis,url,verified} / 演示 {name,version,scope,url}），
 * 统一交给 lawDisplay 归一，界面不再直接读 version/scope。
 */
export default function LawLine({ law }) {
  const { headline, detail, url } = lawDisplay(law)
  return (
    <div className="lawline">
      <span>法律依据</span>
      <b>{headline}</b>
      {detail && <span>· {detail}</span>}
      {url && (
        <button type="button" onClick={() => window.open(url, '_blank', 'noopener')}>
          法条原文 ↗
        </button>
      )}
    </div>
  )
}
