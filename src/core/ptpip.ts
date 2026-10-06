/**
 * PTP transports above a raw byte pipe — USB bulk and PTP/IP over TCP.
 *
 * The platform only has to move bytes (Electron main: libusb / net; phone:
 * a native plugin). All framing stays here, shared by every platform.
 *
 * PTP/IP packet layout per libgphoto2 camlibs/ptp2/ptpip.c (CIPA DC-005):
 * uint32 length, uint32 type, payload.
 */

import {
  packCommand,
  packContainer,
  parseContainer,
  PTP_CONTAINER_DATA,
  PTP_CONTAINER_RESPONSE,
  PTP_HEADER_LEN,
  Reader,
  Writer,
  type PtpResult,
  type PtpTransport,
} from './ptp'

/** A pull-based byte pipe: `read` resolves with the next chunk. */
export interface BytePipe {
  write(bytes: Uint8Array): Promise<void>
  read(): Promise<Uint8Array>
  close(): Promise<void>
}

class Buffered {
  private buf = new Uint8Array()
  constructor(private pipe: BytePipe) {}

  async take(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) {
      const chunk = await this.pipe.read()
      const next = new Uint8Array(this.buf.length + chunk.length)
      next.set(this.buf)
      next.set(chunk, this.buf.length)
      this.buf = next
    }
    const out = this.buf.slice(0, n)
    this.buf = this.buf.slice(n)
    return out
  }
}

/** Serialise transactions — PTP allows one at a time per session. */
class Queue {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn)
    this.tail = next.catch(() => undefined)
    return next
  }
}

// ── USB ──────────────────────────────────────────────────────────────────

export class PtpUsbTransport implements PtpTransport {
  private tid = 0
  private q = new Queue()
  private input: Buffered

  constructor(private pipe: BytePipe) {
    this.input = new Buffered(pipe)
  }

  private async container() {
    const head = await this.input.take(PTP_HEADER_LEN)
    const len = new Reader(head).u32()
    const rest = await this.input.take(Math.max(0, len - PTP_HEADER_LEN))
    const full = new Uint8Array(head.length + rest.length)
    full.set(head)
    full.set(rest, head.length)
    return parseContainer(full)!
  }

  transaction(opcode: number, params: number[], dataOut?: Uint8Array): Promise<PtpResult> {
    return this.q.run(async () => {
      const tid = ++this.tid
      await this.pipe.write(packCommand(opcode, tid, params))
      if (dataOut) await this.pipe.write(packContainer(PTP_CONTAINER_DATA, opcode, tid, dataOut))
      let c = await this.container()
      let data: Uint8Array | undefined
      if (c.type === PTP_CONTAINER_DATA) {
        data = c.payload
        c = await this.container()
      }
      if (c.type !== PTP_CONTAINER_RESPONSE) throw new Error(`Unexpected PTP container type ${c.type}`)
      const r = new Reader(c.payload)
      const out: number[] = []
      while (r.remaining >= 4) out.push(r.u32())
      return { code: c.code, params: out, data }
    })
  }

  close(): Promise<void> {
    return this.pipe.close()
  }
}

// ── PTP/IP ───────────────────────────────────────────────────────────────

export const PTPIP_PORT = 15740

export const PTPIP = {
  INIT_COMMAND_REQUEST: 1,
  INIT_COMMAND_ACK: 2,
  INIT_EVENT_REQUEST: 3,
  INIT_EVENT_ACK: 4,
  INIT_FAIL: 5,
  CMD_REQUEST: 6,
  CMD_RESPONSE: 7,
  EVENT: 8,
  START_DATA: 9,
  DATA: 10,
  CANCEL: 11,
  END_DATA: 12,
  PING: 13,
  PONG: 14,
} as const

export function packPtpIp(type: number, payload: Uint8Array): Uint8Array {
  return new Writer().u32(8 + payload.length).u32(type).bytes(payload).toBytes()
}

