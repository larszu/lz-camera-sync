/**
 * A simulated FX3 at the PTP transaction level — for the tests and for
 * working on the UI without a camera on the desk. It is labelled as a
 * simulator everywhere it shows up; it never poses as a found camera.
 *
 * It speaks the same bytes a real body sends (DeviceInfo, the 0x9209 dump,
 * 0x9205 writes) and models one real dependency: shutter, ISO and aperture
 * are only writable in a manual exposure mode.
 */

import {
  DTC,
  FORM_ENUM,
  FORM_NONE,
  FORM_RANGE,
  packDeviceInfo,
  PTP_OC_CloseSession,
  PTP_OC_GetDeviceInfo,
  PTP_OC_OpenSession,
  PTP_RC_OK,
  Reader,
  readValue,
  Writer,
  type PropValue,
  type PtpResult,
  type PtpTransport,
} from './ptp'
import {
  DPC_DateTimeSet,
  ENABLED_GRAYED,
  ENABLED_YES,
  OC_SDIO_Connect,
  OC_SDIO_GetAllExtDevicePropInfo,
  OC_SDIO_GetExtDeviceInfo,
  OC_SDIO_SetExtDevicePropValue,
  packAllProps,
  SONY_PROTOCOL_3,
  type PropDesc,
} from './sony'

const RC_GeneralError = 0x2002
const RC_InvalidDevicePropValue = 0x201c
const RC_AccessDenied = 0x200f

const SS = (num: number, den: number) => ((num << 16) | den) >>> 0
// Low halves of the M modes (Sony Camera Control PTP 3 Reference, 0x500E).
const MANUAL = new Set([0x0001, 0x8053, 0x805c, 0x8083, 0x8087, 0x8096])
const RC_DeviceBusy = 0x2019
const NEEDS_MANUAL = new Set([0xd20d, 0xd21e, 0x5007])

