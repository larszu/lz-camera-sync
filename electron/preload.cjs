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
  tcp: {
    open: call('tcp:open'),
    write: call('tcp:write'),
    read: call('tcp:read'),
    close: call('tcp:close'),
  },
})
