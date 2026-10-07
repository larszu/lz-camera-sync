/**
 * Read-only check against a real camera: connect, read every setting, print.
 * Writes nothing.
 *
 *   npm run probe -- <ip> [user] [password]
 *
 * With user/password the connection runs through the SSH tunnel (Access
 * Authentication on). The camera's fingerprint is printed; pass it as
 * LZ_FP=SHA256:… to confirm it.
 */
import { createRequire } from 'node:module'
import { formatValue, groupOf, propertyName, PtpIpTransport, SonySession, type BytePipe } from '../src/core'

const require = createRequire(import.meta.url)
const net = require('node:net') as typeof import('node:net')
const { openChannel } = require(new URL('../electron/ssh-tunnel.cjs', import.meta.url).pathname)

const [ip, user, password] = process.argv.slice(2)
if (!ip) {
  console.error('usage: npm run probe -- <ip> [user] [password]')
  process.exit(2)
}

function pipeFrom(stream: { write(b: Uint8Array, cb?: (e?: Error) => void): unknown; on(ev: string, cb: (x: any) => void): unknown; end?(): unknown; destroy?(): unknown }): BytePipe {
  const chunks: Uint8Array[] = []
  const waiters: ((b: Uint8Array) => void)[] = []
  stream.on('data', (b: Uint8Array) => (waiters.length ? waiters.shift()!(new Uint8Array(b)) : chunks.push(new Uint8Array(b))))
  return {
    write: (b) => new Promise((res, rej) => stream.write(b, (e) => (e ? rej(e) : res()))),
    read: () => (chunks.length ? Promise.resolve(chunks.shift()!) : new Promise((r) => waiters.push(r))),
    close: async () => void (stream.end ?? stream.destroy)?.call(stream),
  }
}

async function open(): Promise<BytePipe> {
  if (user) {
    const { stream } = await openChannel({ host: ip, user, password, fingerprint: process.env.LZ_FP, targetPort: 15740 })
    return pipeFrom(stream)
  }
  const socket = net.createConnection({ host: ip, port: 15740 })
  await new Promise<void>((res, rej) => socket.once('connect', () => res()).once('error', rej))
  return pipeFrom(socket)
}

const t0 = Date.now()
try {
  const transport = await PtpIpTransport.connect(open, new Uint8Array(16).fill(0x4c), 'LZ Camera Sync')
  const s = new SonySession(transport)
  const info = await s.open()
  console.log(`connected in ${Date.now() - t0} ms`)
  console.log(`model ${info.model} · serial ${info.serialNumber} · firmware ${info.deviceVersion} · protocol mode ${s.modeVersion}`)
  const props = await s.readAll()
  const writable = props.filter((p) => p.writable)
  console.log(`${props.length} properties, ${writable.length} writable`)
  const dt = props.find((p) => p.code === 0xd223)
  console.log(`DateTimeSet 0xD223: ${dt ? `listed, type 0x${dt.dataType.toString(16)}, writable ${dt.writable}` : 'not listed'}`)
  for (const p of props.filter((p) => groupOf(p.code) !== 'other')) {
    console.log(`  ${propertyName(p.code).padEnd(24)} ${formatValue(p.code, p.current).padEnd(14)} ${p.writable ? 'rw' : 'ro'}  type 0x${p.dataType.toString(16)}${p.values ? `  ${p.values.length} values` : ''}`)
  }
  await s.close()
  process.exit(0)
} catch (e) {
  console.error('failed:', (e as Error).message)
  process.exit(1)
}
