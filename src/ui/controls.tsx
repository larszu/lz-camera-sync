/**
 * Settings you can change — live on a camera, or in a prepared setup.
 * The stepper only offers what the camera (or its model profile) offers:
 * ◀ value ▶ through the allowed values, or pick from the list.
 * Pattern from lz-camera-bridge's RCP selector, drawn in the LZM tool style.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatValue, GROUPS, propertyName, sameValue, type GroupId, type PropDesc, type PropValue } from '../core'
import { propLabel, t, type Key } from './i18n'

const ORDER: GroupId[] = ['exposure', 'whiteBalance', 'picture', 'movie', 'focus', 'body']

/** Allowed values of a property: its enum, or its range expanded by step. */
export function optionsOf(p: PropDesc): PropValue[] {
  if (p.values?.length) return p.values
  if (p.range) {
    const [min, max, step] = [Number(p.range.min), Number(p.range.max), Math.max(1, Number(p.range.step))]
    const out: number[] = []
    for (let v = min; v <= max && out.length < 400; v += step) out.push(v)
    return out
  }
  return []
}

export function PropStepper({
  desc,
  value,
  onChange,
  pending,
  disabled,
  note,
}: {
  desc: PropDesc
  value: PropValue
  onChange: (v: PropValue) => void
  pending?: boolean
  disabled?: boolean
  note?: string
}) {
  const options = optionsOf(desc)
  const i = options.findIndex((o) => sameValue(o, value))
  const off = disabled || !desc.writable || options.length === 0
  const step = (d: number) => {
    const j = i < 0 ? 0 : i + d
    if (j >= 0 && j < options.length) onChange(options[j])
  }
  const label = propLabel(desc.code, propertyName(desc.code))
  return (
    <div className={`stepper${pending ? ' is-pending' : ''}${off ? ' is-off' : ''}`} title={!desc.writable ? t('lockedHint') : undefined}>
      <span className="stepper-label">{label}</span>
      <div className="stepper-row">
        <button className="stepper-btn" onClick={() => step(-1)} disabled={off || i <= 0} aria-label={`${label} −`}>
          <ChevronLeft size={18} strokeWidth={1.5} strokeLinecap="square" aria-hidden />
        </button>
        <select className="stepper-value" value={i < 0 ? '' : String(i)} disabled={off} onChange={(e) => onChange(options[Number(e.target.value)])} aria-label={label}>
          {i < 0 && <option value="">{formatValue(desc.code, value)}</option>}
          {options.map((o, j) => (
            <option key={j} value={String(j)}>
              {formatValue(desc.code, o)}
            </option>
          ))}
        </select>
        <button className="stepper-btn" onClick={() => step(1)} disabled={off || i < 0 || i >= options.length - 1} aria-label={`${label} +`}>
          <ChevronRight size={18} strokeWidth={1.5} strokeLinecap="square" aria-hidden />
        </button>
      </div>
      {note && <span className="stepper-note">{note}</span>}
      {!desc.writable && <span className="stepper-note">{t('locked')}</span>}
    </div>
  )
}

/**
 * All key settings, grouped. `values` are what is shown (live camera or the
 * setup being edited); `include` (setup editor) decides what goes into it.
 */
export function SettingsGrid({
  descs,
  values,
  onChange,
  pending,
  include,
  onInclude,
}: {
  descs: PropDesc[]
  values: Map<number, PropValue>
  onChange: (code: number, v: PropValue) => void
  pending?: Set<number>
  include?: Set<number>
  onInclude?: (code: number, on: boolean) => void
}) {
  const byCode = new Map(descs.map((d) => [d.code, d]))
  return (
    <div className="settings">
      {ORDER.map((g) => {
        const codes = GROUPS.find((x) => x.id === g)!.codes.filter((c) => byCode.has(c))
        if (!codes.length) return null
        return (
          <section key={g} className="settings-group">
            <h3 className="kicker">{t(`group_${g}` as Key)}</h3>
            <div className="settings-items">
              {codes.map((c) => {
                const d = byCode.get(c)!
                const v = values.get(c) ?? d.current
                return (
                  <div key={c} className={`settings-item${include && !include.has(c) ? ' is-excluded' : ''}`}>
                    {onInclude && (
                      <label className="include">
                        <input type="checkbox" checked={include!.has(c)} onChange={(e) => onInclude(c, e.target.checked)} />
                        <span className="sr-only">{t('includeInSetup')}</span>
                      </label>
                    )}
                    <PropStepper
                      desc={d}
                      value={v}
                      pending={pending?.has(c)}
                      onChange={(nv) => {
                        onChange(c, nv)
                        if (onInclude && !include!.has(c)) onInclude(c, true)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
