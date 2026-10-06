import { useEffect, useRef, useState } from 'react'
import wordmarkLight from './assets/lzm_wortmarke_navy.svg'
import wordmarkDark from './assets/lzm_wortmarke_offwhite.svg'
import { ALL_GROUPS, formatValue, GROUPS, propertyName, reportOk, setupFromSnapshot, snapshotFrom, type ApplyReport, type GroupId } from '../core'
import { addSimulated, backupAll, connectNetwork, disconnect, findUsb, pushGlobal, restoreAll } from './actions'
import { locale, t } from './i18n'
import { exportJson, importJson, newId, update, useStore, type Live, type Persisted } from './store'

const KEY_CODES = GROUPS.flatMap((g) => g.codes)
const time = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : t('never'))

export function App() {
  const { data, live } = useStore()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [withClock, setWithClock] = useState(true)
  const [utc, setUtc] = useState(false)
  const host = window.lzHost
  const activeSetup = data.setups.find((s) => s.id === data.activeSetupId)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setNotice('')
    try {
      await fn()
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const withoutBackup = live.filter((l) => !data.backups[l.serial]).length

  return (
    <div className="app">
      <header className="head">
        <img className="wordmark on-light" src={wordmarkLight} alt="Lars Zumpe" />
        <img className="wordmark on-dark" src={wordmarkDark} alt="Lars Zumpe" />
        <h1>{t('appName')}</h1>
        <ThemeSwitch />
      </header>

      <section className="job">
        <div className="kopf"><span className="kicker">{t('job')}</span></div>
        <div className="steps">
          <button disabled={busy || !live.length} onClick={() => run(backupAll)}>
            <span className="num">1</span>
            {t('stepBackup')}
          </button>
          <button className="primary" disabled={busy || !live.length || !activeSetup} onClick={() => run(() => pushGlobal(withClock, utc))}>
            <span className="num">2</span>
            {t('stepPush')}
            {activeSetup && <small>{activeSetup.name}</small>}
          </button>
          <button disabled={busy || !live.length} onClick={() => run(restoreAll)}>
            <span className="num">3</span>
            {t('stepRestore')}
          </button>
        </div>
        <div className="options">
          <label>
            <input type="checkbox" checked={withClock} onChange={(e) => setWithClock(e.target.checked)} /> {t('withClock')}
          </label>
          <label>
            <input type="checkbox" checked={utc} disabled={!withClock} onChange={(e) => setUtc(e.target.checked)} /> {t('clockUtc')}
          </label>
        </div>
        {withoutBackup > 0 && (
          <p className="hint">
            {withoutBackup} {t('noBackupWarn')}
          </p>
        )}
        {notice && <p className="hint">{notice}</p>}
      </section>

      <main className="cols">
        <section>
          <div className="kopf"><span className="kicker">{t('cameras')}</span></div>
          <Connect busy={busy} run={run} hasHost={!!host} />
          {live.length === 0 && <p className="muted">{t('noCameras')}</p>}
          {live.map((l) => (
            <CameraCard key={l.serial} l={l} data={data} />
          ))}
        </section>

        <aside>
          <Setups data={data} live={live} />
          <Operators data={data} />
          <DataIo />
        </aside>
      </main>
    </div>
  )
}

function Connect({ busy, run, hasHost }: { busy: boolean; run: (fn: () => Promise<unknown>) => void; hasHost: boolean }) {
  const [ip, setIp] = useState('')
  const [msg, setMsg] = useState('')
  return (
    <div className="connect">
      {hasHost ? (
        <>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await findUsb()
                setMsg(r.reason === 'usb-module-missing' ? t('usbMissing') : '')
              })
            }
          >
            {t('searchUsb')}
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (ip) run(() => connectNetwork(ip.trim()))
            }}
          >
            <input value={ip} placeholder={t('ipPlaceholder')} onChange={(e) => setIp(e.target.value)} />
            <button disabled={busy || !ip}>{t('connectNet')}</button>
          </form>
        </>
      ) : (
        <p className="muted">{t('noHost')}</p>
      )}
      <button className="ghost" disabled={busy} onClick={() => run(addSimulated)}>
        {t('addSim')}
      </button>
      {msg && <p className="hint">{msg}</p>}
    </div>
  )
}

