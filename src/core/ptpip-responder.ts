/**
 * The camera side of PTP/IP, on top of the simulator — for tests and for the
 * fake network camera (scripts/fake-camera.ts). Packet layout as in ptpip.ts.
 */

import { Reader, Writer, type PtpTransport } from './ptp'
import { packPtpIp, PTPIP } from './ptpip'

export class PtpIpResponder {
  private buf = new Uint8Array()
  private pending?: { opcode: number; tid: number; params: number[]; data: Uint8Array[] }

  constructor(
    private camera: PtpTransport,
    private send: (bytes: Uint8Array) => void,
    private name = 'ILME-FX3',
  ) {}

  push(chunk: Uint8Array): void {
    const next = new Uint8Array(this.buf.length + chunk.length)
    next.set(this.buf)
    next.set(chunk, this.buf.length)
    this.buf = next
    for (;;) {
      if (this.buf.length < 8) return
      const len = new Reader(this.buf).u32()
      if (this.buf.length < len) return
      const packet = this.buf.slice(0, len)
      this.buf = this.buf.slice(len)
      void this.handle(new Reader(packet, 4))
    }
  }

  private async handle(r: Reader): Promise<void> {
    const type = r.u32()
    switch (type) {
      case PTPIP.INIT_COMMAND_REQUEST: {
        const w = new Writer().u32(1).bytes(new Uint8Array(16))
        for (const ch of this.name) w.u16(ch.charCodeAt(0))
        this.send(packPtpIp(PTPIP.INIT_COMMAND_ACK, w.u16(0).u32(0x00010000).toBytes()))
        return
      }
      case PTPIP.INIT_EVENT_REQUEST:
        this.send(packPtpIp(PTPIP.INIT_EVENT_ACK, new Uint8Array()))
        return
      case PTPIP.CMD_REQUEST: {
        const dataphase = r.u32()
        const opcode = r.u16()
        const tid = r.u32()
        const params: number[] = []
        while (r.remaining >= 4) params.push(r.u32())
        this.pending = { opcode, tid, params, data: [] }
        if (dataphase !== 2) await this.run()
        return
      }
      case PTPIP.START_DATA:
        return
      case PTPIP.DATA:
      case PTPIP.END_DATA: {
        r.u32() // tid
        this.pending?.data.push(r.bytes.slice(r.offset))
        if (type === PTPIP.END_DATA) await this.run()
        return
      }
    }
  }

  private async run(): Promise<void> {
    const p = this.pending
    if (!p) return
    this.pending = undefined
    const dataOut = p.data.length ? concat(p.data) : undefined
    const res = await this.camera.transaction(p.opcode, p.params, dataOut)
    if (res.data) {
      this.send(packPtpIp(PTPIP.START_DATA, new Writer().u32(p.tid).u64(BigInt(res.data.length)).toBytes()))
      this.send(packPtpIp(PTPIP.END_DATA, new Writer().u32(p.tid).bytes(res.data).toBytes()))
    }
    const w = new Writer().u16(res.code).u32(p.tid)
    for (const x of res.params) w.u32(x)
    this.send(packPtpIp(PTPIP.CMD_RESPONSE, w.toBytes()))
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
