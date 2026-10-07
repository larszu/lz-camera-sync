import { describe, expect, it } from 'vitest'
import { PtpIpResponder } from './ptpip-responder'
import { PtpIpTransport, type BytePipe } from './ptpip'
import { SimulatedCamera } from './simulator'
import { SonySession } from './sony'
import { apply, takeSnapshot, reportOk } from './sync'

/** A TCP-like byte pipe whose far end is the PTP/IP side of a simulated camera. */
function network(cam: SimulatedCamera): () => Promise<BytePipe> {
  return async () => {
    const inbox: Uint8Array[] = []
    const waiters: ((b: Uint8Array) => void)[] = []
    const deliver = (b: Uint8Array) => {
      const w = waiters.shift()
      if (w) w(b)
      else inbox.push(b)
    }
    const responder = new PtpIpResponder(cam, deliver)
    return {
      async write(bytes) {
        // Split writes, as TCP may.
        const mid = Math.floor(bytes.length / 2)
        responder.push(bytes.subarray(0, mid))
        responder.push(bytes.subarray(mid))
      },
      read: () => (inbox.length ? Promise.resolve(inbox.shift()!) : new Promise((r) => waiters.push(r))),
      async close() {},
    }
  }
}

describe('PTP/IP', () => {
  it('runs a whole job over the network framing', async () => {
    const cam = new SimulatedCamera({ serial: 'NET1', overrides: { 0x500e: 0x00010002, 0xd23f: 3 } })
    const t = await PtpIpTransport.connect(network(cam), new Uint8Array(16), 'LZ Camera Sync')
    const s = new SonySession(t)
    s.settleMs = 0
    expect((await s.open()).serialNumber).toBe('NET1')
    const snap = await takeSnapshot(s, undefined, 'n')
    expect(snap.values.some((v) => v.mode !== undefined)).toBe(true)
    const r = await apply(s, [{ code: 0xd23f, dataType: 0x0002, value: 9 }], { clock: { now: () => new Date('2026-10-07T10:00:00Z'), base: 'utc' } })
    expect(reportOk(r)).toBe(true)
    expect(cam.value(0xd23f)).toBe(9)
    expect(cam.clock?.value).toBe('20261007T100000.0+0000')
    expect(reportOk(await apply(s, snap.values))).toBe(true)
    expect(cam.value(0xd23f)).toBe(3)
  })
})
