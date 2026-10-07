import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, Camera, Check, Clock, ExternalLink, Menu, Plus, RefreshCw, Usb, Wifi } from 'lucide-react'
import { ALL_GROUPS, formatValue, GROUPS, propertyName, reportOk, type ApplyReport } from '../core'
import { addSimulated, backup, confirmFingerprint, connectFound, connectNetwork, disconnect, discoverCameras, findUsb, FingerprintNeeded, hasHost, hasSavedLogin, LoginNeeded, newJob, push, restore, setupFromCamera, type FoundCamera, type WifiLogin } from './actions'
import { cams, locale, propLabel, t, uiLang, type Key } from './i18n'
import { sonyPage, WAYS, type Model, type Way } from './guide'
import { checkpointsDone, jobView, PHASES, type JobView, type Phase } from './job'
import { initials, Pips, Progress, Sheet } from './parts'
import { exportJson, importJson, newId, update, useStore, type Live, type Persisted } from './store'
import wordmarkLight from './assets/lzm_wortmarke_navy.svg'
import wordmarkDark from './assets/lzm_wortmarke_offwhite.svg'

const icon = { size: 18, strokeWidth: 1.5, strokeLinecap: 'square' as const, 'aria-hidden': true }
const KEY_CODES = GROUPS.flatMap((g) => g.codes)
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : t('never'))
const labelOf = (data: Persisted, serial: string) => data.cameras[serial]?.label ?? serial

type SheetState =
  | { kind: 'camera' | 'operator'; serial: string }
  | { kind: 'connect' }
  | { kind: 'menu' }
  | { kind: 'guide'; way?: Way }
  | { kind: 'fingerprint'; fp: FingerprintNeeded; retry: () => void }
  | { kind: 'login'; camera: FoundCamera; wrong: boolean }
  | null
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

  const connectWifi = (ip: string, login?: WifiLogin): void =>
    run(async () => {
      try {
        await connectNetwork(ip, login)
      } catch (e) {
        if (e instanceof FingerprintNeeded) return setSheet({ kind: 'fingerprint', fp: e, retry: () => connectWifi(ip, login) })
        throw e
      }
    })

  /** One click on a found camera; asks for a login or a fingerprint only when it must. */
  const connectCam = (c: FoundCamera, typed?: WifiLogin, remember = true): Promise<void> =>
    (async () => {
      try {
        await connectFound(c, typed, remember)
      } catch (e) {
        if (e instanceof LoginNeeded) return setSheet({ kind: 'login', camera: c, wrong: e.wrong })
        if (e instanceof FingerprintNeeded) return setSheet({ kind: 'fingerprint', fp: e, retry: () => run(() => connectCam(c, typed, remember)) })
        throw e
      }
    })()

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
        <button className="ghost" onClick={() => setSheet({ kind: 'guide' })}>
          <BookOpen {...icon} /> <span className="hide-narrow">{t('guide')}</span>
        </button>
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
        openGuide={() => setSheet({ kind: 'guide' })}
        connectCam={connectCam}
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
      <ConnectSheet open={sheet?.kind === 'connect'} data={data} onClose={() => setSheet(null)} run={run} connectWifi={connectWifi} connectCam={connectCam} />
      <LoginSheet sheet={sheet} onClose={() => setSheet(null)} onLogin={(c, login, remember) => { setSheet(null); run(() => connectCam(c, login, remember)) }} />
      <FingerprintSheet
        sheet={sheet}
        onClose={() => setSheet(null)}
        onConfirm={(fp, retry) => {
          confirmFingerprint(fp.hostKey, fp.sha256)
          setSheet(null)
          retry()
        }}
      />
      <MenuSheet open={sheet?.kind === 'menu'} data={data} onClose={() => setSheet(null)} />
      <GuideSheet open={sheet?.kind === 'guide'} onClose={() => setSheet(null)} />
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

