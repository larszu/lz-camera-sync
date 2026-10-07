/** Connecting cameras and running the three job steps across all of them. */

import {
  apply,
  setupFromSnapshot,
  snapshotFrom,
  type GlobalSetup,
  PTPIP_PORT,
  PtpIpTransport,
  PtpUsbTransport,
  SimulatedCamera,
  SonySession,
  takeSnapshot,
  type BytePipe,
  type PtpTransport,
} from '../core'
import { t } from './i18n'
import { getData, getLive, newId, patchLive, setLive, update, type CameraState, type Live } from './store'

const host = () => (typeof window !== 'undefined' ? window.lzHost : undefined)

/** "FX3 A", "FX3 B" … — operators rename them, but three identical names are useless. */
function defaultLabel(model: string, known: number): string {
  return `${model.replace(/^ILME-|^ILCE-/, '')} ${String.fromCharCode(65 + (known % 26))}`
}

async function attach(transport: PtpTransport, kind: Live['transport'], address: string): Promise<void> {
  const session = new SonySession(transport)
  const info = await session.open()
  const props = await session.readAll()
  const serial = info.serialNumber || address
  update((d) => ({
    ...d,
    cameras: {
      ...d.cameras,
      [serial]: d.cameras[serial] ?? { serial, model: info.model, label: defaultLabel(info.model, Object.keys(d.cameras).length) },
    },
  }))
  setLive((l) => [...l.filter((x) => x.serial !== serial), { serial, transport: kind, address, session, props }])
}

export const hasHost = () => !!host()

export async function findUsb(): Promise<{ found: number; reason?: string }> {
  const usb = host()?.usb
  if (!usb) return { found: 0, reason: 'no-host' }
  const { devices, reason } = await usb.list()
  for (const dev of devices) {
    await usb.open(dev.id)
    const pipe: BytePipe = {
      write: (b) => usb.write(dev.id, b),
      read: () => usb.read(dev.id),
      close: () => usb.close(dev.id),
    }
    await attach(new PtpUsbTransport(pipe), 'usb', dev.id)
  }
  return { found: devices.length, reason }
}

export interface WifiLogin {
  user: string
  password: string
}

/** The camera's SSH host key is not confirmed yet, or it changed. */
export class FingerprintNeeded extends Error {
  constructor(
    readonly ip: string,
    readonly kind: 'unknown' | 'mismatch',
    readonly sha256: string,
    readonly md5: string,
  ) {
    super(`fingerprint ${kind}`)
  }
}

export function confirmFingerprint(ip: string, sha256: string): void {
  update((d) => ({ ...d, hosts: { ...d.hosts, [ip]: { ...d.hosts[ip], fingerprint: sha256 } } }))
}

/**
 * PTP/IP to a camera on the network. With `login` (Access Authentication on)
 * both channels run through an SSH tunnel; without it the camera may ask on
 * its screen to pair with "LZ Camera Sync".
 */
/** Does anything accept a TCP connection on ip:port? */
async function answers(ip: string, port: number): Promise<boolean> {
  const tcp = host()?.tcp
  if (!tcp) return false
  try {
    const id = await tcp.open(ip, port)
    await tcp.close(id)
    return true
  } catch {
    return false
  }
}

export async function connectNetwork(ip: string, login?: WifiLogin): Promise<void> {
  const tcp = host()?.tcp
  if (!tcp) throw new Error('no-host')
  const known = getData().hosts[ip]
  const ssh = login ? { user: login.user, password: login.password, fingerprint: known?.fingerprint } : undefined
  const open = async (): Promise<BytePipe> => {
    const id = await tcp.open(ip, PTPIP_PORT, ssh ? { ssh } : undefined)
    return { write: (b) => tcp.write(id, b), read: () => tcp.read(id), close: () => tcp.close(id) }
  }
  const guidHex = getData().guid
  const guid = Uint8Array.from(guidHex.match(/../g)!.map((h) => parseInt(h, 16)))
  let transport: PtpIpTransport
  try {
    transport = await PtpIpTransport.connect(open, guid, 'LZ Camera Sync')
  } catch (e) {
    const msg = (e as Error).message
    const fp = /ssh-fingerprint-(unknown|mismatch) (\S+) (\S+)/.exec(msg)
    if (fp) throw new FingerprintNeeded(ip, fp[1] as 'unknown' | 'mismatch', fp[2], fp[3])
    if (/authentication methods failed|auth/i.test(msg) && login) throw new Error(t('sshAuthFailed', { ip }))
    if (/ssh-module-missing/.test(msg)) throw new Error(t('sshMissing'))
    if (/timed out|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|closed|Timed out/i.test(msg)) {
      // Tell the operator which way the camera is set up: with Access
      // Authentication only SSH (22) answers, without it only PTP/IP (15740).
      const other = login ? PTPIP_PORT : 22
      if (await answers(ip, other)) throw new Error(t(login ? 'wifiNoAuth' : 'wifiNeedsAuth', { ip }))
      throw new Error(t('wifiUnreachable', { ip }))
    }
    throw e
  }
  if (login) update((d) => ({ ...d, hosts: { ...d.hosts, [ip]: { ...d.hosts[ip], user: login.user } } }))
  await attach(transport, 'ptpip', ip)
}

