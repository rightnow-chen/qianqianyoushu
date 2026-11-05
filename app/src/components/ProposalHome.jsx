import { ArrowRight, FileText, Play, Route, Scale, ShieldCheck } from 'lucide-react'
import {
  proposalDemoRoute,
  proposalQuickRoute,
} from '../data/proposalContent.jsx'

export default function ProposalHome({
  onEnterModule,
  onOpenGuide,
  onOpenAiExpert,
  onPrepareReviewDemo,
}) {
  const handleRouteAction = (item) => {
    if (item.actionType === 'guide') {
      onOpenGuide()
      return
    }

    if (item.actionType === 'ai') {
      onOpenAiExpert()
      return
    }

    if (item.actionType === 'demoReview') {
      onPrepareReviewDemo()
      return
    }

    onEnterModule(item.tab)
  }

  return (
    <div className="proposal-layout">
      {/* ── Hero：场景问题开场 + 数字锚定 ── */}
      <section className="proposal-card proposal-hero proposal-hero-new">
        <div className="proposal-hero-copy">
          <p className="section-kicker">签约有数 · 签前把账算明白</p>
          <h2>
            看中一套房，月租 3200、押一付三、中介费一个月——
            <span className="proposal-hero-hl">哪些条款需要谈清楚？</span>
          </h2>
          <p className="proposal-hero-sub">
            导入一份租房合同，看清费用约定、条款风险和原文证据，再把需要协商的问题逐项谈清楚。
          </p>

          <div className="proposal-hero-metrics">
            <div className="proposal-hero-metric">
              <strong>
                55<em>类</em>
              </strong>
              <span>
                租房合同风险点，<b>逐条附法条原文</b>
              </span>
            </div>
            <div className="proposal-hero-metric">
              <strong>
                100<em>%</em>
              </strong>
              <span>
                结论<b>可溯源</b>，不靠 AI 凭空猜
              </span>
            </div>
            <div className="proposal-hero-metric">
              <strong>
                10<em>分钟</em>
              </strong>
              <span>
                算清成本，拿到<b>能直接行动</b>的答案
              </span>
            </div>
          </div>

          <div className="proposal-action-row">
            <button
              className="primary-button proposal-primary-action"
              type="button"
              onClick={() => onEnterModule('contract')}
            >
              开始审查合同
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button
              className="ghost-button proposal-secondary-action"
              type="button"
              onClick={onPrepareReviewDemo}
            >
              看一个真实案例
              <Play size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="proposal-reliability-note" aria-label="模型兜底说明">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>即使线上模型接口暂不可用，合同风险识别仍会使用本地规则和知识库继续演示。</span>
          </div>
        </div>
      </section>

      {/* ── 三步流程 ── */}
      <section className="proposal-card proposal-steps" aria-labelledby="proposal-steps-title">
        <div className="proposal-section-head">
          <span>审查、协商、复查</span>
          <h2 id="proposal-steps-title">看懂合同，把条款谈清楚</h2>
          <p className="proposal-section-sub">
            从原文发现问题，协商修改后，再检查最新合同。
          </p>
        </div>
        <div className="proposal-steps-grid">
          <div className="proposal-step">
            <span className="proposal-step-num">01</span>
            <h3>审合同</h3>
            <p>粘贴或导入合同，逐条标出押金、涨租、维修、违约风险，绑定原文证据。</p>
            <strong>→ 先知道合同里哪里有问题</strong>
          </div>
          <div className="proposal-step">
            <span className="proposal-step-num">02</span>
            <h3>谈判台</h3>
            <p>针对审查发现的条款问题，准备话术、记录回应，把谈妥内容写进合同。</p>
            <strong>→ 逐项处理需要协商的问题</strong>
          </div>
          <div className="proposal-step">
            <span className="proposal-step-num">03</span>
            <h3>重新审查</h3>
            <p>返回审合同，核对最新合同与协商结果，检查尚未解决的问题。</p>
            <strong>→ 复查修改后的合同</strong>
          </div>
        </div>
      </section>

      {/* ── 信任锚：法条溯源 ── */}
      <section className="proposal-card proposal-trust" aria-labelledby="proposal-trust-title">
        <div className="proposal-trust-copy">
          <span className="proposal-section-head-label">为什么可信</span>
          <h2 id="proposal-trust-title">每条结论，都指着具体法条</h2>
          <p>
            AI 会犯错，法条不会。我们不做「看起来专业」的风险提示，而是把每一处风险都钉回合同原文和法条依据——你能自己验证，而不是只能相信它。
          </p>
          <div className="proposal-trust-points">
            <div className="proposal-trust-point">
              <span className="proposal-trust-ic">
                <Scale size={16} aria-hidden="true" />
              </span>
              <div>
                <strong>法条溯源</strong>
                <span>每条风险结论附具体法条，能点开核对，不凭空制造风险。</span>
              </div>
            </div>
            <div className="proposal-trust-point">
              <span className="proposal-trust-ic">
                <FileText size={16} aria-hidden="true" />
              </span>
              <div>
                <strong>原文证据绑定</strong>
                <span>风险必须命中合同原文，防止 AI 瞎编条款。</span>
              </div>
            </div>
            <div className="proposal-trust-point">
              <span className="proposal-trust-ic">
                <ShieldCheck size={16} aria-hidden="true" />
              </span>
              <div>
                <strong>本地规则兜底</strong>
                <span>模型接口不可用时，本地规则库照常出结论，演示不断线。</span>
              </div>
            </div>
          </div>
        </div>
        <div className="proposal-trust-demo">
          <div className="proposal-legal-card">
            <div className="proposal-legal-card-head">
              <span>合同风险 · 高风险</span>
              <em>押金</em>
            </div>
            <div className="proposal-legal-card-body">
              <p className="proposal-legal-risk">押金退还条件模糊</p>
              <p className="proposal-legal-quote">
                「租赁期满后，押金在无任何损坏时退还。」——「无任何损坏」为无限兜底条款，房东可据此克扣押金。
              </p>
              <div className="proposal-legal-source">《民法典》押金返还规则 · 附原文证据</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 场景演示 ── */}
      <section className="proposal-card proposal-scenarios" aria-labelledby="proposal-scenarios-title">
        <div className="proposal-section-head">
          <span>看效果</span>
          <h2 id="proposal-scenarios-title">两个最常翻车的场景，一眼看懂</h2>
          <p className="proposal-section-sub">
            从合同原文定位问题，说明风险原因，并给出可协商的修改方向。
          </p>
        </div>
        <div className="proposal-scenarios-grid">
          <div className="proposal-scenario">
            <div className="proposal-scenario-head">
              <span className="proposal-scenario-tag danger">费用不明</span>
              <h3>月租明确，额外收费却没写清</h3>
              <p>除了租金，还需要支付哪些费用、按什么标准收取？</p>
            </div>
            <div className="proposal-scenario-body">
              <div className="proposal-scenario-input">
                <span className="proposal-scenario-lbl">你的输入</span>
                <span className="proposal-scenario-val">
                  月租 <b>3200</b> · 「其他费用由租客承担」
                </span>
              </div>
              <div className="proposal-scenario-arrow" aria-hidden="true">↓</div>
              <div className="proposal-scenario-result">
                <p className="proposal-scenario-verdict danger">费用范围需明确</p>
                <ul>
                  <li>「其他费用」未列明具体项目</li>
                  <li>需核实计费标准、承担方与付款凭证</li>
                  <li>协商将费用清单写入合同附件</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="proposal-scenario">
            <div className="proposal-scenario-head">
              <span className="proposal-scenario-tag warn">合同有坑</span>
              <h3>押金条款里藏着「无限兜底」</h3>
              <p>「无任何损坏」四个字，可能让你押金有去无回。</p>
            </div>
            <div className="proposal-scenario-body">
              <div className="proposal-scenario-input">
                <span className="proposal-scenario-lbl">合同原文</span>
                <span className="proposal-scenario-val">「租赁期满后，押金在无任何损坏时退还。」</span>
              </div>
              <div className="proposal-scenario-arrow" aria-hidden="true">↓</div>
              <div className="proposal-scenario-result">
                <p className="proposal-scenario-verdict warn">押金返还条件需协商</p>
                <ul>
                  <li>识别「无限兜底」条款，命中原文证据</li>
                  <li>生成可复制的追问话术发给房东</li>
                  <li>附法条依据可核对</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 演示路线（保留，降级为次要区块） ── */}
      <section className="proposal-card proposal-demo-route" aria-labelledby="proposal-demo-route-title">
        <div className="proposal-section-head demo-route-head">
          <div>
            <span>完整体验路线</span>
            <h2 id="proposal-demo-route-title">带亲友走一遍，照这个顺序就行</h2>
          </div>
          <p>每一步都标了在哪儿点、要递进看什么、该说什么。不想讲全流程，就只走右侧三步。</p>
        </div>

        <div className="proposal-route-grid">
          <div className="proposal-route-main" aria-label="5 分钟完整演示路线">
            {proposalDemoRoute.map((item) => (
              <article className="proposal-route-step" key={`${item.step}-${item.title}`}>
                <span>{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
                <button type="button" onClick={() => handleRouteAction(item)}>
                  {item.action}
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>

          <aside className="proposal-route-fast" aria-label="90 秒快速演示路线">
            <div className="proposal-route-fast-head">
              <Play size={18} aria-hidden="true" />
              <div>
                <span>90 秒快速路线</span>
                <strong>没时间？只走这三步</strong>
              </div>
            </div>
            <ol>
              {proposalQuickRoute.map((item) => (
                <li key={item.title}>
                  <button type="button" onClick={() => handleRouteAction(item)}>
                    <Route size={15} aria-hidden="true" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.text}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>
    </div>
  )
}
