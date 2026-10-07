// Camera logins, encrypted with the operating system's key store (Keychain on
// macOS, DPAPI on Windows, libsecret on Linux) through Electron's safeStorage.
// The file only holds ciphertext; nothing readable leaves the machine.
const fs = require('node:fs')
const path = require('node:path')

function store(app, safeStorage) {
  const file = path.join(app.getPath('userData'), 'camera-logins.bin')
  const read = () => {
    try {
      return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)))
    } catch {
      return {}
    }
  }
  const write = (all) => fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(all)))
  return {
    available: () => safeStorage.isEncryptionAvailable(),
    get: (key) => read()[key] || null,
    set: (key, value) => {
      const all = read()
      all[key] = value
      write(all)
    },
    remove: (key) => {
      const all = read()
      delete all[key]
      write(all)
    },
  }
}

module.exports = { store }
