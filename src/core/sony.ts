/**
 * Sony PTP vendor extension — the part lz-camera-sync needs: read every
 * property with its current value in one call, write single properties, set
 * the clock.
 *
 * Opcodes, the handshake and the descriptor layout follow libgphoto2
 * (ptp.c `ptp_sony_get_vendorpropcodes`, `_ptp_sony_getalldevicepropdesc`,
 * ptp-pack.c `ptp_unpack_Sony_DPD`). The handshake is the one
 * lz-camera-bridge already runs against FX3 bodies over USB.
 */

import {
  call,
  DTC,
  FORM_ENUM,
  FORM_NONE,
  FORM_RANGE,
  PTP_OC_CloseSession,
  PTP_OC_GetDeviceInfo,
  PTP_OC_OpenSession,
  PTP_RC_OK,
  PTP_RC_SessionAlreadyOpen,
  parseDeviceInfo,
  PtpError,
  Reader,
  readValue,
  encodeValue,
  sameValue,
  Writer,
  writeValue,
  type DeviceInfo,
  type PropValue,
  type PtpTransport,
} from './ptp'
import { PROPERTY_NAMES } from './sony-names'

export const SONY_VENDOR_ID = 0x054c

export const OC_SDIO_Connect = 0x9201
export const OC_SDIO_GetExtDeviceInfo = 0x9202
export const OC_SDIO_SetExtDevicePropValue = 0x9205 // "ControlDeviceA"
export const OC_SDIO_ControlDevice = 0x9207 // "ControlDeviceB", buttons
export const OC_SDIO_GetAllExtDevicePropInfo = 0x9209

export const SONY_PROTOCOL_2 = 0x00c8
export const SONY_PROTOCOL_3 = 0x012c

export const DPC_DateTimeSet = 0xd223 // write-only STR (Sony PTP 3 Reference)
export const DPC_ExposureProgramMode = 0x500e
export const PTP_OC_GetObject = 0x1009
export const LIVEVIEW_HANDLE = 0xffffc002
export const DPC_MovieRecButtonHold = 0xd2c8 // momentary: start/stop movie recording
export const DPC_MovieRecordingState = 0xd21d // read-back: 0 idle, > 0 recording

/** Sony "isEnabled" byte in the descriptor. */
export const ENABLED_GRAYED = 0
export const ENABLED_YES = 1
export const ENABLED_DISPLAY_ONLY = 2

export interface PropDesc {
  code: number
  dataType: number
  /** 1 = settable according to the camera (after libgphoto2's mode rules). */
  writable: boolean
  enabled: number
  current: PropValue
  form: typeof FORM_NONE | typeof FORM_RANGE | typeof FORM_ENUM
  range?: { min: PropValue; max: PropValue; step: PropValue }
  values?: PropValue[]
}

export function propertyName(code: number): string {
  return PROPERTY_NAMES[code] ?? `0x${code.toString(16).toUpperCase()}`
}

/** Momentary controls (buttons) live in 0xD2C0–0xD2FF; they are never synced. */
export function isControl(code: number): boolean {
  return code >= 0xd2c0 && code <= 0xd2ff
}

// ── Descriptor (un)packing ───────────────────────────────────────────────

export function parseSonyDesc(r: Reader, modeVersion: 2 | 3): PropDesc {
  const code = r.u16()
  const dataType = r.u16()
  let getSet = r.u8()
  const enabled = r.u8()

  if (modeVersion === 2) {
    if (getSet & 0x80) getSet = 1
    else if (enabled === ENABLED_YES) getSet = 1
    else if (enabled === ENABLED_GRAYED) getSet = 0
  } else if (enabled !== ENABLED_YES) {
    getSet = 0
  }

  readValue(r, dataType) // factory default, not needed
  const current = readValue(r, dataType)
  const desc: PropDesc = { code, dataType, writable: getSet === 1, enabled, current, form: FORM_NONE }
  if (r.remaining < 1) return desc

  const form = r.u8()
  if (form === FORM_RANGE) {
    desc.form = FORM_RANGE
    desc.range = { min: readValue(r, dataType), max: readValue(r, dataType), step: readValue(r, dataType) }
  } else if (form === FORM_ENUM) {
    desc.form = FORM_ENUM
    desc.values = readEnum(r, dataType)
  }

  // Bodies from 2024 on append a second enum list: the values settable right
  // now. Without it the next two bytes are already the next property code
  // (0x5xxx / 0xDxxx), which is how libgphoto2 tells the two apart.
  if (r.remaining >= 2) {
    const peek = r.bytes[r.offset] | (r.bytes[r.offset + 1] << 8)
    if (peek < 0x200 && desc.form === FORM_ENUM) desc.values = readEnum(r, dataType)
  }
  return desc
}