function NextAction(p: { view: JobView; data: Persisted; live: Live[]; busy: boolean; template?: string; run: Run; openConnect: () => void; openCamera: (serial: string) => void; openGuide: () => void; connectCam: (c: FoundCamera) => Promise<void> }) {
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
          {hasHost() && <FoundList run={run} connectCam={p.connectCam} />}
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
          <button className="guide-link" onClick={p.openGuide}>
            <BookOpen {...icon} /> {t('guideOpen')}
          </button>
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
          <Head kicker={t('doneKicker')} title={view.total === 1 ? t('doneTitleOne') : t('doneTitle', { cams: cams(view.total) })} />
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
        {r.viaMode > 0 && <> · {t('viaModeNote', { n: r.viaMode })}</>}
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

function ConnectSheet({ open, data, onClose, run, connectWifi, connectCam }: { open: boolean; data: Persisted; onClose: () => void; run: Run; connectWifi: (ip: string, login?: WifiLogin) => void; connectCam: (c: FoundCamera) => Promise<void> }) {
  const [ip, setIp] = useState('')
  const [auth, setAuth] = useState(true)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const known = data.hosts[ip.trim()]
  useEffect(() => {
    if (known?.user) setUser(known.user)
  }, [known?.user])
  const go = (fn: () => void) => {
    onClose()
    fn()
  }
  const canWifi = ip.trim() && (!auth || (user.trim() && password))
  return (
    <Sheet open={open} onClose={onClose} kicker={t('step_connect')} title={t('addCamera')}>
      {hasHost() ? (
        <>
          {open && <FoundList run={(fn) => { onClose(); run(fn) }} connectCam={connectCam} />}
          <button className="primary big wide" onClick={() => go(() => run(usbSearch))}>
            <Usb {...icon} /> {t('searchUsb')}
          </button>
          <form
            className="wifi"
            onSubmit={(e) => {
              e.preventDefault()
              if (!canWifi) return
              const login = auth ? { user: user.trim(), password } : undefined
              setPassword('')
              go(() => connectWifi(ip.trim(), login))
            }}
          >
            <h3 className="kicker">{t('manualIpTitle')} {t('manualIp')}</h3>
            <input value={ip} placeholder={t('ipPlaceholder')} inputMode="decimal" onChange={(e) => setIp(e.target.value)} aria-label={t('ipPlaceholder')} />
            <Chip on={auth} onToggle={setAuth}>
              {t('accessAuth')}
            </Chip>
            {auth ? (
              <div className="row">
                <input value={user} placeholder={t('sshUser')} autoComplete="username" onChange={(e) => setUser(e.target.value)} aria-label={t('sshUser')} />
                <input value={password} type="password" placeholder={t('sshPassword')} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} aria-label={t('sshPassword')} />
              </div>
            ) : (
              <p className="muted small">{t('pairingHint')}</p>
            )}
            <button disabled={!canWifi}>
              <Wifi {...icon} /> {t('connect')}
            </button>
          </form>
        </>
      ) : (
        <p className="muted small">{t('noHost')}</p>
      )}
      <button className="ghost" onClick={() => go(() => run(addSimulated))}>
        <Plus {...icon} /> {t('addSim')}
      </button>
    </Sheet>
  )
}

