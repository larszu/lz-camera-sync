/**
 * PTP (ISO 15740) basics — pure, no I/O, no Node Buffer.
 *
 * Runs unchanged in Electron, in the browser and in a Capacitor web view, so
 * the same code serves desktop and phone. Little-endian throughout.
 * Data type codes and the property-value layout follow libgphoto2
 * (camlibs/ptp2/ptp.h, ptp-pack.c).
 */

export const PTP_CONTAINER_COMMAND = 0x0001
export const PTP_CONTAINER_DATA = 0x0002
export const PTP_CONTAINER_RESPONSE = 0x0003
export const PTP_CONTAINER_EVENT = 0x0004
export const PTP_HEADER_LEN = 12

export const PTP_OC_GetDeviceInfo = 0x1001
export const PTP_OC_OpenSession = 0x1002
export const PTP_OC_CloseSession = 0x1003

export const PTP_RC_OK = 0x2001
export const PTP_RC_SessionAlreadyOpen = 0x201e

// Data type codes
export const DTC = {
  INT8: 0x0001,
  UINT8: 0x0002,
  INT16: 0x0003,
  UINT16: 0x0004,
  INT32: 0x0005,
  UINT32: 0x0006,
  INT64: 0x0007,
  UINT64: 0x0008,
  STR: 0xffff,
} as const

export const ARRAY_MASK = 0x4000

/** Property values as JSON-safe data: numbers, 64-bit as decimal string, strings, arrays. */
export type PropValue = number | string | number[]

export const FORM_NONE = 0
export const FORM_RANGE = 1
export const FORM_ENUM = 2

// ── Byte reader / writer ─────────────────────────────────────────────────

export class Reader {
  private view: DataView
  offset: number

  constructor(readonly bytes: Uint8Array, offset = 0) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.offset = offset
  }

  get remaining(): number {
    return this.bytes.length - this.offset
  }

  private need(n: number): void {
    if (this.remaining < n) throw new RangeError(`PTP data short: need ${n}, have ${this.remaining}`)
  }

  u8(): number { this.need(1); return this.view.getUint8(this.offset++) }
  i8(): number { this.need(1); return this.view.getInt8(this.offset++) }
  u16(): number { this.need(2); const v = this.view.getUint16(this.offset, true); this.offset += 2; return v }
  i16(): number { this.need(2); const v = this.view.getInt16(this.offset, true); this.offset += 2; return v }
  u32(): number { this.need(4); const v = this.view.getUint32(this.offset, true); this.offset += 4; return v }
  i32(): number { this.need(4); const v = this.view.getInt32(this.offset, true); this.offset += 4; return v }
  u64(): bigint { this.need(8); const v = this.view.getBigUint64(this.offset, true); this.offset += 8; return v }
  i64(): bigint { this.need(8); const v = this.view.getBigInt64(this.offset, true); this.offset += 8; return v }

  /** PTP string: uint8 length in UCS-2 chars incl. terminator, then UCS-2LE. */
  str(): string {
    const len = this.u8()
    if (len === 0) return ''
    this.need(len * 2)
    let s = ''
    for (let i = 0; i < len; i++) {
      const c = this.view.getUint16(this.offset + i * 2, true)
      if (c === 0) break
      s += String.fromCharCode(c)
    }
    this.offset += len * 2
    return s
  }

  u16Array(): number[] {
    const n = this.u32()
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push(this.u16())
    return out
  }
}

export class Writer {
  private parts: number[] = []

  u8(v: number): this { this.parts.push(v & 0xff); return this }
  u16(v: number): this { return this.u8(v).u8(v >>> 8) }
  u32(v: number): this { return this.u16(v & 0xffff).u16(v >>> 16) }
  u64(v: bigint): this {
    const b = BigInt.asUintN(64, v)
    return this.u32(Number(b & 0xffffffffn)).u32(Number(b >> 32n))
  }

  str(s: string): this {
    if (s.length === 0) return this.u8(0)
    const chars = [...s].slice(0, 254)
    this.u8(chars.length + 1)
    for (const ch of chars) this.u16(ch.charCodeAt(0))
    return this.u16(0)
  }

  bytes(b: Uint8Array): this { for (const x of b) this.parts.push(x); return this }

  toBytes(): Uint8Array { return Uint8Array.from(this.parts) }
}

// ── Property values ──────────────────────────────────────────────────────

export function readValue(r: Reader, type: number): PropValue {
  if (type === DTC.STR) return r.str()
  if (type & ARRAY_MASK) {
    const n = r.u32()
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push(Number(readValue(r, type & ~ARRAY_MASK)))
    return out
  }
  switch (type) {
    case DTC.INT8: return r.i8()
    case DTC.UINT8: return r.u8()
    case DTC.INT16: return r.i16()
    case DTC.UINT16: return r.u16()
    case DTC.INT32: return r.i32()
    case DTC.UINT32: return r.u32()
    case DTC.INT64: return r.i64().toString()
    case DTC.UINT64: return r.u64().toString()
    default: throw new Error(`Unsupported PTP data type 0x${type.toString(16)}`)
  }
}