function CameraCard({ l, data }: { l: Live; data: Persisted }) {
  const [open, setOpen] = useState(false)
  const cam = data.cameras[l.serial]
  const backup = data.backups[l.serial]
  const setup = data.setups.find((s) => s.id === data.activeSetupId)
  const state = data.states[l.serial]
  const stateText = state === 'global' ? t('stateGlobal') : state === 'restored' ? t('stateRestored') : t('statePrivate')
  const transport = l.transport === 'usb' ? 'USB' : l.transport === 'ptpip' ? 'WLAN' : t('simulated')

  const current = new Map(l.props.map((p) => [p.code, p.current]))
  const priv = new Map(backup?.values.map((v) => [v.code, v.value]))
  const glob = new Map(setup?.values.map((v) => [v.code, v.value]))
  const rows = KEY_CODES.filter((c) => current.has(c))

  const setCam = (patch: Partial<typeof cam>) =>
    update((d) => ({ ...d, cameras: { ...d.cameras, [l.serial]: { ...d.cameras[l.serial], ...patch } } }))

  return (
    <article className={`card${state === 'global' ? ' is-featured' : ''}`} aria-busy={!!l.busy}>
      <div className="card-top">
        <div className="kicker">
          {transport} · {l.serial}
        </div>
        <button className="ghost" onClick={() => disconnect(l.serial)}>
          {t('disconnect')}
        </button>
      </div>
      <input className="label" value={cam?.label ?? ''} onChange={(e) => setCam({ label: e.target.value })} aria-label="Label" />
      <div className="meta">
        <span>{cam?.model}</span>
        <label>
          {t('operator')}{' '}
          <select value={cam?.operatorId ?? ''} onChange={(e) => setCam({ operatorId: e.target.value || undefined })}>
            <option value="">{t('none')}</option>
            {data.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="state">
        <strong>{stateText}</strong>
        <span>
          {t('backedUp')}: {time(backup?.takenAt)}
        </span>
      </div>
      {l.busy && <p className="working">{t('working')}</p>}
      {l.error && <p className="hint">{l.error}</p>}
      {l.report && <Report r={l.report} />}
      <button className="ghost" onClick={() => setOpen(!open)}>
        {open ? '−' : '+'} {t('property')}
      </button>
      {open && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('property')}</th>
              <th>{t('private')}</th>
              <th>{t('current')}</th>
              <th>{t('global')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c}>
                <td>{propertyName(c)}</td>
                <td>{priv.has(c) ? formatValue(c, priv.get(c)!) : '—'}</td>
                <td>{formatValue(c, current.get(c)!)}</td>
                <td>{glob.has(c) ? formatValue(c, glob.get(c)!) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  )
}

function Report({ r }: { r: ApplyReport }) {
  const ok = reportOk(r)
  return (
    <div className={`report ${ok ? 'is-ok' : 'is-warn'}`}>
      <strong className="status">{ok ? t('ok') : t('problems')}</strong> {r.applied.length} {t('applied')} · {r.unchanged} {t('unchanged')}
      {r.clockSet === true && <> · {t('clockOk')}</>}
      {r.clockSet === false && (
        <> · {t('clockFailed')} ({r.clockError})</>
      )}
      {r.skipped.length > 0 && (
        <div className="muted">
          {t('skipped')}: {r.skipped.map((s) => s.name).join(', ')}
        </div>
      )}
      {r.failed.length > 0 && (
        <div>
          {t('failed')}: {r.failed.map((s) => s.name).join(', ')}
        </div>
      )}
      {r.mismatched.length > 0 && (
        <div>
          {t('mismatched')}: {r.mismatched.map((s) => s.name).join(', ')}
        </div>
      )}
    </div>
  )
}

function Setups({ data, live }: { data: Persisted; live: Live[] }) {
  const [source, setSource] = useState('')
  const [name, setName] = useState('')
  const [groups, setGroups] = useState<GroupId[]>(['exposure', 'whiteBalance', 'picture', 'movie'])
  const src = live.find((l) => l.serial === (source || live[0]?.serial))

  function save() {
    if (!src) return
    const snap = { id: newId(), serial: src.serial, model: src.session.info.model, takenAt: new Date().toISOString(), values: snapshotFrom(src.props) }
    const setup = setupFromSnapshot(snap, groups, name || `${data.cameras[src.serial]?.label ?? src.serial} · ${new Date().toLocaleDateString(locale)}`, newId())
    update((d) => ({ ...d, setups: [...d.setups, setup], activeSetupId: setup.id }))
    setName('')
  }

  return (
    <section>
      <div className="kopf"><span className="kicker">{t('setups')}</span></div>
      {data.setups.length === 0 && <p className="muted">{t('noSetup')}</p>}
      <ul className="list">
        {data.setups.map((s) => (
          <li key={s.id}>
            <span>
              {s.name} <small className="muted">({s.values.length})</small>
              {s.id === data.activeSetupId && <em> · {t('active')}</em>}
            </span>
            <span>
              {s.id !== data.activeSetupId && (
                <button className="ghost" onClick={() => update((d) => ({ ...d, activeSetupId: s.id }))}>
                  {t('use')}
                </button>
              )}
              <button className="ghost" onClick={() => update((d) => ({ ...d, setups: d.setups.filter((x) => x.id !== s.id) }))}>
                {t('remove')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {live.length > 0 && (
        <div className="form">
          <label>
            {t('fromCamera')}
            <select value={src?.serial ?? ''} onChange={(e) => setSource(e.target.value)}>
              {live.map((l) => (
                <option key={l.serial} value={l.serial}>
                  {data.cameras[l.serial]?.label ?? l.serial}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>{t('groups')}</legend>
            {ALL_GROUPS.map((g) => (
              <label key={g}>
                <input
                  type="checkbox"
                  checked={groups.includes(g)}
                  onChange={(e) => setGroups(e.target.checked ? [...groups, g] : groups.filter((x) => x !== g))}
                />{' '}
                {t(`group_${g}` as Parameters<typeof t>[0])}
              </label>
            ))}
          </fieldset>
          <input value={name} placeholder={t('setupName')} onChange={(e) => setName(e.target.value)} />
          <button disabled={!src || groups.length === 0} onClick={save}>
            {t('saveSetup')}
          </button>
        </div>
      )}
    </section>
  )
}

function Operators({ data }: { data: Persisted }) {
  const [name, setName] = useState('')
  return (
    <section>
      <div className="kopf"><span className="kicker">{t('operators')}</span></div>
      <ul className="list">
        {data.operators.map((o) => (
          <li key={o.id}>
            <span>{o.name}</span>
            <button className="ghost" onClick={() => update((d) => ({ ...d, operators: d.operators.filter((x) => x.id !== o.id) }))}>
              {t('remove')}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          update((d) => ({ ...d, operators: [...d.operators, { id: newId(), name: name.trim() }] }))
          setName('')
        }}
      >
        <input value={name} placeholder={t('operatorName')} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim()}>{t('addOperator')}</button>
      </form>
    </section>
  )
}

function DataIo() {
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
    <section className="row">
      <button className="ghost" onClick={download}>
        {t('export')}
      </button>
      <button className="ghost" onClick={() => file.current?.click()}>
        {t('import')}
      </button>
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
    </section>
  )
}

type Theme = 'system' | 'light' | 'dark'

function ThemeSwitch() {
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
  return (
    <select className="theme" aria-label={t('theme')} value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
      <option value="system">{t('themeSystem')}</option>
      <option value="light">{t('themeLight')}</option>
      <option value="dark">{t('themeDark')}</option>
    </select>
  )
}
