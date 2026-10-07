// node --test electron/ — the tunnel against a local SSH server that behaves
// like Sony documents it: keyboard-interactive login, aes128-ctr only,
// forwarding to localhost:15740 and nothing else.
const test = require('node:test')
const assert = require('node:assert')
const { Server, utils } = require('ssh2')
const { openChannel, fingerprints } = require('./ssh-tunnel.cjs')

function fakeCamera() {
  const hostKey = utils.generateKeyPairSync('ed25519')
  const pub = utils.parseKey(hostKey.public)
  const fp = fingerprints(pub.getPublicSSH())
  const forwards = []
  const server = new Server({ hostKeys: [hostKey.private], algorithms: { cipher: ['aes128-ctr'] } }, (client) => {
    client
      .on('authentication', (ctx) => {
        if (ctx.method === 'keyboard-interactive') {
          ctx.prompt([{ prompt: 'Password: ', echo: false }], (answers) => (ctx.username === 'cam' && answers[0] === 'secret' ? ctx.accept() : ctx.reject()))
        } else ctx.reject(['keyboard-interactive'])
      })
      .on('ready', () => {
        client.on('tcpip', (accept, reject, info) => {
          forwards.push(`${info.destIP}:${info.destPort}`)
          if (info.destPort !== 15740) return reject()
          // Stand-in for the camera's PTP/IP port: echo with a prefix.
          const ch = accept()
          ch.on('data', (d) => ch.write(Buffer.concat([Buffer.from('ptp:'), d])))
        })
      })
      .on('error', () => {})
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, fp, forwards })))
}

test('first contact refuses and names the fingerprint to compare', async () => {
  const cam = await fakeCamera()
  await assert.rejects(openChannel({ host: '127.0.0.1', port: cam.port, user: 'cam', password: 'secret' }), (e) => e.message.startsWith(`ssh-fingerprint-unknown ${cam.fp.sha256}`))
  cam.server.close()
})

test('a changed host key is refused', async () => {
  const cam = await fakeCamera()
  await assert.rejects(openChannel({ host: '127.0.0.1', port: cam.port, user: 'cam', password: 'secret', fingerprint: 'SHA256:not-this-one' }), /ssh-fingerprint-mismatch/)
  cam.server.close()
})

test('wrong password is refused', async () => {
  const cam = await fakeCamera()
  await assert.rejects(openChannel({ host: '127.0.0.1', port: cam.port, user: 'cam', password: 'nope', fingerprint: cam.fp.sha256 }))
  cam.server.close()
})

test('with the confirmed fingerprint, two channels reach port 15740 over one login', async () => {
  const cam = await fakeCamera()
  const opts = { host: '127.0.0.1', port: cam.port, user: 'cam', password: 'secret', fingerprint: cam.fp.sha256 }
  const a = await openChannel(opts)
  const b = await openChannel(opts)
  const echo = (s, msg) => new Promise((resolve) => { s.once('data', (d) => resolve(String(d))); s.write(msg) })
  assert.strictEqual(await echo(a.stream, 'cmd'), 'ptp:cmd')
  assert.strictEqual(await echo(b.stream, 'evt'), 'ptp:evt')
  assert.deepStrictEqual(cam.forwards, ['localhost:15740', 'localhost:15740'])
  assert.strictEqual(a.fingerprint.sha256, cam.fp.sha256)
  a.stream.close()
  b.stream.close()
  cam.server.close()
})