function readEnum(r: Reader, dataType: number): PropValue[] {
  const n = r.u16()
  const out: PropValue[] = []
  for (let i = 0; i < n; i++) out.push(readValue(r, dataType))
  return out
}

export function parseAllProps(data: Uint8Array, modeVersion: 2 | 3): PropDesc[] {
  const r = new Reader(data, 8) // uint32 count + uint32 zero
  const out: PropDesc[] = []
  while (r.remaining > 0) {
    try {
      out.push(parseSonyDesc(r, modeVersion))
    } catch {
      break // libgphoto2 stops on the first descriptor it cannot read, too
    }
  }
  return out
}

/** Inverse of parseAllProps — used by the simulator and the tests. */
export function packAllProps(props: PropDesc[]): Uint8Array {
  const w = new Writer().u32(props.length).u32(0)
  for (const p of props) {
    w.u16(p.code).u16(p.dataType).u8(p.writable ? 1 : 0).u8(p.enabled)
    writeValue(w, p.dataType, p.current)
    writeValue(w, p.dataType, p.current)
    w.u8(p.form)
    if (p.form === FORM_RANGE && p.range) {
      writeValue(w, p.dataType, p.range.min)
      writeValue(w, p.dataType, p.range.max)
      writeValue(w, p.dataType, p.range.step)
    } else if (p.form === FORM_ENUM && p.values) {
      w.u16(p.values.length)
      for (const v of p.values) writeValue(w, p.dataType, v)
    }
  }
  return w.toBytes()
}

// ── Session ──────────────────────────────────────────────────────────────

export type ClockBase = 'local' | 'utc'

export class SonySession {
  info!: DeviceInfo
  modeVersion: 2 | 3 = 2
  /**
   * Pause after an exposure-mode change. Sony's PTP 3 Reference: "after
   * changing the Exposure Program Mode … send the command after a 500 ms
   * interval", otherwise some models set indeterminate values.
   */
  settleMs = 500
  /**
   * How long to wait for a written value to show up. A real FX3 (fw 7.00)
   * reports the old value for about 250 ms after SetExtDevicePropValue; read
   * too early and a give-back takes the old value for "already right".
   */
  confirmMs = 2000
  private props = new Map<number, PropDesc>()

  constructor(readonly transport: PtpTransport) {}

  /** OpenSession + Sony SDIO handshake (same order as libgphoto2 and lz-camera-bridge). */
  async open(): Promise<DeviceInfo> {
    const res = await this.transport.transaction(PTP_OC_OpenSession, [1])
    if (res.code !== PTP_RC_OK && res.code !== PTP_RC_SessionAlreadyOpen) {
      throw new PtpError(PTP_OC_OpenSession, res.code)
    }
    this.info = parseDeviceInfo((await call(this.transport, PTP_OC_GetDeviceInfo)) ?? new Uint8Array())
    await call(this.transport, OC_SDIO_Connect, [1, 0, 0])
    await call(this.transport, OC_SDIO_Connect, [2, 0, 0])
    // Sony PTP 3 Reference: "When SDIO_GetExtDeviceInfo fails (returned data
    // size is zero), retry until successful." Bounded here so a dead camera
    // still ends in an error instead of a hang.
    let ext: Uint8Array | undefined
    for (let attempt = 0; attempt < 30; attempt++) {
      ext = await call(this.transport, OC_SDIO_GetExtDeviceInfo, [SONY_PROTOCOL_3, 1])
      if (ext && ext.length >= 2) break
      await new Promise((r) => setTimeout(r, 100))
    }
    if (!ext || ext.length < 2) throw new Error('camera did not report its protocol version (SDIO_GetExtDeviceInfo)')
    this.modeVersion = new Reader(ext).u16() === SONY_PROTOCOL_3 ? 3 : 2
    await call(this.transport, OC_SDIO_Connect, [3, 0, 0])
    return this.info
  }

