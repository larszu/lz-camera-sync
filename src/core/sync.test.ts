import { describe, expect, it } from 'vitest'
import {
  apply,
  DTC,
  encodeValue,
  FORM_ENUM,
  formatValue,
  packAllProps,
  packCommand,
  packContainer,
  parseAllProps,
  parseContainer,
  plan,
  PTP_CONTAINER_COMMAND,
  PTP_CONTAINER_DATA,
  PTP_CONTAINER_RESPONSE,
  PtpUsbTransport,
  Reader,
  readValue,
  reportOk,
  setupFromSnapshot,
  SimulatedCamera,
  SonySession,
  takeSnapshot,
  Writer,
  type BytePipe,
  type PropDesc,
} from './index'

const SS = (num: number, den: number) => ((num << 16) | den) >>> 0

describe('PTP values', () => {
  it('round-trips every scalar type and strings', () => {
    for (const [t, v] of [
      [DTC.INT8, -5], [DTC.UINT8, 200], [DTC.INT16, -1000], [DTC.UINT16, 0xfffe],
      [DTC.INT32, -70000], [DTC.UINT32, 0xffffff], [DTC.UINT64, '1767225600'], [DTC.STR, 'FX3 A'],
    ] as const) {
      expect(readValue(new Reader(encodeValue(t, v)), t)).toEqual(v)
    }
  })

  it('frames a command container', () => {
    const c = parseContainer(packCommand(0x9205, 7, [0xd20d]))!
    expect(c).toMatchObject({ type: PTP_CONTAINER_COMMAND, code: 0x9205, transactionId: 7, length: 16 })
  })
})

describe('Sony property dump', () => {
  it('parses what it packs, including range and enum forms', () => {
    const props: PropDesc[] = [
      { code: 0x5005, dataType: DTC.UINT16, writable: true, enabled: 1, current: 0x8012, form: FORM_ENUM, values: [2, 0x8012] },
      { code: 0xd20f, dataType: DTC.UINT16, writable: true, enabled: 1, current: 5600, form: 1, range: { min: 2500, max: 9900, step: 100 } },
      { code: 0xd218, dataType: DTC.INT8, writable: false, enabled: 0, current: 76, form: 0 },
    ]
    const back = parseAllProps(packAllProps(props), 3)
    expect(back).toEqual(props)
  })

  it('treats a display-only property as read-only in mode 3', () => {
    const bytes = packAllProps([{ code: 0xd21e, dataType: DTC.UINT32, writable: true, enabled: 2, current: 800, form: 0 }])
    expect(parseAllProps(bytes, 3)[0].writable).toBe(false)
  })

  it('reads the second enum list newer bodies append', () => {
    const w = new Writer().u32(1).u32(0)
    w.u16(0x5005).u16(DTC.UINT16).u8(1).u8(1).u16(2).u16(2).u8(FORM_ENUM)
    w.u16(3).u16(2).u16(4).u16(0x8012) // all values
    w.u16(2).u16(2).u16(4) // settable now
    expect(parseAllProps(w.toBytes(), 3)[0].values).toEqual([2, 4])
  })

  it('formats the values an operator reads', () => {
    expect(formatValue(0x5007, 280)).toBe('f/2.8')
    expect(formatValue(0xd20d, SS(1, 50))).toBe('1/50')
    expect(formatValue(0xd21e, 0xffffff)).toBe('ISO Auto')
    expect(formatValue(0x500e, 0x00010002)).toBe('P')
  })
})

