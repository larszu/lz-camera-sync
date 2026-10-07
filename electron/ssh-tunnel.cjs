// SSH tunnel to a Sony camera with Access Authentication on.
//
// Sony Camera Control PTP 3 Reference, "Connection by SSH": SSH on port 22,
// user/password from the camera's access-authentication settings, cipher
// aes128-ctr, port forwarding to the camera's localhost:15740, no remote
// commands. With SSH on, port 15740 is closed to the network; PTP/IP runs
// only through the tunnel. The host key is checked against the fingerprint
// the camera shows in its menu.
const crypto = require('node:crypto')

let ssh2 = null
try {
  ssh2 = require('ssh2')
} catch {
  ssh2 = null
}

/** OpenSSH-style SHA256 fingerprint, plus the MD5 hex form some menus show. */
function fingerprints(key) {
  return {
    sha256: 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, ''),
    md5: crypto.createHash('md5').update(key).digest('hex').match(/../g).join(':'),
  }
}

class FingerprintError extends Error {
  constructor(kind, fp) {
    // The renderer only sees the message; keep it machine-readable.
    super(`ssh-fingerprint-${kind} ${fp.sha256} ${fp.md5}`)
  }
}

const clients = new Map() // host -> { client, refs, fp }

// LZ_SSH_PORT: test hook for scripts/fake-camera.ts; a camera always listens on 22.
const SSH_PORT = Number(process.env.LZ_SSH_PORT) || 22

function connectClient({ host, port = SSH_PORT, user, password, fingerprint, timeout = 10000 }) {
  return new Promise((resolve, reject) => {
    if (!ssh2) return reject(new Error('ssh-module-missing'))
    const client = new ssh2.Client()
    let seen = null
    let refused = null
    client
      .on('ready', () => resolve({ client, fp: seen }))
      .on('error', (err) => reject(refused || err))
      .on('keyboard-interactive', (_name, _instr, _lang, prompts, finish) => finish(prompts.map(() => password)))
      .connect({
        host,
        port,
        username: user,
        password,
        tryKeyboard: true,
        readyTimeout: timeout,
        algorithms: { cipher: ['aes128-ctr'] },
        hostVerifier: (key) => {
          seen = fingerprints(key)
          if (!fingerprint) refused = new FingerprintError('unknown', seen)
          else if (fingerprint !== seen.sha256 && fingerprint !== seen.md5) refused = new FingerprintError('mismatch', seen)
          return !refused
        },
      })
  })
}

/**
 * Open one forwarded channel to the camera's PTP/IP port. The command and the
 * event channel share one SSH connection; it closes with its last channel.
 */
async function openChannel(opts) {
  const key = `${opts.user}@${opts.host}:${opts.port || SSH_PORT}`
  let entry = clients.get(key)
  if (!entry) {
    const { client, fp } = await connectClient(opts)
    entry = { client, refs: 0, fp }
    clients.set(key, entry)
    client.on('close', () => clients.delete(key))
  }
  const stream = await new Promise((resolve, reject) =>
    entry.client.forwardOut('127.0.0.1', 0, 'localhost', opts.targetPort || 15740, (err, s) => (err ? reject(err) : resolve(s))),
  )
  entry.refs++
  stream.on('close', () => {
    entry.refs--
    if (entry.refs <= 0) entry.client.end()
  })
  return { stream, fingerprint: entry.fp }
}

module.exports = { openChannel, fingerprints }
