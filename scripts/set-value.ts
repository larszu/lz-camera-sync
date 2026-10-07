/**
 * Set one property and wait until the camera reports it.
 *   LZ_FP=… npm run set-value -- <ip> <user> <password> <code hex> <value>
 */
import { createRequire } from 'node:module'
import { formatValue, PtpIpTransport, sameValue, SonySession, type BytePipe } from '../src/core'

const require = createRequire(import.meta.url)
const { openChannel } = require('../electron/ssh-tunnel.cjs')
const [ip, user, password, codeHex, valueArg] = process.argv.slice(2)
const code = parseInt(codeHex, 16)

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
const s = new SonySession(await PtpIpTransport.connect(open, new Uint8Array(16).fill(0x4c), 'LZ Camera Sync'))
await s.open()
const p = (await s.readAll()).find((x) => x.code === code)!
const value = Number(valueArg)
console.log(`before: ${formatValue(code, p.current)}`)
await s.set(code, value, p.dataType)
const t0 = Date.now()
for (;;) {
  const now = (await s.readAll()).find((x) => x.code === code)!.current
  if (sameValue(now, value)) { console.log(`after: ${formatValue(code, now)} (confirmed after ${Date.now() - t0} ms)`); break }
  if (Date.now() - t0 > 5000) { console.log(`not confirmed after 5 s: ${formatValue(code, now)}`); break }
  await new Promise((r) => setTimeout(r, 50))
}
await s.close()
process.exit(0)