describe('job flow: backup → global → restore', () => {
  async function connect(cam: SimulatedCamera, settleMs = 0) {
    const s = new SonySession(cam)
    s.settleMs = settleMs
    await s.open()
    return s
  }

  it('aligns three cameras and puts each back afterwards', async () => {
    const master = new SimulatedCamera({ serial: 'A', overrides: { 0xd20d: SS(1, 50), 0xd23f: 8, 0x5005: 0x8012, 0xd20f: 5600 } })
    const b = new SimulatedCamera({ serial: 'B', overrides: { 0xd20d: SS(1, 100), 0xd23f: 2, 0xd20f: 4300, 0x500e: 0x00010002 } })
    const c = new SimulatedCamera({ serial: 'C', overrides: { 0xd21e: 3200, 0xd23f: 11 } })
    const sessions = await Promise.all([master, b, c].map(connect))

    const backups = await Promise.all(sessions.map((s, i) => takeSnapshot(s, `op${i}`, `snap${i}`)))
    expect(backups[1].values.find((v) => v.code === 0xd214)).toBeUndefined() // lens position never stored

    const global = setupFromSnapshot(backups[0], ['exposure', 'whiteBalance', 'picture'], 'Job', 'g1')
    const now = new Date('2026-10-06T18:30:00Z')
    for (const s of sessions.slice(1)) {
      const r = await apply(s, global.values, { clock: { now: () => now, base: 'utc' } })
      expect(reportOk(r)).toBe(true)
    }
    // B was in P mode: shutter only took because the mode went first.
    expect(b.value(0xd20d)).toBe(SS(1, 50))
    expect(b.value(0x500e)).toBe(0x00078053)
    expect(c.value(0xd23f)).toBe(8)
    // Sony PTP 3 Reference: ISO 8601 string with offset.
    expect(c.clock?.value).toBe('20261006T183000.0+0000')

    for (const [i, s] of sessions.entries()) {
      expect(reportOk(await apply(s, backups[i].values))).toBe(true)
    }
    expect(b.value(0x500e)).toBe(0x00010002)
    // B was backed up in P: its manual shutter sits behind M. It was read in
    // M at backup time and is written back in M; B ends in P again.
    expect(backups[1].values.find((v) => v.code === 0xd20d)).toMatchObject({ value: SS(1, 100), mode: 0x00000001 })
    expect(b.value(0xd20d)).toBe(SS(1, 100))
    expect(b.value(0xd20f)).toBe(4300)
    expect(c.value(0xd21e)).toBe(3200)
    expect(c.value(0xd23f)).toBe(11)
  })

  it('leaves a camera in its own mode after reading what sits behind it', async () => {
    const cam = new SimulatedCamera({ serial: 'P', overrides: { 0x500e: 0x00078050, 0xd20d: SS(1, 25) } })
    const s = await connect(cam)
    const snap = await takeSnapshot(s, undefined, 'p')
    expect(cam.value(0x500e)).toBe(0x00078050)
    // Movie P → the M of the movie family, not still M.
    expect(snap.values.filter((v) => v.mode !== undefined).every((v) => v.mode === 0x00078053)).toBe(true)
    expect(snap.values.find((v) => v.code === 0xd20d)?.value).toBe(SS(1, 25))
  })

  it('reads nothing behind a mode the camera will not change', async () => {
    const cam = new SimulatedCamera({ serial: 'D', overrides: { 0x500e: 0x00010002 } })
    cam.props.get(0x500e)!.writable = false // mode dial on the body
    const s = await connect(cam)
    const snap = await takeSnapshot(s, undefined, 'd')
    expect(snap.values.some((v) => v.mode !== undefined)).toBe(false)
    expect(cam.value(0x500e)).toBe(0x00010002)
  })

  it('waits after a mode change, as Sony asks', async () => {
    const make = () => new SimulatedCamera({ serial: 'W', overrides: { 0x500e: 0x00010002 }, modeSettleMs: 40 })
    const target = [
      { code: 0x500e, dataType: DTC.UINT32, value: 0x00000001 },
      { code: 0xd20d, dataType: DTC.UINT32, value: SS(1, 250) },
    ]
    const hasty = make()
    const r1 = await apply(await connect(hasty, 0), target)
    expect(r1.failed.map((f) => f.code)).toContain(0xd20d)
    const patient = make()
    const r2 = await apply(await connect(patient, 60), target)
    expect(reportOk(r2)).toBe(true)
    expect(patient.value(0xd20d)).toBe(SS(1, 250))
  })

  it('reports values a body does not offer instead of failing the job', async () => {
    const cam = new SimulatedCamera({ serial: 'X' })
    const s = await connect(cam)
    const p = plan(await s.readAll(), [{ code: 0xd23f, dataType: DTC.UINT8, value: 42 }])
    expect(p.steps).toHaveLength(0)
    expect(p.skipped[0]).toMatchObject({ code: 0xd23f, reason: 'notOffered' })
  })

  it('says so when the clock is refused', async () => {
    const s = await connect(new SimulatedCamera({ serial: 'Y', rejectClock: true }))
    const r = await apply(s, [], { clock: { now: () => new Date(), base: 'local' } })
    expect(r.clockSet).toBe(false)
    expect(reportOk(r)).toBe(false)
  })
})

describe('USB framing', () => {
  /** Plays the camera side of the USB bulk pipe on top of the simulator. */
  function usbLoopback(cam: SimulatedCamera): BytePipe {
    const outbox: Uint8Array[] = []
    let pending: { op: number; tid: number; params: number[] } | null = null
    return {
      async write(bytes) {
        const c = parseContainer(bytes)!
        if (c.type === PTP_CONTAINER_COMMAND) {
          const r = new Reader(c.payload)
          const params: number[] = []
          while (r.remaining >= 4) params.push(r.u32())
          pending = { op: c.code, tid: c.transactionId, params }
          // Commands that carry data wait for the data phase.
          if (c.code !== 0x9205) await respond()
        } else if (c.type === PTP_CONTAINER_DATA) {
          await respond(c.payload)
        }
      },
      async read() {
        const next = outbox.shift()
        if (!next) throw new Error('nothing to read')
        return next
      },
      async close() {},
    }
    async function respond(data?: Uint8Array) {
      const { op, tid, params } = pending!
      const res = await cam.transaction(op, params, data)
      if (res.data) {
        // Split the data phase across two transfers, as a real bus does.
        const whole = packContainer(PTP_CONTAINER_DATA, op, tid, res.data)
        outbox.push(whole.subarray(0, 20), whole.subarray(20))
      }
      outbox.push(packContainer(PTP_CONTAINER_RESPONSE, res.code, tid))
    }
  }

  it('runs a whole session through the bulk framing', async () => {
    const cam = new SimulatedCamera({ serial: 'USB1' })
    const s = new SonySession(new PtpUsbTransport(usbLoopback(cam)))
    const info = await s.open()
    expect(info.serialNumber).toBe('USB1')
    expect(s.modeVersion).toBe(3)
    await s.readAll()
    await s.set(0xd23f, 5)
    expect(cam.value(0xd23f)).toBe(5)
  })
})
