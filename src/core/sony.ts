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

export const DPC_DateTimeSet = 0xd223 // write-only per libgphoto2

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
    const ext = await call(this.transport, OC_SDIO_GetExtDeviceInfo, [SONY_PROTOCOL_3, 1])
    this.modeVersion = ext && ext.length >= 2 && new Reader(ext).u16() === SONY_PROTOCOL_3 ? 3 : 2
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
  }

  /**
   * Set the camera clock. Sony's Camera Remote SDK documents
   * DateTime_Settings as a 64-bit Unix timestamp; libgphoto2 lists 0xD223 as
   * write-only without a type. We take the type from the camera's own
   * descriptor when it lists the property, else UINT64.
   * `local` sends the wall-clock time as if it were UTC — what a camera
   * without a time-zone menu shows. Which one the FX3 wants is checked on the
   * first body (see README, "Not yet verified").
   */
  async setClock(now: Date, base: ClockBase): Promise<void> {
    const dataType = this.props.get(DPC_DateTimeSet)?.dataType ?? DTC.UINT64
    const seconds = Math.floor(clockSeconds(now, base))
    const value: PropValue = dataType === DTC.STR ? ptpDateString(now, base) : String(seconds)
    await this.set(DPC_DateTimeSet, value, dataType)
  }
}

export function clockSeconds(now: Date, base: ClockBase): number {
  const utc = now.getTime() / 1000
  return base === 'utc' ? utc : utc - now.getTimezoneOffset() * 60
}

/** PTP date string YYYYMMDDThhmmss. */
export function ptpDateString(d: Date, base: ClockBase): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const u = base === 'utc'
  const parts = u
    ? [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    : [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]
  return `${parts[0]}${p(parts[1])}${p(parts[2])}T${p(parts[3])}${p(parts[4])}${p(parts[5])}`
}
