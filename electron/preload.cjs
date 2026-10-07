// Exposes byte pipes (USB bulk, TCP) to the renderer. All PTP framing lives in
// src/core and is shared with the phone apps.
const { contextBridge, ipcRenderer } = require('electron')

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args)

contextBridge.exposeInMainWorld('lzHost', {
  platform: 'electron',
  usb: {
    list: call('usb:list'),
    open: call('usb:open'),
    write: call('usb:write'),
    read: call('usb:read'),
    close: call('usb:close'),
  },
  discover: call('net:discover'),
  luts: {
    list: call('lut:list'),
    add: call('lut:add'),
    read: call('lut:read'),
    remove: call('lut:remove'),
    reveal: call('lut:reveal'),
  },
  onUpdate: (cb) => ipcRenderer.on('update', (_e, info) => cb(info)),
  installUpdate: call('update:install'),
  logins: {
    get: call('login:get'),
    set: call('login:set'),
    remove: call('login:remove'),
  },
  tcp: {
    open: call('tcp:open'),
    write: call('tcp:write'),
    read: call('tcp:read'),
    close: call('tcp:close'),
  },
})
