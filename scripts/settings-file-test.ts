/** Read-only: which file features does the camera offer, and fetch its camera-setting file.
 *   LZ_FP=… node dist-fake/settings-file-test.mjs <ip> <user> <password> <out> */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { PtpIpTransport, SonySession, type BytePipe } from '../src/core'
const require = createRequire(import.meta.url)
const { openChannel } = require('../electron/ssh-tunnel.cjs')
const [ip, user, password, out] = process.argv.slice(2)
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
const info = await s.open()
const props = new Map((await s.readAll()).map((p) => [p.code, p]))
const show = (code: number, name: string) => { const p = props.get(code); console.log(`  0x${code.toString(16)} ${name}: ${p ? `value ${p.current} enabled ${p.enabled}` : 'not listed'}`) }
console.log(info.model, 'fw', info.deviceVersion, 'ops:', info.operations.filter((o) => o >= 0x9200).map((o) => o.toString(16)).join(' '))
show(0xd271, 'Camera-Setting Save enable'); show(0xd272, 'Camera-Setting Read enable'); show(0xd273, 'Save/Read state')
show(0xd057, 'Upload Dataset Version'); show(0xd059, 'BaseLookImport Command Version')
const objInfo = await s.transport.transaction(0x1008, [0xffffc004])
console.log('  GetObjectInfo(0xFFFFC004):', '0x' + objInfo.code.toString(16), objInfo.data?.length ?? 0, 'bytes')
const obj = await s.transport.transaction(0x1009, [0xffffc004])
console.log('  GetObject(0xFFFFC004):', '0x' + obj.code.toString(16), obj.data?.length ?? 0, 'bytes')
if (obj.data?.length) {
  writeFileSync(out, obj.data)
  const text = Buffer.from(obj.data).toString('latin1')
  console.log('  contains "cube"/"LUT":', /\.cube|LUT/i.test(text), '| head:', JSON.stringify(text.slice(0, 48)))
}
await s.close()
process.exit(0)
