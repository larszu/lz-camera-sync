import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Clock, Menu, Plus, Usb, Wifi } from 'lucide-react'
import { ALL_GROUPS, formatValue, GROUPS, propertyName, reportOk, type ApplyReport } from '../core'
import { addSimulated, backup, connectNetwork, disconnect, findUsb, hasHost, newJob, push, restore, setupFromCamera } from './actions'
import { cams, locale, propLabel, t, type Key } from './i18n'
import { checkpointsDone, jobView, PHASES, type JobView, type Phase } from './job'
import { initials, Pips, Progress, Sheet } from './parts'
import { exportJson, importJson, newId, update, useStore, type Live, type Persisted } from './store'
import wordmarkLight from './assets/lzm_wortmarke_navy.svg'
import wordmarkDark from './assets/lzm_wortmarke_offwhite.svg'

const icon = { size: 18, strokeWidth: 1.5, strokeLinecap: 'square' as const, 'aria-hidden': true }
const KEY_CODES = GROUPS.flatMap((g) => g.codes)
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : t('never'))
const labelOf = (data: Persisted, serial: string) => data.cameras[serial]?.label ?? serial

type SheetState = { kind: 'camera' | 'operator'; serial: string } | { kind: 'connect' } | { kind: 'menu' } | null
type Run = (fn: () => Promise<unknown>) => void

async function usbSearch() {
  const r = await findUsb()
  if (r.reason === 'usb-module-missing') throw new Error(t('usbMissing'))
  if (r.found === 0) throw new Error(t('usbNone'))
}

