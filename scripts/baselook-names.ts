/** Read-only: the camera's base-look names (SDIO_GetDisplayStringList, type 3).
 *   LZ_FP=… node dist-fake/baselook-names.mjs <ip> <user> <password> */
import { createRequire } from 'node:module'
import { PtpIpTransport, SonySession, type BytePipe } from '../src/core'
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
const s = new SonySession(await PtpIpTransport.connect(open, new Uint8Array(16).fill(0x4c), 'LZ Camera Sync'))
await s.open()
const props = new Map((await s.readAll()).map((p) => [p.code, p]))
for (const c of [0xd03c, 0xd08b, 0xd0c7, 0xd0c8, 0xd264]) { const p = props.get(c); console.log(`0x${c.toString(16)}: ${p ? `cur ${p.current} enabled ${p.enabled} writable ${p.writable} values ${JSON.stringify(p.values ?? [])}` : 'not listed'}`) }
const r = await s.transport.transaction(0x9215, [3])
console.log('GetDisplayStringList(3):', '0x' + r.code.toString(16), r.data?.length ?? 0, 'bytes')
if (r.data) {
  const dv = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength)
  const off = dv.getUint32(0, true), size = dv.getUint32(4, true)
  const bin = r.data.subarray(off, off + size)
  console.log('hex head:', Buffer.from(bin.subarray(0, 96)).toString('hex'))
  console.log('text:', JSON.stringify(Buffer.from(bin).toString('utf16le').replace(/\0+/g, ' | ')).slice(0, 1500))
  console.log('ascii:', JSON.stringify(Buffer.from(bin).toString('latin1').replace(/[^\x20-\x7e]+/g, ' | ')).slice(0, 1500))
}
await s.close()
process.exit(0)
