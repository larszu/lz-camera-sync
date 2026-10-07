// Finds Sony cameras on the network the way Sony's Camera Control PTP 3
// Reference describes it: SSDP M-SEARCH for
// urn:schemas-sony-com:service:DigitalImaging:1, then dd.xml and
// DigitalImagingDesc.xml for model, serial, firmware and whether the camera
// wants SSH (Access Authentication) or pairing.
const dgram = require('node:dgram')
const os = require('node:os')

const ST = 'urn:schemas-sony-com:service:DigitalImaging:1'

const tag = (xml, name) => (new RegExp(`<${name}>([^<]*)<`).exec(xml) || [])[1]

async function describe(ip, location) {
  const ctl = AbortSignal.timeout(3000)
  const dd = await (await fetch(location, { signal: ctl })).text()
  const scpd = tag(dd, 'SCPDURL') || '/DigitalImagingDesc.xml'
  const desc = await (await fetch(new URL(scpd, location), { signal: AbortSignal.timeout(3000) })).text()
  return {
    ip,
    name: tag(dd, 'friendlyName') || '',
    model: tag(desc, 'X_ModelName') || tag(dd, 'friendlyName') || 'Sony',
    serial: tag(desc, 'X_SerialVersion') || '',
    firmware: tag(desc, 'X_FirmwareVersion') || '',
    mac: tag(desc, 'X_MacAddress') || '',
    ssh: tag(desc, 'X_SSH_Support') === 'Enable',
    pairing: /^(Necessary|Enable)$/.test(tag(desc, 'X_PTP_PairingNecessity') || ''),
    remote: tag(desc, 'X_PTP_RemoteControlSupport') !== 'Disable',
  }
}

/** Every IPv4 address of this machine that can reach a camera. */
function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address)
}

/**
 * Search for `ms` milliseconds on every network interface — the Wi-Fi, a
 * cable, and the Mac's own hotspot (Internet Sharing, bridge100) all count.
 * Resolves with every camera that answered.
 */
function discover(ms = 2500) {
  return new Promise((resolve) => {
    const found = new Map()
    const sockets = []
    const onMessage = (msg, rinfo) => {
      const text = msg.toString()
      if (!text.includes('DigitalImaging')) return
      const loc = (/LOCATION:\s*(\S+)/i.exec(text) || [])[1]
      if (loc && !found.has(rinfo.address)) found.set(rinfo.address, describe(rinfo.address, loc).catch(() => null))
    }
    const q = ['M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"', 'MX: 2', `ST: ${ST}`, '', ''].join('\r\n')
    for (const address of localAddresses()) {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      sockets.push(sock)
      sock.on('message', onMessage)
      sock.on('error', () => {})
      sock.bind(0, address, () => {
        try {
          sock.setMulticastInterface(address)
        } catch {
          // interface without multicast
        }
        for (const d of [0, 400, 1200]) setTimeout(() => sock.send(q, 1900, '239.255.255.250', () => {}), d)
      })
    }
    setTimeout(async () => {
      for (const sock of sockets) {
        try {
          sock.close()
        } catch {
          // already closed
        }
      }
      resolve((await Promise.all(found.values())).filter(Boolean))
    }, ms)
  })
}

module.exports = { discover }