export function App() {
  const { data, live } = useStore()
  const [sheet, setSheet] = useState<SheetState>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [template, setTemplate] = useState<string | undefined>()
  const view = jobView(
    live.map((l) => l.serial),
    data.states,
  )

  const run: Run = async (fn) => {
    setBusy(true)
    setNotice('')
    try {
      await fn()
    } catch (e) {
      // Electron wraps errors from the main process; the operator needs only the reason.
      setNotice((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }

  // A template that disconnected, or a finished alignment, ends the choice.
  useEffect(() => {
    if (template && (view.phase !== 'push' || !live.some((l) => l.serial === template))) setTemplate(undefined)
  }, [live, template, view.phase])

  return (
    <div className="app">
      <header className="head">
        <img className="wordmark on-light" src={wordmarkLight} alt="Lars Zumpe" />
        <img className="wordmark on-dark" src={wordmarkDark} alt="Lars Zumpe" />
        <h1>{t('appName')}</h1>
        <button className="ghost icon-btn" onClick={() => setSheet({ kind: 'menu' })} aria-label={t('menu')}>
          <Menu {...icon} />
        </button>
      </header>

      <JobTrack view={view} />

      <NextAction
        view={view}
        data={data}
        live={live}
        busy={busy}
        template={template}
        run={run}
        openConnect={() => setSheet({ kind: 'connect' })}
        openCamera={(serial) => setSheet({ kind: 'camera', serial })}
      />
      {notice && (
        <p className="hint" role="alert">
          {notice}
        </p>
      )}

      {live.length > 0 && (
        <section className="grid">
          {live.map((l) => (
            <CameraTile
              key={l.serial}
              l={l}
              data={data}
              phase={view.phase}
              isTemplate={template === l.serial}
              onTemplate={() => setTemplate(template === l.serial ? undefined : l.serial)}
              onOpen={() => setSheet({ kind: 'camera', serial: l.serial })}
              onOperator={() => setSheet({ kind: 'operator', serial: l.serial })}
            />
          ))}
          <button className="tile add-tile" onClick={() => setSheet({ kind: 'connect' })}>
            <Plus size={28} strokeWidth={1.5} strokeLinecap="square" aria-hidden />
            {t('addCamera')}
          </button>
        </section>
      )}

      <CameraSheet sheet={sheet} data={data} live={live} onClose={() => setSheet(null)} onOperator={(serial) => setSheet({ kind: 'operator', serial })} />
      <OperatorSheet sheet={sheet} data={data} onClose={() => setSheet(null)} />
      <ConnectSheet open={sheet?.kind === 'connect'} onClose={() => setSheet(null)} run={run} />
      <MenuSheet open={sheet?.kind === 'menu'} data={data} onClose={() => setSheet(null)} />
    </div>
  )
}

// ── Job track ────────────────────────────────────────────────────────────

const TRACK: { phase: Phase; label: Key }[] = [
  { phase: 'connect', label: 'step_connect' },
  { phase: 'backup', label: 'step_backup' },
  { phase: 'push', label: 'step_push' },
  { phase: 'restore', label: 'step_restore' },
]

function JobTrack({ view }: { view: JobView }) {
  const current = PHASES.indexOf(view.phase)
  const count = (p: Phase) => (p === 'backup' ? view.counts.backup : p === 'push' ? view.counts.push : view.counts.restore)
  const pct = view.total ? Math.round(((view.counts.backup + view.counts.push + view.counts.restore) / (view.total * 3)) * 100) : 0
  return (
    <nav className="track" aria-label="Job">
      <ol>
        {TRACK.map((s, i) => (
          <li key={s.phase} className={i < current ? 'is-done' : i === current ? 'is-current' : ''} aria-current={i === current ? 'step' : undefined}>
            <span className="station">{i < current ? <Check size={16} strokeWidth={2} strokeLinecap="square" aria-hidden /> : i + 1}</span>
            <span className="station-label">{t(s.label)}</span>
            <span className="station-count">{view.total > 0 ? (s.phase === 'connect' ? cams(view.total) : `${count(s.phase)}/${view.total}`) : '\u00a0'}</span>
          </li>
        ))}
      </ol>
      <div className="track-meter">
        <Progress value={pct / 100} />
        <span>{t('jobProgress', { pct })}</span>
      </div>
    </nav>
  )
}

// ── Next action: exactly one big thing to press ──────────────────────────

function NextAction(p: { view: JobView; data: Persisted; live: Live[]; busy: boolean; template?: string; run: Run; openConnect: () => void; openCamera: (serial: string) => void }) {
  const { view, data, live, busy, run } = p
  const [savedId, setSavedId] = useState('')
  const pending = view.pending
  const anyBusy = busy || live.some((l) => l.busy)
  const problems = live
    .map((l) => ({ l, n: l.report ? l.report.failed.length + l.report.mismatched.length + (l.report.clockSet === false ? 1 : 0) : 0 }))
    .filter((x) => x.n > 0 || x.l.error)

  const busyLabel = (normal: string) => (anyBusy && view.phase !== 'connect' && view.phase !== 'done' ? t(`working_${view.phase}` as Key) : normal)

  let body: ReactNode
  switch (view.phase) {
    case 'connect':
      body = (
        <>
          <Head kicker={t('connectKicker')} title={t('connectTitle')} text={t('connectText')} />
          <div className="actions">
            {hasHost() && (
              <>
                <button className="primary big" disabled={anyBusy} onClick={() => run(usbSearch)}>
                  <Usb {...icon} /> {t('searchUsb')}
                </button>
                <button className="big" onClick={p.openConnect}>
                  <Wifi {...icon} /> {t('viaWifi')}
                </button>
              </>
            )}
            <button
              className={hasHost() ? 'ghost' : 'primary big'}
              disabled={anyBusy}
              onClick={() =>
                run(async () => {
                  for (let i = 0; i < 3; i++) await addSimulated()
                })
              }
            >
              {t('demo')}
            </button>
          </div>
          {!hasHost() && <p className="muted small">{t('noHost')}</p>}
        </>
      )
      break

    case 'backup':
      body = (
        <>
          <Head kicker={t('backupKicker')} title={t('backupTitle', { cams: cams(pending.length) })} text={t('backupText')} />
          <div className="actions">
            <button className="primary big" disabled={anyBusy} onClick={() => run(() => backup(pending))}>
              {busyLabel(t('backupGo'))}
            </button>
          </div>
        </>
      )
      break

    case 'push': {
      const saved = data.setups.find((s) => s.id === savedId)
      const source = p.template ? labelOf(data, p.template) : saved?.name
      body = (
        <>
          <Head kicker={t('pushKicker')} title={t('pushTitle')} text={p.template ? undefined : t('pushPick')} />
          {!p.template && data.setups.length > 0 && (
            <label className="field inline">
              <span>{t('orSaved')}</span>
              <select value={savedId} onChange={(e) => setSavedId(e.target.value)}>
                <option value="">—</option>
                {data.setups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {p.template && (
            <fieldset className="chips">
              <legend>{t('carries')}</legend>
              {ALL_GROUPS.map((g) => (
                <Chip key={g} on={data.groups.includes(g)} onToggle={(on) => update((d) => ({ ...d, groups: on ? [...d.groups, g] : d.groups.filter((x) => x !== g) }))}>
                  {t(`group_${g}` as Key)}
                </Chip>
              ))}
            </fieldset>
          )}
          <div className="chips">
            <Chip on={data.withClock} onToggle={(on) => update((d) => ({ ...d, withClock: on }))}>
              <Clock size={14} strokeWidth={1.5} strokeLinecap="square" aria-hidden /> {t('withClock')}
            </Chip>
            {data.withClock && (
              <Chip on={data.clockUtc} onToggle={(on) => update((d) => ({ ...d, clockUtc: on }))}>
                {t('clockUtc')}
              </Chip>
            )}
          </div>
          <div className="actions">
            <button
              className="primary big"
              disabled={anyBusy || !source || (!!p.template && data.groups.length === 0)}
              onClick={() =>
                run(async () => {
                  const setup = p.template ? setupFromCamera(p.template) : saved
                  if (setup) await push(pending, setup)
                })
              }
            >
              {busyLabel(source ? t('pushFrom', { name: source, cams: cams(pending.length) }) : t('pushGo'))}
            </button>
          </div>
        </>
      )
      break
    }

    case 'restore':
      body = (
        <>
          <Head kicker={t('restoreKicker')} title={t('restoreTitle')} text={t('restoreText')} />
          <div className="actions">
            <button className="primary big" disabled={anyBusy} onClick={() => run(() => restore(pending))}>
              {busyLabel(t('restoreGo'))}
            </button>
          </div>
        </>
      )
      break

    case 'done': {
      const written = live.reduce((n, l) => n + (l.written ?? 0), 0)
      const clocks = live.filter((l) => l.clockSet).length
      body = (
        <>
          <Head kicker={t('doneKicker')} title={t('doneTitle', { cams: cams(view.total) })} />
          <ol className="done-row">
            {live.map((l, i) => (
              <li key={l.serial} style={{ animationDelay: `${i * 80}ms` }}>
                <Check size={18} strokeWidth={2} strokeLinecap="square" aria-hidden />
                {labelOf(data, l.serial)}
              </li>
            ))}
          </ol>
          <p className="muted small">{t('doneStats', { written, clocks: cams(clocks) })}</p>
          <div className="actions">
            <button className="primary big" onClick={newJob}>
              {t('newJob')}
            </button>
          </div>
        </>
      )
      break
    }
  }

  return (
    <section className={`next phase-${view.phase}`} aria-live="polite">
      {body}
      {problems.map(({ l, n }) => (
        <button key={l.serial} className="attention" onClick={() => p.openCamera(l.serial)}>
          {t('attention', { name: labelOf(data, l.serial), n: n || 1 })}
        </button>
      ))}
    </section>
  )
}

function Head({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <>
      <div className="kopf">
        <span className="kicker">{kicker}</span>
      </div>
      <h2 className="next-title">{title}</h2>
      {text && <p className="next-text">{text}</p>}
    </>
  )
}

function Chip({ on, onToggle, children }: { on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onToggle(!on)}>
      {on && <Check size={14} strokeWidth={2} strokeLinecap="square" aria-hidden />}
      {children}
    </button>
  )
}

// ── Camera tile ──────────────────────────────────────────────────────────

const BUSY_INDEX: Record<string, number> = { backup: 0, push: 1, restore: 2 }

function CameraTile(p: { l: Live; data: Persisted; phase: Phase; isTemplate: boolean; onTemplate: () => void; onOpen: () => void; onOperator: () => void }) {
  const { l, data } = p
  const cam = data.cameras[l.serial]
  const op = data.operators.find((o) => o.id === cam?.operatorId)
  const done = checkpointsDone(data.states[l.serial])
  const transport = l.transport === 'usb' ? 'USB' : l.transport === 'ptpip' ? 'WLAN' : t('simulated')
  const ok = l.report ? reportOk(l.report) : undefined

  return (
    <article className={`tile${p.isTemplate ? ' is-template' : ''}${l.busy ? ' is-busy' : ''}${done === 3 ? ' is-complete' : ''}`} aria-busy={!!l.busy}>
      <button className="tile-main" onClick={p.onOpen}>
        <span className="kicker">
          {transport} · {l.serial}
        </span>
        <span className="tile-label">{cam?.label ?? l.serial}</span>
        <span className="tile-model">{cam?.model}</span>
      </button>

      <button className={`operator${op ? '' : ' is-empty'}`} onClick={p.onOperator}>
        <span className="avatar">{op ? initials(op.name) : '?'}</span>
        {op?.name ?? t('noOperator')}
      </button>

      <Pips done={done} busyIndex={l.busy ? BUSY_INDEX[l.busy] : undefined} />

      <div className="tile-foot">
        {l.busy ? (
          <div className="working">
            <span className="muted small">{t(`working_${l.busy}` as Key)}</span>
            <Progress value={l.progress && l.progress.total ? l.progress.done / l.progress.total : undefined} />
          </div>
        ) : l.error ? (
          <span className="status is-warn">{l.error}</span>
        ) : ok !== undefined ? (
          <span className={`status ${ok ? 'is-ok' : 'is-warn'}`}>{ok ? t('ok') : t('problems')}</span>
        ) : (
          <span />
        )}
        {p.phase === 'push' && !l.busy && (
          <button className={`template-btn${p.isTemplate ? ' is-on' : ''}`} aria-pressed={p.isTemplate} onClick={p.onTemplate}>
            {p.isTemplate && <Check size={14} strokeWidth={2} strokeLinecap="square" aria-hidden />}
            {p.isTemplate ? t('template') : t('makeTemplate')}
          </button>
        )}
      </div>
    </article>
  )
}

// ── Sheets ───────────────────────────────────────────────────────────────

function CameraSheet({ sheet, data, live, onClose, onOperator }: { sheet: SheetState; data: Persisted; live: Live[]; onClose: () => void; onOperator: (serial: string) => void }) {
  const serial = sheet?.kind === 'camera' ? sheet.serial : ''
  const l = live.find((x) => x.serial === serial)
  const cam = data.cameras[serial]
  const backupSnap = data.backups[serial]
  const setup = data.setups.find((s) => s.id === data.activeSetupId)
  const op = data.operators.find((o) => o.id === cam?.operatorId)

  const current = new Map(l?.props.map((p) => [p.code, p.current]))
  const priv = new Map(backupSnap?.values.map((v) => [v.code, v.value]))
  const glob = new Map(setup?.values.map((v) => [v.code, v.value]))

  return (
    <Sheet open={!!l} onClose={onClose} kicker={l ? `${l.transport === 'usb' ? 'USB' : l.transport === 'ptpip' ? 'WLAN' : t('simulated')} · ${serial}` : undefined} title={cam?.label ?? serial}>
      {l && (
        <>
          <label className="field">
            <span>{t('label')}</span>
            <input value={cam?.label ?? ''} onChange={(e) => update((d) => ({ ...d, cameras: { ...d.cameras, [serial]: { ...d.cameras[serial], label: e.target.value } } }))} />
          </label>
          <dl className="facts">
            <dt>{t('operator')}</dt>
            <dd>
              <button className="ghost inline" onClick={() => onOperator(serial)}>
                {op?.name ?? t('noOperator')}
              </button>
            </dd>
            <dt>{t('model')}</dt>
            <dd>{cam?.model}</dd>
            <dt>{t('lastBackup')}</dt>
            <dd>{when(backupSnap?.takenAt)}</dd>
          </dl>
          {l.report && <Report r={l.report} />}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('setting')}</th>
                  <th>{t('private')}</th>
                  <th>{t('current')}</th>
                  <th>{t('global')}</th>
                </tr>
              </thead>
              <tbody>
                {KEY_CODES.filter((c) => current.has(c)).map((c) => {
                  const now = current.get(c)!
                  const differs = priv.has(c) && formatValue(c, priv.get(c)!) !== formatValue(c, now)
                  return (
                    <tr key={c}>
                      <td>{propLabel(c, propertyName(c))}</td>
                      <td>{priv.has(c) ? formatValue(c, priv.get(c)!) : '—'}</td>
                      <td className={differs ? 'is-changed' : ''}>{formatValue(c, now)}</td>
                      <td>{glob.has(c) ? formatValue(c, glob.get(c)!) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="actions end">
            <button
              className="ghost danger"
              onClick={() => {
                onClose()
                void disconnect(serial)
              }}
            >
              {t('disconnect')}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function Report({ r }: { r: ApplyReport }) {
  const ok = reportOk(r)
  return (
    <div className="report">
      <span className={`status ${ok ? 'is-ok' : 'is-warn'}`}>{ok ? t('ok') : t('problems')}</span>
      <span>
        {r.applied.length} {t('applied')} · {r.unchanged} {t('unchanged')}
        {r.clockSet === true && <> · {t('clockOk')}</>}
        {r.clockSet === false && (
          <>
            {' '}
            · {t('clockFailed')} ({r.clockError})
          </>
        )}
      </span>
      {r.failed.length > 0 && (
        <span>
          {t('failed')}: {r.failed.map((s) => s.name).join(', ')}
        </span>
      )}
      {r.mismatched.length > 0 && (
        <span>
          {t('mismatched')}: {r.mismatched.map((s) => s.name).join(', ')}
        </span>
      )}
      {r.skipped.length > 0 && (
        <span className="muted">
          {t('skipped')}: {r.skipped.map((s) => s.name).join(', ')}
        </span>
      )}
    </div>
  )
}

function OperatorSheet({ sheet, data, onClose }: { sheet: SheetState; data: Persisted; onClose: () => void }) {
  const serial = sheet?.kind === 'operator' ? sheet.serial : ''
  const [name, setName] = useState('')
  const current = data.cameras[serial]?.operatorId
  const assign = (operatorId?: string) => {
    update((d) => ({ ...d, cameras: { ...d.cameras, [serial]: { ...d.cameras[serial], operatorId } } }))
    onClose()
  }
  return (
    <Sheet open={sheet?.kind === 'operator'} onClose={onClose} kicker={t('operator')} title={t('whoHasIt', { name: labelOf(data, serial) })}>
      <div className="pick">
        {data.operators.map((o) => (
          <button key={o.id} className={`pick-item${o.id === current ? ' is-on' : ''}`} onClick={() => assign(o.id)}>
            <span className="avatar">{initials(o.name)}</span>
            {o.name}
          </button>
        ))}
        <button className={`pick-item${!current ? ' is-on' : ''}`} onClick={() => assign(undefined)}>
          <span className="avatar">–</span>
          {t('nobody')}
        </button>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          const id = newId()
          update((d) => ({ ...d, operators: [...d.operators, { id, name: n }] }))
          setName('')
          assign(id)
        }}
      >
        <input value={name} placeholder={t('newOperator')} onChange={(e) => setName(e.target.value)} aria-label={t('newOperator')} />
        <button className="primary" disabled={!name.trim()}>
          {t('add')}
        </button>
      </form>
    </Sheet>
  )
}

function ConnectSheet({ open, onClose, run }: { open: boolean; onClose: () => void; run: Run }) {
  const [ip, setIp] = useState('')
  const go = (fn: () => Promise<unknown>) => {
    onClose()
    run(fn)
  }
  return (
    <Sheet open={open} onClose={onClose} kicker={t('step_connect')} title={t('addCamera')}>
      {hasHost() ? (
        <>
          <button className="primary big wide" onClick={() => go(usbSearch)}>
            <Usb {...icon} /> {t('searchUsb')}
          </button>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              if (ip.trim()) go(() => connectNetwork(ip.trim()))
            }}
          >
            <input value={ip} placeholder={t('ipPlaceholder')} inputMode="decimal" onChange={(e) => setIp(e.target.value)} aria-label={t('ipPlaceholder')} />
            <button disabled={!ip.trim()}>
              <Wifi {...icon} /> {t('connect')}
            </button>
          </form>
        </>
      ) : (
        <p className="muted small">{t('noHost')}</p>
      )}
      <button className="ghost" onClick={() => go(addSimulated)}>
        <Plus {...icon} /> {t('simulated')} FX3
      </button>
    </Sheet>
  )
}

type Theme = 'system' | 'light' | 'dark'

function MenuSheet({ open, data, onClose }: { open: boolean; data: Persisted; onClose: () => void }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('lz-camera-sync/theme') as Theme) || 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('lz-camera-sync/theme', theme)
    } catch {
      // storage blocked: the choice lasts for this session
    }
  }, [theme])
  const file = useRef<HTMLInputElement>(null)

  function download() {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `lz-camera-sync-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('menu')}>
      <h3 className="kicker">{t('appearance')}</h3>
      <div className="segmented" role="radiogroup" aria-label={t('appearance')}>
        {(['system', 'light', 'dark'] as Theme[]).map((v) => (
          <button key={v} role="radio" aria-checked={theme === v} className={theme === v ? 'is-on' : ''} onClick={() => setTheme(v)}>
            {t(v === 'system' ? 'themeSystem' : v === 'light' ? 'themeLight' : 'themeDark')}
          </button>
        ))}
      </div>

      <h3 className="kicker">{t('setups')}</h3>
      {data.setups.length === 0 && <p className="muted small">{t('noSetups')}</p>}
      <ul className="list">
        {data.setups.map((s) => (
          <li key={s.id}>
            <span>
              {s.name} <small className="muted">({s.values.length})</small>
            </span>
            <button className="ghost" onClick={() => update((d) => ({ ...d, setups: d.setups.filter((x) => x.id !== s.id) }))}>
              {t('remove')}
            </button>
          </li>
        ))}
      </ul>

      <h3 className="kicker">{t('operators')}</h3>
      <ul className="list">
        {data.operators.map((o) => (
          <li key={o.id}>
            <span className="with-avatar">
              <span className="avatar">{initials(o.name)}</span>
              {o.name}
            </span>
            <button className="ghost" onClick={() => update((d) => ({ ...d, operators: d.operators.filter((x) => x.id !== o.id) }))}>
              {t('remove')}
            </button>
          </li>
        ))}
      </ul>

      <h3 className="kicker">{t('data')}</h3>
      <div className="row">
        <button onClick={download}>{t('export')}</button>
        <button onClick={() => file.current?.click()}>{t('import')}</button>
        <input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) importJson(await f.text())
          }}
        />
      </div>
      <p className="muted small">v{__APP_VERSION__}</p>
    </Sheet>
  )
}