  async close(): Promise<void> {
    try {
      await this.transport.transaction(PTP_OC_CloseSession, [])
    } finally {
      await this.transport.close()
    }
  }

  async readAll(): Promise<PropDesc[]> {
    const data = await call(this.transport, OC_SDIO_GetAllExtDevicePropInfo)
    const list = data ? parseAllProps(data, this.modeVersion) : []
    this.props = new Map(list.map((p) => [p.code, p]))
    return list
  }

  desc(code: number): PropDesc | undefined {
    return this.props.get(code)
  }

  async set(code: number, value: PropValue, dataType = this.props.get(code)?.dataType): Promise<void> {
    if (dataType === undefined) throw new Error(`${propertyName(code)}: unknown data type, read the camera first`)
    await call(this.transport, OC_SDIO_SetExtDevicePropValue, [code], encodeValue(dataType, value))
    if (code !== DPC_DateTimeSet) await this.confirm(code, value)
    if (code === DPC_ExposureProgramMode && this.settleMs > 0) await new Promise((r) => setTimeout(r, this.settleMs))
  }

  /**
   * Press a momentary control (0xD2C0–0xD2FF) through ControlDevice 0x9207:
   * down, hold, up — the same pair libgphoto2 and lz-camera-bridge send.
   */
  async press(code: number, holdMs = 80): Promise<void> {
    const button = (v: number) => encodeValue(DTC.UINT16, v)
    await call(this.transport, OC_SDIO_ControlDevice, [code], button(2))
    await new Promise((r) => setTimeout(r, holdMs))
    await call(this.transport, OC_SDIO_ControlDevice, [code], button(1))
  }

  /**
   * One live-view frame as JPEG (Sony PTP 3 Reference: GetObject on handle
   * 0xFFFFC002 → LiveView Dataset). Undefined while the camera has no frame
   * ready (empty data / Access_Denied) — ask again; at most 30 fps.
   */
  async liveView(): Promise<Uint8Array | undefined> {
    const res = await this.transport.transaction(PTP_OC_GetObject, [LIVEVIEW_HANDLE])
    if (res.code !== PTP_RC_OK || !res.data || res.data.length < 16) return undefined
    const r = new Reader(res.data)
    const offset = r.u32()
    const size = r.u32()
    if (!size || offset + size > res.data.length) return undefined
    return res.data.subarray(offset, offset + size)
  }

  /** Re-read until the camera reports `value` for `code`, or confirmMs passes. */
  async confirm(code: number, value: PropValue): Promise<boolean> {
    const until = Date.now() + this.confirmMs
    for (;;) {
      const now = (await this.readAll()).find((p) => p.code === code)
      if (!now || sameValue(now.current, value)) return true
      if (Date.now() >= until) return false
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  /**
   * Set the camera clock. Sony's Camera Control PTP 3 Reference: 0xD223 is a
   * write-only STR, ISO 8601 "YYYYMMDDThhmmss.s±hhmm", valid from 2016-01-01.
   * Some models cannot take a UTC offset ("set the camera to GMT in the menu
   * beforehand") — that is what base 'utc' is for: it sends +0000.
   */
  async setClock(now: Date, base: ClockBase): Promise<void> {
    await this.set(DPC_DateTimeSet, ptpDateString(now, base), DTC.STR)
  }
}

/** ISO 8601 as Sony documents it for 0xD223: YYYYMMDDThhmmss.s±hhmm. */
export function ptpDateString(d: Date, base: ClockBase): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const u = base === 'utc'
  const parts = u
    ? [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    : [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]
  const tenths = Math.floor(d.getMilliseconds() / 100)
  const offset = u ? 0 : -d.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const zone = `${sign}${p(Math.floor(Math.abs(offset) / 60))}${p(Math.abs(offset) % 60)}`
  return `${parts[0]}${p(parts[1])}${p(parts[2])}T${p(parts[3])}${p(parts[4])}${p(parts[5])}.${tenths}${zone}`
}
