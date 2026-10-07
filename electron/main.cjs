// Electron main: window plus the two byte pipes the shared core needs.
// USB: libusb through the optional `usb` module (same path as
// lz-camera-bridge). TCP: node:net for PTP/IP.
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron')
const path = require('node:path')
const net = require('node:net')
const { openChannel } = require('./ssh-tunnel.cjs')
const { discover } = require('./discovery.cjs')
const secrets = require('./secrets.cjs')

const SONY_VENDOR_ID = 0x054c
const USB_CLASS_STILL_IMAGE = 6
const BULK_READ_SIZE = 64 * 1024
const TIMEOUT_MS = 5000

let usb = null
try {
  usb = require('usb')
} catch {
  usb = null
}

// ── USB ────────────────────────────────────────────────────────────────

const openUsb = new Map() // id -> { device, iface, epIn, epOut }

function usbId(d) {
  return `usb:${d.busNumber}.${d.deviceAddress}`
}

function readString(device, index) {
  return new Promise((resolve) => {
    if (!index) return resolve('')
    device.getStringDescriptor(index, (err, s) => resolve(err ? '' : s || ''))
  })
}

ipcMain.handle('usb:list', async () => {
  if (!usb) return { devices: [], reason: 'usb-module-missing' }
  const devices = []
  for (const d of usb.getDeviceList()) {
    if (d.deviceDescriptor.idVendor !== SONY_VENDOR_ID) continue
    let model = ''
    let serial = ''
    try {
      d.open()
      model = await readString(d, d.deviceDescriptor.iProduct)
      serial = await readString(d, d.deviceDescriptor.iSerialNumber)
      d.close()
    } catch {
      // Opened by another stack (Sony driver, macOS ptpcamerad) — still list it.
    }
    devices.push({ id: usbId(d), model: model || 'Sony camera', serial, productId: d.deviceDescriptor.idProduct })
  }
  return { devices }
})

ipcMain.handle('usb:open', async (_e, id) => {
  if (!usb) throw new Error('usb-module-missing')
  const device = usb.getDeviceList().find((d) => usbId(d) === id)
  if (!device) throw new Error(`${id} is no longer connected`)
  device.open()
  const iface = device.interfaces.find((i) => i.descriptor.bInterfaceClass === USB_CLASS_STILL_IMAGE) || device.interfaces[0]
  try {
    if (iface.isKernelDriverActive()) iface.detachKernelDriver()
  } catch {
    // not supported on this platform
  }
  iface.claim()
  const epOut = iface.endpoints.find((e) => e.direction === 'out')
  const epIn = iface.endpoints.find((e) => e.direction === 'in' && e.transferType === usb.LIBUSB_TRANSFER_TYPE_BULK)
  if (!epOut || !epIn) throw new Error('PTP bulk endpoints not found')
  epIn.timeout = TIMEOUT_MS
  epOut.timeout = TIMEOUT_MS
  openUsb.set(id, { device, iface, epIn, epOut })
})

ipcMain.handle('usb:write', (_e, id, bytes) => {
  const h = openUsb.get(id)
  if (!h) throw new Error(`${id} not open`)
  return new Promise((resolve, reject) => h.epOut.transfer(Buffer.from(bytes), (err) => (err ? reject(err) : resolve())))
})

ipcMain.handle('usb:read', (_e, id) => {
  const h = openUsb.get(id)
  if (!h) throw new Error(`${id} not open`)
  return new Promise((resolve, reject) =>
    h.epIn.transfer(BULK_READ_SIZE, (err, data) => (err ? reject(err) : resolve(new Uint8Array(data)))),
  )
})

ipcMain.handle('usb:close', async (_e, id) => {
  const h = openUsb.get(id)
  openUsb.delete(id)
  if (!h) return
  await new Promise((resolve) => h.iface.release(true, () => resolve()))
  try {
    h.device.close()
  } catch {
    // already gone
  }
})

// ── TCP (PTP/IP) ───────────────────────────────────────────────────────

const sockets = new Map() // id -> { socket, chunks, waiters, error }
let nextSocket = 1