function FingerprintSheet({ sheet, onClose, onConfirm }: { sheet: SheetState; onClose: () => void; onConfirm: (fp: FingerprintNeeded, retry: () => void) => void }) {
  const fp = sheet?.kind === 'fingerprint' ? sheet.fp : undefined
  const changed = fp?.kind === 'mismatch'
  return (
    <Sheet open={!!fp} onClose={onClose} kicker={fp ? `WLAN · ${fp.ip}` : undefined} title={changed ? t('fpChangedTitle') : t('fpTitle')}>
      {fp && (
        <>
          <p className={changed ? 'hint' : 'next-text'}>{changed ? t('fpChangedText') : t('fpText')}</p>
          <dl className="facts fingerprint">
            <dt>SHA256</dt>
            <dd>{fp.sha256.replace(/^SHA256:/, '')}</dd>
            <dt>MD5</dt>
            <dd>{fp.md5}</dd>
          </dl>
          <div className="actions">
            <button className="primary big" onClick={() => sheet?.kind === 'fingerprint' && onConfirm(fp, sheet.retry)}>
              {t('fpConfirm')}
            </button>
            <button className="ghost" onClick={onClose}>
              {t('cancel')}
            </button>
          </div>
        </>
      )}
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

// ── Setup guide ──────────────────────────────────────────────────────────

const GUIDE_KEY = 'lz-camera-sync/guide'

function GuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(GUIDE_KEY) ?? '{}') as { model?: Model; way?: Way; done?: Record<string, number[]> }
    } catch {
      return {}
    }
  })()
  const [model, setModel] = useState<Model>(saved.model ?? 'fx3')
  const [way, setWay] = useState<Way>(saved.way ?? 'router')
  const [done, setDone] = useState<Record<string, number[]>>(saved.done ?? {})
  useEffect(() => {
    try {
      localStorage.setItem(GUIDE_KEY, JSON.stringify({ model, way, done }))
    } catch {
      // per-viewer convenience only
    }
  }, [model, way, done])

  const steps = WAYS[way]
  const ticked = new Set(done[way] ?? [])
  const toggle = (i: number) => setDone((d) => ({ ...d, [way]: ticked.has(i) ? [...ticked].filter((x) => x !== i) : [...ticked, i] }))
  const next = steps.findIndex((_, i) => !ticked.has(i))

  return (
    <Sheet open={open} onClose={onClose} kicker={t('guideKicker')} title={t('guide')}>
      <div className="guide-pickers">
        <div className="segmented" role="radiogroup" aria-label="Model">
          {(['fx3', 'a7iv'] as Model[]).map((m) => (
            <button key={m} role="radio" aria-checked={model === m} className={model === m ? 'is-on' : ''} onClick={() => setModel(m)}>
              {m === 'fx3' ? 'FX3' : 'A7 IV'}
            </button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label={t('guide')}>
          {(['usb', 'router', 'mac', 'direct'] as Way[]).map((w) => (
            <button key={w} role="radio" aria-checked={way === w} className={way === w ? 'is-on' : ''} onClick={() => setWay(w)}>
              {t(`way_${w}` as Key)}
            </button>
          ))}
        </div>
      </div>

      <div className="track-meter guide-meter">
        <Progress value={ticked.size / steps.length} />
        <span>{ticked.size === steps.length ? t('guideAllDone') : t('guideDone', { done: ticked.size, total: steps.length })}</span>
      </div>

      <ol className="guide">
        {steps.map((st, i) => (
          <li key={`${way}-${i}`} className={ticked.has(i) ? 'is-done' : i === next ? 'is-next' : ''}>
            <button className="guide-tick" aria-pressed={ticked.has(i)} onClick={() => toggle(i)} aria-label={st.title[uiLang]}>
              {ticked.has(i) ? <Check size={16} strokeWidth={2} strokeLinecap="square" aria-hidden /> : i + 1}
            </button>
            <div className="guide-body">
              <div className="guide-head">
                <span className="kicker">{t(`where_${st.where}` as Key)}</span>
                <strong>{st.title[uiLang]}</strong>
              </div>
              {st.menu && (
                <div className="cam-menu" aria-label={['MENU', ...st.menu[uiLang]].join(' → ')}>
                  <span className="cam-menu-root">MENU</span>
                  {st.menu[uiLang].map((m, j, arr) => (
                    <span key={j} className={j === arr.length - 1 ? 'cam-menu-item is-target' : 'cam-menu-item'}>
                      {m}
                    </span>
                  ))}
                </div>
              )}
              {st.text && <p className="guide-text">{st.text[uiLang]}</p>}
              {st.topic && (
                <a className="guide-sony" href={sonyPage(model, uiLang, st.topic)} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} strokeWidth={1.5} strokeLinecap="square" aria-hidden /> {t('inSonyManual')}
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
      {ticked.size > 0 && (
        <button className="ghost" onClick={() => setDone((d) => ({ ...d, [way]: [] }))}>
          {t('guideReset')}
        </button>
      )}
    </Sheet>
  )
}

// ── Found cameras (automatic search) ─────────────────────────────────────

function FoundList({ run, connectCam }: { run: Run; connectCam: (c: FoundCamera) => Promise<void> }) {
  const [found, setFound] = useState<(FoundCamera & { saved: boolean })[]>([])
  const [scanning, setScanning] = useState(false)
  const [pairing, setPairing] = useState<string | null>(null)
  const scan = async () => {
    setScanning(true)
    try {
      const list = await discoverCameras()
      setFound(await Promise.all(list.map(async (c) => ({ ...c, saved: await hasSavedLogin(c) }))))
    } finally {
      setScanning(false)
    }
  }
  useEffect(() => {
    let alive = true
    const loop = async () => {
      while (alive) {
        await scan()
        await new Promise((r) => setTimeout(r, 4000))
      }
    }
    void loop()
    return () => {
      alive = false
    }
  }, [])

  const go = (c: FoundCamera) =>
    run(async () => {
      if (!c.ssh) setPairing(c.ip)
      try {
        await connectCam(c)
      } finally {
        setPairing(null)
        void scan()
      }
    })

  return (
    <div className="found">
      <div className="found-head">
        <span className="kicker">{t('foundTitle')}</span>
        <button className="ghost" onClick={() => void scan()} disabled={scanning} aria-label={t('searching')}>
          <RefreshCw size={16} strokeWidth={1.5} strokeLinecap="square" aria-hidden className={scanning ? 'spin' : ''} />
          {scanning ? t('searching') : ''}
        </button>
      </div>
      {found.length === 0 && !scanning && <p className="muted small">{t('noneFound')}</p>}
      <ul className="found-list">
        {found.map((c) => (
          <li key={c.ip}>
            <Camera size={22} strokeWidth={1.5} strokeLinecap="square" aria-hidden />
            <div className="found-body">
              <strong>
                {c.model.replace(/^ILME-|^ILCE-/, '')} {c.name && <span className="muted">· {c.name}</span>}
              </strong>
              <span className="muted small">
                {c.ip} · {pairing === c.ip ? t('confirmOnCamera') : !c.ssh ? t('pairsOnce') : c.saved ? t('savedLogin') : t('needsLoginOnce')}
              </span>
            </div>
            <button className="primary" onClick={() => go(c)}>
              {t('connect')}
            </button>
          </li>
        ))}
      </ul>
      {found.length > 1 && found.every((c) => !c.ssh || c.saved) && (
        <button onClick={() => run(async () => { for (const c of found) await connectCam(c) })}>{t('connectAll')}</button>
      )}
    </div>
  )
}

function LoginSheet({ sheet, onClose, onLogin }: { sheet: SheetState; onClose: () => void; onLogin: (c: FoundCamera, login: WifiLogin, remember: boolean) => void }) {
  const c = sheet?.kind === 'login' ? sheet.camera : undefined
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  return (
    <Sheet open={!!c} onClose={onClose} kicker={c ? `WLAN · ${c.ip}` : undefined} title={c ? t('loginTitle', { name: `${c.model.replace(/^ILME-|^ILCE-/, '')}${c.name ? ` ${c.name}` : ''}` }) : ''}>
      {c && (
        <form
          className="login"
          onSubmit={(e) => {
            e.preventDefault()
            if (!user.trim() || !password) return
            onLogin(c, { user: user.trim(), password }, remember)
            setPassword('')
          }}
        >
          {sheet?.kind === 'login' && sheet.wrong && <p className="hint">{t('loginWrong')}</p>}
          <p className="next-text">{t('loginText')}</p>
          <div className="row">
            <input value={user} placeholder={t('sshUser')} autoComplete="username" onChange={(e) => setUser(e.target.value)} aria-label={t('sshUser')} />
            <input value={password} type="password" placeholder={t('sshPassword')} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} aria-label={t('sshPassword')} />
          </div>
          <Chip on={remember} onToggle={setRemember}>
            {t('remember')}
          </Chip>
          <div className="actions">
            <button className="primary big" disabled={!user.trim() || !password}>
              {t('connect')}
            </button>
          </div>
          <h3 className="kicker">{t('noPasswordTitle')}</h3>
          <p className="muted small">{t('noPasswordText')}</p>
        </form>
      )}
    </Sheet>
  )
}
