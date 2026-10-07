/** Delete one user base look (0xD0C7 Delete UserBaseLook), then list names.
 *   LZ_FP=… node dist-fake/baselook-delete.mjs <ip> <user> <password> <slot> */
import { createRequire } from 'node:module'
import { call, PtpIpTransport, SonySession, type BytePipe } from '../src/core'
const require = createRequire(import.meta.url)
const { openChannel } = require('../electron/ssh-tunnel.cjs')
const [ip, user, password, slotArg] = process.argv.slice(2)
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
const names = async (s: SonySession) => {
  const d = await call(s.transport, 0x9215, [3])
  const t = Buffer.from(d!).toString('latin1')
  return (t.match(/User\d+:[^\0]*/g) ?? []).join(' | ')
}
const open = async () => pipeFrom((await openChannel({ host: ip, user, password, fingerprint: process.env.LZ_FP, targetPort: 15740 })).stream)
const s = new SonySession(await PtpIpTransport.connect(open, new Uint8Array(16).fill(0x4c), 'LZ Camera Sync'))
await s.open()
await s.readAll()
console.log('before:', await names(s))
const slot = Number(slotArg)
await call(s.transport, 0x9205, [0xd0c7], new Uint8Array([slot & 0xff, slot >> 8]))
await new Promise((r) => setTimeout(r, 1500))
console.log('after: ', await names(s))
await s.close()
process.exit(0)
