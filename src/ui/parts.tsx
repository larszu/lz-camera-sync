/** Small building blocks: sheet (native dialog), checkpoint pips, progress. */

import { useEffect, useRef, type ReactNode } from 'react'
import { CHECKPOINTS } from './job'
import { X } from 'lucide-react'
import { t } from './i18n'

export function Sheet({ open, onClose, kicker, title, children }: { open: boolean; onClose: () => void; kicker?: string; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        // Click on the scrim (the dialog box itself, outside its content) closes.
        if (e.target === ref.current) onClose()
      }}
    >
      {open && (
        <div className="sheet-body">
          <header className="kopf">
            {kicker && <span className="kicker">{kicker}</span>}
            <div className="sheet-title">
              <h2>{title}</h2>
              <button className="ghost" onClick={onClose} aria-label={t('close')}>
                <X size={18} strokeWidth={1.5} strokeLinecap="square" aria-hidden />
              </button>
            </div>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}

/** Three squares: backed up · aligned · given back. */
export function Pips({ done, busyIndex }: { done: number; busyIndex?: number }) {
  return (
    <ol className="pips" aria-label={CHECKPOINTS.map((c, i) => `${t(`pip_${c}`)}${i < done ? ' ✓' : ''}`).join(', ')}>
      {CHECKPOINTS.map((c, i) => (
        <li key={c} className={i < done ? 'is-done' : i === busyIndex ? 'is-busy' : ''} title={t(`pip_${c}`)}>
          <span className="pip" />
          <span className="pip-label">{t(`pip_${c}`)}</span>
        </li>
      ))}
    </ol>
  )
}

export function Progress({ value }: { value?: number }) {
  return (
    <div className={`progress${value === undefined ? ' is-indeterminate' : ''}`} role="progressbar" aria-valuenow={value === undefined ? undefined : Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={value === undefined ? undefined : { inlineSize: `${Math.max(4, value * 100)}%` }} />
    </div>
  )
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}
