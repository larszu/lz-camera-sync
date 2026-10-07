/**
 * The job flow: back up each camera's private settings, push one global
 * setup (plus the current time) to all of them, and afterwards put every
 * camera back the way its operator had it.
 *
 * Pure logic over a SonySession — no UI, no storage.
 */

import { GROUPS, groupOf, isSyncable, priority, type GroupId } from './catalog'
import { sameValue, type PropValue } from './ptp'
import { DPC_ExposureProgramMode, propertyName, type ClockBase, type PropDesc, type SonySession } from './sony'

export interface StoredValue {
  code: number
  dataType: number
  value: PropValue
  /**
   * Set when the value is only reachable in another exposure mode — e.g. the
   * manual shutter of a camera that was in P at backup time. Holds the mode
   * the value was read in; it is written back in that mode, then the camera
   * returns to its own mode.
   */
  mode?: PropValue
}

export interface Snapshot {
  id: string
  serial: string
  model: string
  operatorId?: string
  takenAt: string
  values: StoredValue[]
}

export interface GlobalSetup {
  id: string
  name: string
  /** Serial of the camera it was taken from, if any. */
  sourceSerial?: string
  groups: GroupId[]
  values: StoredValue[]
  setClock: boolean
  clockBase: ClockBase
}

export interface Step {
  code: number
  name: string
  dataType: number
  from: PropValue
  to: PropValue
}

export type SkipReason = 'missing' | 'readOnly' | 'notOffered'

export interface Plan {
  steps: Step[]
  unchanged: number
  skipped: { code: number; name: string; reason: SkipReason }[]
}

export interface ApplyReport {
  applied: Step[]
  unchanged: number
  skipped: Plan['skipped']
  failed: { code: number; name: string; error: string }[]
  /** Values the camera reports differently after the write. */
  mismatched: { code: number; name: string; want: PropValue; have: PropValue }[]
  clockSet?: boolean
  clockError?: string
  /** Values written in a temporary exposure mode (see StoredValue.mode). */
  viaMode: number
}

// ── Snapshot ─────────────────────────────────────────────────────────────

export function snapshotFrom(props: PropDesc[]): StoredValue[] {
  return props
    .filter((p) => p.writable && isSyncable(p.code))
    .map((p) => ({ code: p.code, dataType: p.dataType, value: p.current }))
}

export async function takeSnapshot(session: SonySession, operatorId: string | undefined, id: string): Promise<Snapshot> {
  const props = await session.readAll()
  const values = [...snapshotFrom(props), ...(await readBehindMode(session, props))]
  return {
    id,
    serial: session.info.serialNumber,
    model: session.info.model,
    operatorId,
    takenAt: new Date().toISOString(),
    values,
  }
}

// ── Values behind the exposure mode ──────────────────────────────────────

/**
 * The M mode of the family the current mode belongs to. Codes from Sony's
 * Camera Control PTP 3 Reference (0x500E); the low 16 bits name the mode.
 * Undefined when the camera already is in M, or in a mode without an M
 * (Auto, scenes, Flexible Exposure, where each value has its own auto switch).
 */
export function manualModeFor(desc: PropDesc): PropValue | undefined {
  const low = Number(desc.current) & 0xffff
  const families: [number[], number][] = [
    [[0x0002, 0x0003, 0x0004], 0x0001],
    [[0x8050, 0x8051, 0x8052, 0x8054], 0x8053],
    [[0x8059, 0x805a, 0x805b, 0x805d], 0x805c],
    [[0x8080, 0x8081, 0x8082], 0x8083],
    [[0x8084, 0x8085, 0x8086], 0x8087],
    [[0x8093, 0x8094, 0x8095, 0x8097], 0x8096],
  ]
  const want = families.find(([from]) => from.includes(low))?.[1]
  if (want === undefined) return undefined
  return desc.values?.find((v) => (Number(v) & 0xffff) === want)
}