let simCount = 0
const SIM_LOOKS: Record<number, number>[] = [
  { 0xd23f: 8, 0xd20f: 5600 },
  { 0xd23f: 2, 0xd20f: 4300, 0xd20d: (1 << 16) | 100 },
  // In Movie P: its manual values sit behind Movie M (see sync.readBehindMode).
  { 0xd23f: 11, 0xd21e: 3200, 0x500e: 0x00078050 },
  { 0xd23f: 7, 0x5005: 0x0002 },
]

export async function addSimulated(): Promise<void> {
  simCount++
  const cam = new SimulatedCamera({ serial: `SIM-${String(simCount).padStart(3, '0')}`, overrides: SIM_LOOKS[(simCount - 1) % SIM_LOOKS.length], latencyMs: 60 + 40 * ((simCount - 1) % 3) })
  await attach(cam, 'sim', `sim${simCount}`)
}

export async function disconnect(serial: string): Promise<void> {
  const l = getLive().find((x) => x.serial === serial)
  setLive((all) => all.filter((x) => x.serial !== serial))
  await l?.session.close().catch(() => undefined)
}

// ── Job steps ────────────────────────────────────────────────────────────
// Each step touches only the cameras that still need it: backing up a camera
// that already carries the global setup would overwrite its private backup.

/** `fn` returns the state the camera reaches; it is recorded only once the camera is idle again. */
async function eachCamera(serials: string[], label: string, fn: (l: Live) => Promise<{ state: CameraState; patch?: Partial<Live> }>) {
  const targets = getLive().filter((l) => serials.includes(l.serial))
  await Promise.all(
    targets.map(async (l) => {
      patchLive(l.serial, { busy: label, error: undefined, progress: undefined })
      try {
        const { state, patch = {} } = await fn(l)
        const props = await l.session.readAll()
        const written = (l.written ?? 0) + (patch.report?.applied.length ?? 0)
        patchLive(l.serial, { ...patch, props, written, busy: undefined, progress: undefined })
        setState(l.serial, state)
      } catch (e) {
        patchLive(l.serial, { busy: undefined, progress: undefined, error: (e as Error).message })
      }
    }),
  )
}

const progress = (serial: string) => (done: number, total: number) => patchLive(serial, { progress: { done, total } })

function setState(serial: string, s: CameraState) {
  update((d) => ({ ...d, states: { ...d.states, [serial]: s } }))
}

export function backup(serials: string[]): Promise<void> {
  return eachCamera(serials, 'backup', async (l) => {
    const op = getData().cameras[l.serial]?.operatorId
    const snap = await takeSnapshot(l.session, op, newId())
    update((d) => ({ ...d, backups: { ...d.backups, [l.serial]: snap } }))
    return { state: 'private', patch: { report: undefined } }
  })
}

/** Turn the template camera's current settings into a saved global setup and make it active. */
export function setupFromCamera(serial: string): GlobalSetup | undefined {
  const l = getLive().find((x) => x.serial === serial)
  if (!l) return undefined
  const d = getData()
  const snap = { id: newId(), serial, model: l.session.info.model, takenAt: new Date().toISOString(), values: snapshotFrom(l.props) }
  const label = d.cameras[serial]?.label ?? serial
  const setup = setupFromSnapshot(snap, d.groups, `${label} · ${new Date().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`, newId())
  update((x) => ({ ...x, setups: [setup, ...x.setups].slice(0, 20), activeSetupId: setup.id }))
  return setup
}

export function push(serials: string[], setup: GlobalSetup): Promise<void> {
  const { withClock, clockUtc } = getData()
  return eachCamera(serials, 'push', async (l) => {
    const report = await apply(l.session, setup.values, {
      clock: withClock ? { now: () => new Date(), base: clockUtc ? 'utc' : 'local' } : undefined,
      onProgress: progress(l.serial),
    })
    return { state: 'global', patch: { report, clockSet: report.clockSet === true } }
  })
}

export function restore(serials: string[]): Promise<void> {
  return eachCamera(serials, 'restore', async (l) => {
    const snap = getData().backups[l.serial]
    if (!snap) throw new Error('no private backup for this camera')
    const report = await apply(l.session, snap.values, { onProgress: progress(l.serial) })
    return { state: 'restored', patch: { report } }
  })
}

/** Start over with the connected cameras; private backups stay. */
export function newJob(): void {
  update((d) => ({ ...d, states: {} }))
  setLive((all) => all.map((l) => ({ ...l, report: undefined, error: undefined, written: 0, clockSet: false })))
}
