/**
 * A simulated FX3 on the network, for trying the Wi-Fi path without a camera.
 *
 *   npm run fake-camera                  # PTP/IP on :15740, pairing style
 *   npm run fake-camera -- --ssh 2222    # Access Authentication: SSH on :2222
 *                                        # user "camera", password "camera"
 *
 * With --ssh, PTP/IP is only reachable through the tunnel, as Sony
 * documents it. Point the app there with LZ_SSH_PORT=2222.
 */
import net from 'node:net'
import ssh2 from 'ssh2'
import { PtpIpResponder } from '../src/core/ptpip-responder'
import { SimulatedCamera } from '../src/core/simulator'

const { Server, utils } = ssh2

const sshArg = process.argv.indexOf('--ssh')
const sshPort = sshArg > 0 ? Number(process.argv[sshArg + 1] ?? 2222) : 0
const cam = new SimulatedCamera({ serial: 'NET-FX3', overrides: { 0x500e: 0x00078050, 0xd23f: 4 }, latencyMs: 20 })

function serve(socket: { write(b: Uint8Array): unknown; on(ev: 'data', cb: (b: Uint8Array) => void): unknown }) {
  const responder = new PtpIpResponder(cam, (b) => socket.write(b))
  socket.on('data', (b) => responder.push(new Uint8Array(b)))
}

if (sshPort) {
  const hostKey = utils.generateKeyPairSync('ed25519')
  new Server({ hostKeys: [hostKey.private], algorithms: { cipher: ['aes128-ctr'] } }, (client) => {
    client
      .on('authentication', (ctx) => {
        if (ctx.method !== 'keyboard-interactive') return ctx.reject(['keyboard-interactive'])
        ctx.prompt([{ prompt: 'Password: ', echo: false }], (a) => (ctx.username === 'camera' && a[0] === 'camera' ? ctx.accept() : ctx.reject()))
      })
      .on('ready', () => client.on('tcpip', (accept, reject, info) => (info.destPort === 15740 ? serve(accept()) : reject())))
      .on('error', () => {})
  }).listen(sshPort, '127.0.0.1', () => console.log(`fake FX3: SSH on 127.0.0.1:${sshPort} (camera/camera)`))
} else {
  net.createServer(serve).listen(15740, '127.0.0.1', () => console.log('fake FX3: PTP/IP on 127.0.0.1:15740'))
}
