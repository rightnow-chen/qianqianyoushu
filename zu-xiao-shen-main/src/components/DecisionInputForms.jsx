import { useState } from 'react'
import { ChevronDown, Plus, Sparkles, X } from 'lucide-react'
import { MUST_HAVES_LIMIT, TRUST_LEVELS } from '../features/decisionInput.js'

// 信息来源选择（合同 / 口头 / 猜测）
function SourceSelect({ field, sources, onSourceChange }) {
  return (
    <select
      className="source-select"
      value={sources[field] || 'guess'}
      onChange={(event) => onSourceChange(field, event.target.value)}
      aria-label={`${field} 信息来源`}
    >
      {Object.values(TRUST_LEVELS).map((level) => (
        <option key={level.key} value={level.key}>
          {level.label}
        </option>
      ))}
    </select>
  )
}

// 租房需求表单（第 2 步）
function NeedsForm({ needs, validation, onChange, onMustHaveAdd, onMustHaveRemove }) {
  const [newMustHave, setNewMustHave] = useState('')
  const [touched, setTouched] = useState({})
  const mustHaveFull = needs.mustHaves.length >= MUST_HAVES_LIMIT

  const markTouched = (field) => setTouched((current) => ({ ...current, [field]: true }))
  const errorFor = (field) => (touched[field] ? validation.errors[field] : undefined)

  const handleAddMustHave = () => {
    const value = newMustHave.trim()
    if (!value || mustHaveFull) return
    onMustHaveAdd(value)
    setNewMustHave('')
  }

  return (
    <div className="decision-form" aria-label="我的租房条件">
      <p className="decision-form-desc">先写下你自己的预算、通勤和入住偏好，再标记不能妥协的条件。</p>

      <div className="decision-grid">
        <label className="field">
          <span>月度住房预算（元）</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={needs.monthlyBudget}
            onChange={(event) => onChange('monthlyBudget', event.target.value)}
            onBlur={() => markTouched('monthlyBudget')}
            placeholder="例如 3000"
          />
          {errorFor('monthlyBudget') && <em className="field-error">{errorFor('monthlyBudget')}</em>}
        </label>

        <label className="field">
          <span>最大单程通勤（分钟）</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={needs.maxCommuteMinutes}
            onChange={(event) => onChange('maxCommuteMinutes', event.target.value)}
            onBlur={() => markTouched('maxCommuteMinutes')}
            placeholder="例如 40，可留空"
          />
          {errorFor('maxCommuteMinutes') && <em className="field-error">{errorFor('maxCommuteMinutes')}</em>}
        </label>

        <label className="field">
          <span>计划入住日期</span>
          <input
            type="date"
            value={needs.moveInDate}
            onChange={(event) => onChange('moveInDate', event.target.value)}
            onBlur={() => markTouched('moveInDate')}
          />
          {errorFor('moveInDate') && <em className="field-error">{errorFor('moveInDate')}</em>}
        </label>

        <label className="field">
          <span>租住时长（月）</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={needs.leaseTermMonths}
            onChange={(event) => onChange('leaseTermMonths', event.target.value)}
            onBlur={() => markTouched('leaseTermMonths')}
            placeholder="例如 12"
          />
          {errorFor('leaseTermMonths') && <em className="field-error">{errorFor('leaseTermMonths')}</em>}
        </label>
      </div>

      <div className="must-have-field">
        <span className="field-label">不可妥协条件（最多 {MUST_HAVES_LIMIT} 项）</span>
        <div className="must-have-input-row">
          <input
            type="text"
            value={newMustHave}
            onChange={(event) => setNewMustHave(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleAddMustHave()
              }
            }}
            placeholder={mustHaveFull ? `已达到 ${MUST_HAVES_LIMIT} 项上限` : '例如：独立卫生间、近地铁'}
            disabled={mustHaveFull}
          />
          <button className="ghost-button compact-button" type="button" onClick={handleAddMustHave} disabled={mustHaveFull || !newMustHave.trim()}>
            <Plus size={15} aria-hidden="true" />
            添加
          </button>
        </div>
        {touched.mustHaves && validation.errors.mustHaves && <em className="field-error">{validation.errors.mustHaves}</em>}
        {needs.mustHaves.length > 0 && (
          <div className="must-have-list">
            {needs.mustHaves.map((item) => (
              <span className="must-have-chip" key={item}>
                {item}
                <button type="button" aria-label={`删除 ${item}`} onClick={() => onMustHaveRemove(item)}>
                  <X size={13} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 房源信息表单（第 3 步）
function ListingForm({ listing, validation, sources, onChange, onSourceChange }) {
  const [touched, setTouched] = useState({})
  const [moreOpen, setMoreOpen] = useState(false)
  const markTouched = (field) => setTouched((current) => ({ ...current, [field]: true }))
  const errorFor = (field) => (touched[field] ? validation.errors[field] : undefined)

  return (
    <div className="decision-form" aria-label="这套房的条件">
      <p className="decision-form-desc">这里记录你从房东或中介了解到的事实；不确定的信息可以先留空，后续再确认。</p>

      <div className="decision-grid">
        <label className="field">
          <span>城市 / 区域 <small className="field-hint">仅用于标记房源，当前不作为决策依据</small></span>
          <input
            type="text"
            value={listing.city}
            onChange={(event) => onChange('city', event.target.value)}
            placeholder="例如 深圳南山"
          />
        </label>

        <label className="field">
          <span>月租（元，必填）</span>
          <div className="field-with-source">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={listing.monthlyRent}
              onChange={(event) => onChange('monthlyRent', event.target.value)}
              onBlur={() => markTouched('monthlyRent')}
              placeholder="例如 3200"
            />
            <SourceSelect field="monthlyRent" sources={sources} onSourceChange={onSourceChange} />
          </div>
          {errorFor('monthlyRent') && <em className="field-error">{errorFor('monthlyRent')}</em>}
        </label>
      </div>

      <details className="listing-more" open={moreOpen} onToggle={(event) => setMoreOpen(event.target.open)}>
        <summary className="listing-more-summary">
          <span>更多费用与房源条件（选填）</span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="decision-grid">
        <div className="listing-group-label">费用信息</div>
        <label className="field">
          <span>押金（元，未知可留空）</span>
          <div className="field-with-source">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={listing.depositAmount}
              onChange={(event) => onChange('depositAmount', event.target.value)}
              placeholder="例如 3200"
            />
            <SourceSelect field="depositAmount" sources={sources} onSourceChange={onSourceChange} />
          </div>
        </label>

        <label className="field">
          <span>预付月数</span>
          <div className="field-with-source">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={listing.prepaidMonths}
              onChange={(event) => onChange('prepaidMonths', event.target.value)}
              placeholder="例如 1"
            />
            <SourceSelect field="prepaidMonths" sources={sources} onSourceChange={onSourceChange} />
          </div>
        </label>

        <label className="field">
          <span>中介费（元，未知可留空）</span>
          <div className="field-with-source">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={listing.agencyFee}
              onChange={(event) => onChange('agencyFee', event.target.value)}
              placeholder="例如 1600"
            />
            <SourceSelect field="agencyFee" sources={sources} onSourceChange={onSourceChange} />
          </div>
        </label>

        <label className="field">
          <span>月固定费用（物业等，未知可留空）</span>
          <div className="field-with-source">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={listing.monthlyFixedFees}
              onChange={(event) => onChange('monthlyFixedFees', event.target.value)}
              placeholder="例如 300"
            />
            <SourceSelect field="monthlyFixedFees" sources={sources} onSourceChange={onSourceChange} />
          </div>
        </label>

        <label className="field">
          <span>水电估算（元/月，未知可留空）</span>
          <div className="field-with-source">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={listing.utilitiesEstimate}
              onChange={(event) => onChange('utilitiesEstimate', event.target.value)}
              placeholder="例如 200"
            />
            <SourceSelect field="utilitiesEstimate" sources={sources} onSourceChange={onSourceChange} />
          </div>
        </label>

        <div className="listing-group-label listing-group-label-spaced">房源条件</div>

        <label className="field">
          <span>通勤时间（分钟，未知可留空）</span>
          <div className="field-with-source">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={listing.commuteMinutes}
              onChange={(event) => onChange('commuteMinutes', event.target.value)}
              placeholder="例如 35"
            />
            <SourceSelect field="commuteMinutes" sources={sources} onSourceChange={onSourceChange} />
          </div>
        </label>

        <label className="field">
          <span>可入住日期（未知可留空）</span>
          <div className="field-with-source">
            <input
              type="date"
              value={listing.availableDate}
              onChange={(event) => onChange('availableDate', event.target.value)}
            />
            <SourceSelect field="availableDate" sources={sources} onSourceChange={onSourceChange} />
          </div>
        </label>
        </div>
      </details>

      <label className="field">
        <span>房源描述（选填）</span>
        <textarea
          value={listing.listingText}
          onChange={(event) => onChange('listingText', event.target.value)}
          placeholder="例如：一室一厅、朝南、家具齐全、房东直租..."
        />
        {validation.errors.listingText && <em className="field-error">{validation.errors.listingText}</em>}
      </label>
    </div>
  )
}

// 组合组件：租房需求 + 房源信息，可折叠
// 折叠面板交给原生 <details> 自由开合
export default function DecisionInputForms({
  needs,
  needsValidation,
  listing,
  listingValidation,
  sources,
  onNeedsChange,
  onMustHaveAdd,
  onMustHaveRemove,
  onListingChange,
  onSourceChange,
  onFillDemo,
}) {
  return (
    <section className="work-panel decision-input-forms" aria-label="签约决策输入">
      <div className="panel-head">
        <div>
          <h2>签约决策输入</h2>
          <p>先明确你的条件，再补充这套房的已知信息，就能进入下一步审合同。</p>
        </div>
        {onFillDemo && (
          <button className="ghost-button compact-button demo-fill-button" type="button" onClick={onFillDemo}>
            <Sparkles size={15} aria-hidden="true" />
            填充演示数据
          </button>
        )}
      </div>

      <details className="decision-details" id="step-needs" open>
      <summary className="decision-summary">
          <span>① 我的租房条件</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <NeedsForm
          needs={needs}
          validation={needsValidation}
          onChange={onNeedsChange}
          onMustHaveAdd={onMustHaveAdd}
          onMustHaveRemove={onMustHaveRemove}
        />
      </details>

      <details className="decision-details" id="step-listing">
        <summary className="decision-summary">
          <span>② 这套房的条件</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <ListingForm listing={listing} validation={listingValidation} sources={sources} onChange={onListingChange} onSourceChange={onSourceChange} />
      </details>
    </section>
  )
}