/**
 * Read what the camera keeps for its M mode while it sits in P/A/S: switch to
 * M for a moment, read, switch back. Whatever became writable in M is stored
 * with that mode. A mode the camera refuses to change (dial-controlled
 * bodies) simply yields nothing.
 */
export async function readBehindMode(session: SonySession, props: PropDesc[]): Promise<StoredValue[]> {
  const modeDesc = props.find((p) => p.code === DPC_ExposureProgramMode)
  if (!modeDesc?.writable) return []
  const manual = manualModeFor(modeDesc)
  if (manual === undefined) return []
  const before = new Map(props.map((p) => [p.code, p]))
  try {
    await session.set(DPC_ExposureProgramMode, manual, modeDesc.dataType)
  } catch {
    return []
  }
  try {
    const inManual = await session.readAll()
    return inManual
      .filter((p) => p.writable && isSyncable(p.code) && p.code !== DPC_ExposureProgramMode && !before.get(p.code)?.writable)
      .map((p) => ({ code: p.code, dataType: p.dataType, value: p.current, mode: manual }))
  } finally {
    await session.set(DPC_ExposureProgramMode, modeDesc.current, modeDesc.dataType)
  }
}

/** A global setup is a filtered snapshot of the camera that was dialled in by hand. */
export function setupFromSnapshot(snap: Snapshot, groups: GroupId[], name: string, id: string): GlobalSetup {
  return {
    id,
    name,
    sourceSerial: snap.serial,
    groups,
    values: snap.values.filter((v) => groups.includes(groupOf(v.code))),
    setClock: true,
    clockBase: 'local',
  }
}

export const ALL_GROUPS: GroupId[] = [...GROUPS.map((g) => g.id), 'other']

// ── Plan ─────────────────────────────────────────────────────────────────

export function plan(current: PropDesc[], target: StoredValue[]): Plan {
  const byCode = new Map(current.map((p) => [p.code, p]))
  const out: Plan = { steps: [], unchanged: 0, skipped: [] }
  for (const t of target) {
    if (!isSyncable(t.code)) continue
    const name = propertyName(t.code)
    const p = byCode.get(t.code)
    if (!p) {
      out.skipped.push({ code: t.code, name, reason: 'missing' })
      continue
    }
    if (sameValue(p.current, t.value)) {
      out.unchanged++
      continue
    }
    if (p.values && !p.values.some((v) => sameValue(v, t.value))) {
      out.skipped.push({ code: t.code, name, reason: 'notOffered' })
      continue
    }
    // A read-only property may become writable once the mode ahead of it is
    // set; it stays in the plan and the second pass decides.
    out.steps.push({ code: t.code, name, dataType: p.dataType, from: p.current, to: t.value })
  }
  out.steps.sort((a, b) => priority(a.code) - priority(b.code))
  return out
}

// ── Apply ────────────────────────────────────────────────────────────────

export interface ApplyOptions {
  clock?: { now: () => Date; base: ClockBase }
  onProgress?: (done: number, total: number, name: string) => void
}

/**
 * Write the target in priority order. What fails in pass one is tried once
 * more after a fresh read — a mode set in pass one unlocks dependent values.
 * Values that live behind another exposure mode are written last, in that
 * mode, and the camera goes back to the mode it should end in. Then read back
 * and report every value the camera did not take.
 */
