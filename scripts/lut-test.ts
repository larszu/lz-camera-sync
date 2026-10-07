/** Import one .cube into a user slot on a real camera.
 *   LZ_FP=… node dist-fake/lut-test.mjs <ip> <user> <password> <file.cube> <slot> */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { PtpIpTransport, SonySession, type BytePipe } from '../src/core'
const require = createRequire(import.meta.url)
const { openChannel } = require('../electron/ssh-tunnel.cjs')
const [ip, user, password, file, slotArg] = process.argv.slice(2)
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
await s.readAll()
console.log(info.model, 'fw', info.deviceVersion, 'LUT import supported:', s.canImportLut())
const t0 = Date.now()
try {
  await s.importLut(basename(file), new Uint8Array(readFileSync(file)), Number(slotArg))
  console.log(`imported ${basename(file)} into User${slotArg} in ${Date.now() - t0} ms`)
} catch (e) {
  console.log('import failed:', (e as Error).message)
}
await s.close()
process.exit(0)
