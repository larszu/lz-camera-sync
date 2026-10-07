/** Fetch live-view frames and measure the rate. Reads only.
 *   LZ_FP=… node dist-fake/liveview-test.mjs <ip> <user> <password> <out-prefix> */
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
let frames = 0, bytes = 0, misses = 0
const t0 = Date.now()
while (Date.now() - t0 < 5000) {
  const jpg = await s.liveView()
  if (!jpg) { misses++; await new Promise((r) => setTimeout(r, 33)); continue }
  frames++; bytes += jpg.length
  if (frames === 1) writeFileSync(`${out}.jpg`, jpg)
}
const secs = (Date.now() - t0) / 1000
console.log(`${info.model}: ${frames} frames in ${secs.toFixed(1)} s = ${(frames / secs).toFixed(1)} fps, avg ${(bytes / Math.max(1, frames) / 1024).toFixed(0)} KB, misses ${misses}`)
await s.close()
process.exit(0)