export async function apply(session: SonySession, target: StoredValue[], opts: ApplyOptions = {}): Promise<ApplyReport> {
  const direct = target.filter((v) => v.mode === undefined)
  const behind = target.filter((v) => v.mode !== undefined && isSyncable(v.code))
  const first = plan(await session.readAll(), direct)
  const report: ApplyReport = { applied: [], unchanged: first.unchanged, skipped: first.skipped, failed: [], mismatched: [], viaMode: 0 }
  const total = first.steps.length + behind.length
  let done = 0

  const retry: Step[] = []
  for (const s of first.steps) {
    opts.onProgress?.(done, total, s.name)
    try {
      await session.set(s.code, s.to, s.dataType)
      report.applied.push(s)
      done++
    } catch {
      retry.push(s)
    }
  }

  if (retry.length) {
    const fresh = new Map((await session.readAll()).map((p) => [p.code, p]))
    for (const s of retry) {
      opts.onProgress?.(done, total, s.name)
      if (fresh.get(s.code) && sameValue(fresh.get(s.code)!.current, s.to)) {
        report.applied.push(s)
        done++
        continue
      }
      try {
        await session.set(s.code, s.to, s.dataType)
        report.applied.push(s)
      } catch (e) {
        report.failed.push({ code: s.code, name: s.name, error: (e as Error).message })
      }
      done++
    }
  }

  // Check the direct values now: the mode window below changes the mode
  // and with it what the camera reports for mode-dependent values.
  const after = new Map((await session.readAll()).map((p) => [p.code, p]))
  for (const s of report.applied) {
    const have = after.get(s.code)?.current
    if (have !== undefined && !sameValue(have, s.to)) {
      report.mismatched.push({ code: s.code, name: s.name, want: s.to, have })
    }
  }

  if (behind.length) {
    await applyBehindMode(session, behind, after.get(DPC_ExposureProgramMode), report, (name) => opts.onProgress?.(done++, total, name))
  }

  if (opts.clock) {
    try {
      await session.setClock(opts.clock.now(), opts.clock.base)
      report.clockSet = true
    } catch (e) {
      report.clockSet = false
      report.clockError = (e as Error).message
    }
  }

  opts.onProgress?.(total, total, '')
  return report
}

async function applyBehindMode(
  session: SonySession,
  values: StoredValue[],
  modeDesc: PropDesc | undefined,
  report: ApplyReport,
  tick: (name: string) => void,
): Promise<void> {
  const fail = (v: StoredValue, error: string) => report.failed.push({ code: v.code, name: propertyName(v.code), error })
  if (!modeDesc) {
    values.forEach((v) => fail(v, 'exposure mode not available'))
    return
  }
  const final = modeDesc.current
  const groups = new Map<string, StoredValue[]>()
  for (const v of values) groups.set(String(v.mode), [...(groups.get(String(v.mode)) ?? []), v])

  for (const group of groups.values()) {
    const mode = group[0].mode!
    const switching = !sameValue(mode, final)
    try {
      if (switching) await session.set(DPC_ExposureProgramMode, mode, modeDesc.dataType)
      const here = new Map((await session.readAll()).map((p) => [p.code, p]))
      const written: Step[] = []
      for (const v of group) {
        const name = propertyName(v.code)
        tick(name)
        const cur = here.get(v.code)
        if (cur && sameValue(cur.current, v.value)) {
          report.unchanged++
          continue
        }
        try {
          await session.set(v.code, v.value, v.dataType)
          const step = { code: v.code, name, dataType: v.dataType, from: cur?.current ?? '', to: v.value }
          report.applied.push(step)
          written.push(step)
          report.viaMode++
        } catch (e) {
          fail(v, (e as Error).message)
        }
      }
      const check = new Map((await session.readAll()).map((p) => [p.code, p]))
      for (const s of written) {
        const have = check.get(s.code)?.current
        if (have !== undefined && !sameValue(have, s.to)) report.mismatched.push({ code: s.code, name: s.name, want: s.to, have })
      }
    } catch (e) {
      group.forEach((v) => fail(v, `exposure mode refused: ${(e as Error).message}`))
    } finally {
      if (switching) {
        try {
          await session.set(DPC_ExposureProgramMode, final, modeDesc.dataType)
        } catch (e) {
          report.failed.push({ code: DPC_ExposureProgramMode, name: propertyName(DPC_ExposureProgramMode), error: `could not return to the exposure mode: ${(e as Error).message}` })
        }
      }
    }
  }
}

export function reportOk(r: ApplyReport): boolean {
  return r.failed.length === 0 && r.mismatched.length === 0 && r.clockSet !== false
}