function fx3Props(): PropDesc[] {
  const e = (code: number, dataType: number, current: PropValue, values: PropValue[]): PropDesc => ({
    code, dataType, writable: true, enabled: ENABLED_YES, current, form: FORM_ENUM, values,
  })
  return [
    e(0x500e, DTC.UINT32, 0x00078053, [0x00000001, 0x00010002, 0x00020003, 0x00030004, 0x00078050, 0x00078051, 0x00078052, 0x00078053, 0x00078090]),
    e(0x5007, DTC.UINT16, 280, [140, 180, 200, 280, 400, 560, 800, 1100]),
    e(0xd20d, DTC.UINT32, SS(1, 50), [SS(1, 25), SS(1, 48), SS(1, 50), SS(1, 60), SS(1, 100), SS(1, 125), SS(1, 250)]),
    e(0xd21e, DTC.UINT32, 800, [0xffffff, 80, 100, 200, 400, 640, 800, 1600, 3200, 6400, 12800]),
    e(0x5005, DTC.UINT16, 0x8012, [0x0002, 0x0004, 0x8011, 0x8010, 0x0006, 0x8012, 0x8020]),
    { code: 0xd20f, dataType: DTC.UINT16, writable: true, enabled: ENABLED_YES, current: 5600, form: FORM_RANGE, range: { min: 2500, max: 9900, step: 100 } },
    e(0xd23f, DTC.UINT8, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    e(0xd241, DTC.UINT8, 3, [1, 2, 3, 4]),
    e(0xd242, DTC.UINT16, 0x0121, [0x0101, 0x0111, 0x0121, 0x0131]),
    e(0x500a, DTC.UINT16, 0x0001, [0x0001, 0x0002, 0x8004]),
    e(0xd0d9, DTC.UINT8, 1, [1, 2]),
    { code: 0xd218, dataType: DTC.INT8, writable: false, enabled: ENABLED_GRAYED, current: 76, form: FORM_NONE },
    { code: 0xd214, dataType: DTC.UINT32, writable: true, enabled: ENABLED_YES, current: 35_000_000, form: FORM_NONE },
  ]
}

export interface SimOptions {
  serial: string
  model?: string
  /** Overrides applied on top of the factory list, e.g. an operator's own look. */
  overrides?: Record<number, PropValue>
  /** Refuse the clock write — to exercise that branch. */
  rejectClock?: boolean
  /** Answer SDIO_GetExtDeviceInfo with no data this many times first (Sony: retry). */
  extInfoEmptyTimes?: number
  /** Delay per transaction, so a UI demo shows progress like a real bus. */
  latencyMs?: number
  /** Refuse exposure values this soon after a mode change (Sony asks for 500 ms). */
  modeSettleMs?: number
}

export class SimulatedCamera implements PtpTransport {
  readonly props = new Map<number, PropDesc>()
  clock?: { dataType: number; value: PropValue }
  sessionOpen = false
  writes = 0
  private modeChangedAt = 0
  private extInfoEmpty: number

  constructor(readonly opts: SimOptions) {
    this.extInfoEmpty = opts.extInfoEmptyTimes ?? 0
    for (const p of fx3Props()) this.props.set(p.code, p)
    for (const [code, value] of Object.entries(opts.overrides ?? {})) {
      const p = this.props.get(Number(code))
      if (p) p.current = value
    }
    this.updateLocks()
  }

  private updateLocks(): void {
    const manual = MANUAL.has(Number(this.props.get(0x500e)!.current) & 0xffff)
    for (const code of NEEDS_MANUAL) {
      const p = this.props.get(code)!
      p.writable = manual
      p.enabled = manual ? ENABLED_YES : ENABLED_GRAYED
    }
  }

  async transaction(opcode: number, params: number[], dataOut?: Uint8Array): Promise<PtpResult> {
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs))
    const ok = (data?: Uint8Array): PtpResult => ({ code: PTP_RC_OK, params: [], data })
    const fail = (code: number): PtpResult => ({ code, params: [] })
    switch (opcode) {
      case PTP_OC_OpenSession:
        this.sessionOpen = true
        return ok()
      case PTP_OC_CloseSession:
        this.sessionOpen = false
        return ok()
      case PTP_OC_GetDeviceInfo:
        return ok(packDeviceInfo({
          vendorExtensionId: 0x11,
          operations: [OC_SDIO_Connect, OC_SDIO_GetExtDeviceInfo, OC_SDIO_SetExtDevicePropValue, OC_SDIO_GetAllExtDevicePropInfo],
          properties: [...this.props.keys()],
          manufacturer: 'Sony Corporation',
          model: this.opts.model ?? 'ILME-FX3',
          deviceVersion: '4.00',
          serialNumber: this.opts.serial,
        }))
      case OC_SDIO_Connect:
        return ok()
      case OC_SDIO_GetExtDeviceInfo:
        if (this.extInfoEmpty-- > 0) return ok(new Uint8Array())
        return ok(new Writer().u16(SONY_PROTOCOL_3).toBytes())
      case OC_SDIO_GetAllExtDevicePropInfo:
        return ok(packAllProps([...this.props.values()]))
      case OC_SDIO_SetExtDevicePropValue: {
        if (!this.sessionOpen || !dataOut) return fail(RC_GeneralError)
        const code = params[0]
        if (code === DPC_DateTimeSet) {
          if (this.opts.rejectClock) return fail(RC_AccessDenied)
          const value = String(readValue(new Reader(dataOut), DTC.STR))
          if (!/^\d{8}T\d{6}\.\d[+-]\d{4}$/.test(value) || value < '20160101') return fail(RC_InvalidDevicePropValue)
          this.clock = { dataType: DTC.STR, value }
          return ok()
        }
        const p = this.props.get(code)
        if (!p) return fail(RC_GeneralError)
        if (!p.writable) return fail(RC_AccessDenied)
        if (NEEDS_MANUAL.has(code) && this.opts.modeSettleMs && Date.now() - this.modeChangedAt < this.opts.modeSettleMs) return fail(RC_DeviceBusy)
        const value = readValue(new Reader(dataOut), p.dataType)
        if (p.values && !p.values.some((v) => String(v) === String(value))) return fail(RC_InvalidDevicePropValue)
        p.current = value
        this.writes++
        if (code === 0x500e) {
          this.modeChangedAt = Date.now()
          this.updateLocks()
        }
        return ok()
      }
      default:
        return fail(0x2005) // OperationNotSupported
    }
  }

  async close(): Promise<void> {
    this.sessionOpen = false
  }

  value(code: number): PropValue | undefined {
    return this.props.get(code)?.current
  }
}