function track(id, entry, stream) {
  stream.on('data', (buf) => {
    const w = entry.waiters.shift()
    if (w) w.resolve(new Uint8Array(buf))
    else entry.chunks.push(new Uint8Array(buf))
  })
  const fail = (err) => {
    entry.error = err
    for (const w of entry.waiters.splice(0)) w.reject(err)
  }
  stream.on('error', fail)
  stream.on('close', () => fail(new Error('connection closed')))
  sockets.set(id, entry)
}

// opts.ssh = { user, password, fingerprint } when the camera has Access
// Authentication on: PTP/IP then runs through an SSH tunnel (ssh-tunnel.cjs).
ipcMain.handle('tcp:open', async (_e, host, port, opts) => {
  const id = `tcp${nextSocket++}`
  if (opts && opts.ssh) {
    const { stream } = await openChannel({ host, user: opts.ssh.user, password: opts.ssh.password, fingerprint: opts.ssh.fingerprint, targetPort: port })
    const entry = { socket: { write: (b, cb) => stream.write(b, cb), destroy: () => stream.close() }, chunks: [], waiters: [], error: null }
    track(id, entry, stream)
    return id
  }
  return new Promise((resolve, reject) => {
    const entry = { socket: null, chunks: [], waiters: [], error: null }
    const socket = net.createConnection({ host, port, timeout: TIMEOUT_MS }, () => {
      socket.setTimeout(0)
      track(id, entry, socket)
      resolve(id)
    })
    entry.socket = socket
    socket.on('error', reject)
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`${host}:${port} timed out`))
    })
  })
})

ipcMain.handle('tcp:write', (_e, id, bytes) => {
  const s = sockets.get(id)
  if (!s) throw new Error(`${id} not open`)
  return new Promise((resolve, reject) => s.socket.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve())))
})

ipcMain.handle('tcp:read', (_e, id) => {
  const s = sockets.get(id)
  if (!s) throw new Error(`${id} not open`)
  if (s.chunks.length) return s.chunks.shift()
  if (s.error) throw s.error
  return new Promise((resolve, reject) => s.waiters.push({ resolve, reject }))
})

ipcMain.handle('tcp:close', (_e, id) => {
  const s = sockets.get(id)
  sockets.delete(id)
  s?.socket.destroy()
})

// ── Discovery and stored logins ────────────────────────────────────────

ipcMain.handle('net:discover', () => discover())

let logins = null
const loginStore = () => (logins ||= secrets.store(app, safeStorage))
ipcMain.handle('login:get', (_e, key) => (loginStore().available() ? loginStore().get(key) : null))
ipcMain.handle('login:set', (_e, key, value) => {
  if (!loginStore().available()) return false
  loginStore().set(key, value)
  return true
})
ipcMain.handle('login:remove', (_e, key) => loginStore().remove(key))

// ── Updates ────────────────────────────────────────────────────────────
// Releases on GitHub (publish block in electron-builder.js). Windows (NSIS)
// and Linux (AppImage) download and install on restart. macOS installs only
// into apps signed with an Apple developer certificate; this one is signed ad
// hoc, so on a Mac the app announces the new version with a download link.

let updater = null
function checkForUpdates(win) {
  if (!app.isPackaged) return
  try {
    updater = require('electron-updater').autoUpdater
  } catch {
    return
  }
  const canInstall = process.platform !== 'darwin'
  updater.autoDownload = canInstall
  const tell = (state, info) => win.webContents.send('update', { state, version: info && info.version, canInstall })
  updater.on('update-available', (info) => tell('available', info))
  updater.on('update-downloaded', (info) => tell('ready', info))
  updater.on('error', () => {})
  updater.checkForUpdates().catch(() => {})
}
ipcMain.handle('update:install', () => updater && updater.quitAndInstall())

// ── Window ─────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 380,
    backgroundColor: '#132040',
    title: 'LZ Camera Sync',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.LZ_DEV_URL) win.loadURL(process.env.LZ_DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  win.webContents.once('did-finish-load', () => checkForUpdates(win))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
