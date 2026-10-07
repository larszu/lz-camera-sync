/**
 * Write test against a real camera — changes the camera for a moment and
 * puts it back. Run only when the camera is not recording.
 *
 *   LZ_FP=SHA256:… npm run write-test -- <ip> <user> <password>
 *
 * 1. clock: set to this computer's time (local, with offset)
 * 2. one value there and back: colour temperature +100 K, then back
 * 3. a whole job on one body: back up → align (colour temperature and
 *    shutter changed) → give back, then compare every writable value with
 *    the backup
 */
import { createRequire } from 'node:module'
import { apply, formatValue, propertyName, ptpDateString, PtpIpTransport, reportOk, sameValue, SonySession, takeSnapshot, type BytePipe, type StoredValue } from '../src/core'

const require = createRequire(import.meta.url)
const { openChannel } = require('../electron/ssh-tunnel.cjs')
const [ip, user, password] = process.argv.slice(2)

function pipeFrom(stream: any): BytePipe {
  const chunks: Uint8Array[] = []
  const waiters: ((b: Uint8Array) => void)[] = []
  stream.on('data', (b: Uint8Array) => (waiters.length ? waiters.shift()!(new Uint8Array(b)) : chunks.push(new Uint8Array(b))))
  return {
    write: (b) => new Promise((res, rej) => stream.write(b, (e?: Error) => (e ? rej(e) : res()))),
    read: () => (chunks.length ? Promise.resolve(chunks.shift()!) : new Promise((r) => waiters.push(r))),
    close: async () => void stream.end(),
  }
}
const open = async () => pipeFrom((await openChannel({ host: ip, user, password, fingerprint: process.env.LZ_FP, targetPort: 15740 })).stream)
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 23), ...a)

const s = new SonySession(await PtpIpTransport.connect(open, new Uint8Array(16).fill(0x4c), 'LZ Camera Sync'))
const info = await s.open()
log(`connected: ${info.model} fw ${info.deviceVersion}`)

// 1 · clock
const now = new Date()
await s.setClock(now, 'local')
log(`1 clock set: ${ptpDateString(now, 'local')} — check the camera display`)

// 2 · one value there and back
let props = await s.readAll()
const ct = props.find((p) => p.code === 0xd20f)!
const before = Number(ct.current)
const there = before + 100 <= Number(ct.range?.max ?? 9900) ? before + 100 : before - 100
await s.set(0xd20f, there)
props = await s.readAll()
log(`2 colour temp ${before} → ${there}: camera reports ${props.find((p) => p.code === 0xd20f)!.current}`)
await s.set(0xd20f, before)
props = await s.readAll()
log(`2 back to ${before}: camera reports ${props.find((p) => p.code === 0xd20f)!.current}`)

// 3 · whole job on one body
const t0 = Date.now()
const backup = await takeSnapshot(s, undefined, 'write-test')
const behind = backup.values.filter((v) => v.mode !== undefined).length
log(`3 backup: ${backup.values.length} values (${behind} behind the mode) in ${Date.now() - t0} ms`)
const shutter = props.find((p) => p.code === 0xd20d)!
const otherShutter = shutter.values!.find((v) => !sameValue(v, shutter.current))!
const global: StoredValue[] = [
  { code: 0xd20f, dataType: ct.dataType, value: 6500 },
  { code: 0xd20d, dataType: shutter.dataType, value: otherShutter },
]
const r1 = await apply(s, global, { clock: { now: () => new Date(), base: 'local' } })
log(`3 align: ok=${reportOk(r1)} written=${r1.applied.length} failed=${r1.failed.map((f) => `${f.name}: ${f.error}`).join('; ') || '-'} mismatched=${r1.mismatched.length} clock=${r1.clockSet}`)
props = await s.readAll()
log(`3 now: colour temp ${formatValue(0xd20f, props.find((p) => p.code === 0xd20f)!.current)}, shutter ${formatValue(0xd20d, props.find((p) => p.code === 0xd20d)!.current)}`)
const t1 = Date.now()
const r2 = await apply(s, backup.values)
log(`3 give back: ok=${reportOk(r2)} written=${r2.applied.length} unchanged=${r2.unchanged} skipped=${r2.skipped.length} failed=${r2.failed.length} mismatched=${r2.mismatched.length} viaMode=${r2.viaMode} in ${Date.now() - t1} ms`)
for (const f of r2.failed) log(`   failed ${f.name}: ${f.error}`)
for (const m of r2.mismatched) log(`   mismatched ${m.name}: want ${m.want} have ${m.have}`)

const after = new Map((await s.readAll()).map((p) => [p.code, p]))
const diff = backup.values.filter((v) => v.mode === undefined && after.has(v.code) && !sameValue(after.get(v.code)!.current, v.value))
log(`3 compare with backup: ${diff.length === 0 ? 'identical' : `${diff.length} differ`}`)
for (const d of diff) log(`   ${propertyName(d.code)}: backup ${formatValue(d.code, d.value)} now ${formatValue(d.code, after.get(d.code)!.current)}`)
await s.close()
process.exit(diff.length === 0 && reportOk(r2) ? 0 : 1)
