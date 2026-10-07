/**
 * Read a camera's settable values once and store them as a model profile, so
 * setups can be prepared in the app without that camera. Reads only.
 *   LZ_FP=… npm run dump-profile -- <ip> <user> <password> <out.json>
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { profileFrom, PtpIpTransport, SonySession, type BytePipe } from '../src/core'

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
const profile = profileFrom(info.model, info.deviceVersion, await s.readAll())
writeFileSync(out, JSON.stringify(profile, null, 1))
console.log(`${profile.model} fw ${profile.firmware}: ${profile.props.length} properties → ${out}`)
await s.close()
process.exit(0)