export function writeValue(w: Writer, type: number, value: PropValue): Writer {
  if (type === DTC.STR) return w.str(String(value))
  if (type & ARRAY_MASK) {
    const arr = Array.isArray(value) ? value : [Number(value)]
    w.u32(arr.length)
    for (const v of arr) writeValue(w, type & ~ARRAY_MASK, v)
    return w
  }
  switch (type) {
    case DTC.INT8:
    case DTC.UINT8: return w.u8(Number(value))
    case DTC.INT16:
    case DTC.UINT16: return w.u16(Number(value))
    case DTC.INT32:
    case DTC.UINT32: return w.u32(Number(value) >>> 0)
    case DTC.INT64:
    case DTC.UINT64: return w.u64(BigInt(value as string | number))
    default: throw new Error(`Unsupported PTP data type 0x${type.toString(16)}`)
  }
}

export function encodeValue(type: number, value: PropValue): Uint8Array {
  return writeValue(new Writer(), type, value).toBytes()
}

export function sameValue(a: PropValue, b: PropValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  return String(a) === String(b)
}

// ── Containers (USB framing; PTP/IP wraps the same fields differently) ───

export interface PtpContainer {
  length: number
  type: number
  code: number
  transactionId: number
  payload: Uint8Array
}

export function packContainer(type: number, code: number, tid: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  return new Writer()
    .u32(PTP_HEADER_LEN + payload.length)
    .u16(type)
    .u16(code)
    .u32(tid)
    .bytes(payload)
    .toBytes()
}

export function packCommand(code: number, tid: number, params: number[] = []): Uint8Array {
  const w = new Writer()
  for (const p of params) w.u32(p >>> 0)
  return packContainer(PTP_CONTAINER_COMMAND, code, tid, w.toBytes())
}

export function parseContainer(buf: Uint8Array): PtpContainer | null {
  if (buf.length < PTP_HEADER_LEN) return null
  const r = new Reader(buf)
  const length = r.u32()
  const type = r.u16()
  const code = r.u16()
  const transactionId = r.u32()
  const end = Math.min(Math.max(length, PTP_HEADER_LEN), buf.length)
  return { length, type, code, transactionId, payload: buf.subarray(PTP_HEADER_LEN, end) }
}

// ── Transport contract ───────────────────────────────────────────────────

export interface PtpResult {
  code: number
  params: number[]
  data?: Uint8Array
}

/**
 * One PTP transaction: command (+ optional data-out) → optional data-in →
 * response. USB, PTP/IP and the simulator each implement this; everything
 * above it (Sony session, sync) is transport-blind.
 */
export interface PtpTransport {
  transaction(opcode: number, params: number[], dataOut?: Uint8Array): Promise<PtpResult>
  close(): Promise<void>
}

export class PtpError extends Error {
  constructor(readonly opcode: number, readonly code: number) {
    super(`PTP 0x${code.toString(16)} on op 0x${opcode.toString(16)}`)
  }
}

export async function call(t: PtpTransport, opcode: number, params: number[] = [], dataOut?: Uint8Array): Promise<Uint8Array | undefined> {
  const res = await t.transaction(opcode, params, dataOut)
  if (res.code !== PTP_RC_OK) throw new PtpError(opcode, res.code)
  return res.data
}

// ── DeviceInfo ───────────────────────────────────────────────────────────

export interface DeviceInfo {
  vendorExtensionId: number
  operations: number[]
  properties: number[]
  manufacturer: string
  model: string
  deviceVersion: string
  serialNumber: string
}

export function parseDeviceInfo(data: Uint8Array): DeviceInfo {
  const r = new Reader(data)
  r.u16() // StandardVersion
  const vendorExtensionId = r.u32()
  r.u16() // VendorExtensionVersion
  r.str() // VendorExtensionDesc
  r.u16() // FunctionalMode
  const operations = r.u16Array()
  r.u16Array() // events
  const properties = r.u16Array()
  r.u16Array() // capture formats
  r.u16Array() // image formats
  return {
    vendorExtensionId,
    operations,
    properties,
    manufacturer: r.str(),
    model: r.str(),
    deviceVersion: r.str(),
    serialNumber: r.str(),
  }
}

export function packDeviceInfo(info: DeviceInfo): Uint8Array {
  const arr = (w: Writer, a: number[]) => { w.u32(a.length); a.forEach((x) => w.u16(x)); return w }
  const w = new Writer().u16(100).u32(info.vendorExtensionId).u16(100).str('').u16(0)
  arr(w, info.operations)
  arr(w, [])
  arr(w, info.properties)
  arr(w, [])
  arr(w, [])
  return w.str(info.manufacturer).str(info.model).str(info.deviceVersion).str(info.serialNumber).toBytes()
}
