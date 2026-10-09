/** Small building blocks: sheet (native dialog), checkpoint pips, progress. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CHECKPOINTS } from './job'
import { Eye, EyeOff, X } from 'lucide-react'
import { t } from './i18n'

export function Sheet({ open, onClose, kicker, title, children, wide }: { open: boolean; onClose: () => void; kicker?: string; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const wanted = useRef(open)
  useEffect(() => {
    wanted.current = open
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`sheet${wide ? ' is-wide' : ''}`}
      // Only a close the operator caused (Escape, ✕, scrim) reports back. A
      // close because another sheet takes over must not close that one too.
      onClose={() => {
        if (wanted.current) onClose()
      }}
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

/** Password field with the eye button to show what was typed. */
export function PasswordInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [shown, setShown] = useState(false)
  const Icon = shown ? EyeOff : Eye
  return (
    <span className="password">
      <input value={value} type={shown ? 'text' : 'password'} placeholder={t('sshPassword')} autoComplete="current-password" spellCheck={false} onChange={(e) => onChange(e.target.value)} aria-label={t('sshPassword')} />
      <button type="button" className="password-eye" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? t('hidePassword') : t('showPassword')} title={shown ? t('hidePassword') : t('showPassword')}>
        <Icon size={18} strokeWidth={1.5} strokeLinecap="square" aria-hidden />
      </button>
    </span>
  )
}

// ── Look: "modern" (default) or "classic" (the LZM tool style) ────────────

export const LOOK_KEY = 'lz-camera-sync/style'

export function readLook(): 'modern' | 'classic' {
  try {
    return localStorage.getItem(LOOK_KEY) === 'classic' ? 'classic' : 'modern'
  } catch {
    return 'modern'
  }
}

/** Job progress as a ring — shown in the modern look only. */
export function Ring({ value }: { value: number }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <svg className="ring" viewBox="0 0 48 48" aria-hidden>
      <circle className="ring-track" cx="24" cy="24" r={r} />
      <circle className="ring-fill" cx="24" cy="24" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      <text x="24" y="24" dominantBaseline="central" textAnchor="middle">
        {Math.round(value * 100)}
      </text>
    </svg>
  )
}

const CONFETTI_COLORS = ['#3FA9F5', '#3DDC84', '#FF8A3D', '#A66CFF', '#FFD23F', '#FF5FA2']

/** A short burst when a job is through — modern look, and never with reduced motion. */
export function Confetti() {
  const [bits] = useState(() =>
    Array.from({ length: 48 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 300,
      drift: (Math.random() - 0.5) * 160,
      spin: (Math.random() - 0.5) * 900,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      dur: 1400 + Math.random() * 900,
    })),
  )
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}ms`, animationDuration: `${b.dur}ms`, ['--drift' as string]: `${b.drift}px`, ['--spin' as string]: `${b.spin}deg` }}
        />
      ))}
    </div>
  )
}
