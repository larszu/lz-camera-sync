/**
 * What the native shell gives the shared UI: byte pipes, nothing more.
 * Electron implements it in preload.cjs; a Capacitor plugin implements the
 * same shape on the phone (see docs/mobile.md).
 */
export interface UsbCameraInfo {
  id: string
  model: string
  serial: string
  productId: number
}

export interface SshLogin {
  user: string
  password: string
  /** SHA256:… or MD5 hex, as confirmed against the camera's menu. */
  fingerprint?: string
}

/** A camera that answered the SSDP search (Sony DigitalImaging service). */
export interface FoundCamera {
  ip: string
  /** Device name set in the camera, e.g. "VIN_". */
  name: string
  model: string
  /** Short serial from DigitalImagingDesc.xml — the tail of the PTP serial. */
  serial: string
  firmware: string
  mac: string
  /** Access Authentication on: PTP/IP only through SSH. */
  ssh: boolean
  /** Access Authentication off: the camera asks once to pair. */
  pairing: boolean
  remote: boolean
}

export interface LzHost {
  platform: 'electron' | 'capacitor'
  usb?: {
    list(): Promise<{ devices: UsbCameraInfo[]; reason?: string }>
    open(id: string): Promise<void>
    write(id: string, bytes: Uint8Array): Promise<void>
    read(id: string): Promise<Uint8Array>
    close(id: string): Promise<void>
  }
  /** SSDP search, about 2.5 s. */
  discover?(): Promise<FoundCamera[]>
  /** Logins per camera, encrypted by the OS key store. Never in localStorage. */
  logins?: {
    get(key: string): Promise<{ user: string; password: string } | null>
    set(key: string, value: { user: string; password: string }): Promise<boolean>
    remove(key: string): Promise<void>
  }
  tcp?: {
    /**
     * `ssh` when the camera has Access Authentication on: the channel then
     * runs through an SSH tunnel to the camera's localhost:`port`. Without a
     * confirmed fingerprint it fails with "ssh-fingerprint-unknown <sha256> <md5>".
     */
    open(host: string, port: number, opts?: { ssh?: SshLogin }): Promise<string>
    write(id: string, bytes: Uint8Array): Promise<void>
    read(id: string): Promise<Uint8Array>
    close(id: string): Promise<void>
  }
}

declare global {
  interface Window {
    lzHost?: LzHost
  }
}