/** Friendly names in PTP/IP init packets are NUL-terminated UTF-16LE, not PTP strings. */
function utf16z(s: string): Uint8Array {
  const w = new Writer()
  for (const ch of s) w.u16(ch.charCodeAt(0))
  return w.u16(0).toBytes()
}

export function initCommandRequest(guid: Uint8Array, name: string): Uint8Array {
  return packPtpIp(PTPIP.INIT_COMMAND_REQUEST, new Writer().bytes(guid).bytes(utf16z(name)).u32(0x00010000).toBytes())
}

export function cmdRequest(opcode: number, tid: number, params: number[], dataOut: boolean): Uint8Array {
  const w = new Writer().u32(dataOut ? 2 : 1).u16(opcode).u32(tid)
  for (const p of params) w.u32(p >>> 0)
  return packPtpIp(PTPIP.CMD_REQUEST, w.toBytes())
}

export class PtpIpTransport implements PtpTransport {
  private tid = 0
  private q = new Queue()
  private input: Buffered

  private constructor(private cmd: BytePipe, private event: BytePipe) {
    this.input = new Buffered(cmd)
  }

  /**
   * Open the command and event channels. `open` comes from the platform
   * (Electron: node:net through IPC; phone: native TCP plugin).
   */
  static async connect(open: () => Promise<BytePipe>, guid: Uint8Array, name = 'lz-camera-sync'): Promise<PtpIpTransport> {
    const cmd = await open()
    await cmd.write(initCommandRequest(guid, name))
    const cmdIn = new Buffered(cmd)
    const ack = await readPacket(cmdIn)
    if (ack.type === PTPIP.INIT_FAIL) throw new Error(`PTP/IP refused (reason ${new Reader(ack.payload).u32()})`)
    if (ack.type !== PTPIP.INIT_COMMAND_ACK) throw new Error(`PTP/IP: unexpected packet ${ack.type}`)
    const connection = new Reader(ack.payload).u32()

    const event = await open()
    await event.write(packPtpIp(PTPIP.INIT_EVENT_REQUEST, new Writer().u32(connection).toBytes()))
    const evAck = await readPacket(new Buffered(event))
    if (evAck.type !== PTPIP.INIT_EVENT_ACK) throw new Error(`PTP/IP: event channel refused (${evAck.type})`)

    const t = new PtpIpTransport(cmd, event)
    t.input = cmdIn
    return t
  }

  transaction(opcode: number, params: number[], dataOut?: Uint8Array): Promise<PtpResult> {
    return this.q.run(async () => {
      const tid = ++this.tid
      await this.cmd.write(cmdRequest(opcode, tid, params, !!dataOut))
      if (dataOut) {
        await this.cmd.write(packPtpIp(PTPIP.START_DATA, new Writer().u32(tid).u64(BigInt(dataOut.length)).toBytes()))
        await this.cmd.write(packPtpIp(PTPIP.END_DATA, new Writer().u32(tid).bytes(dataOut).toBytes()))
      }
      const chunks: Uint8Array[] = []
      for (;;) {
        const p = await readPacket(this.input)
        if (p.type === PTPIP.DATA || p.type === PTPIP.END_DATA) chunks.push(p.payload.subarray(4))
        else if (p.type === PTPIP.CMD_RESPONSE) {
          const r = new Reader(p.payload)
          const code = r.u16()
          r.u32() // tid
          const out: number[] = []
          while (r.remaining >= 4) out.push(r.u32())
          return { code, params: out, data: chunks.length ? concat(chunks) : undefined }
        }
        // START_DATA, PING etc.: nothing to keep
      }
    })
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.cmd.close(), this.event.close()])
  }
}

async function readPacket(input: Buffered): Promise<{ type: number; payload: Uint8Array }> {
  const head = new Reader(await input.take(8))
  const len = head.u32()
  const type = head.u32()
  return { type, payload: await input.take(Math.max(0, len - 8)) }
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
