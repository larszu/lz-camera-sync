/**
 * The job flow: back up each camera's private settings, push one global
 * setup (plus the current time) to all of them, and afterwards put every
 * camera back the way its operator had it.
 *
 * Pure logic over a SonySession — no UI, no storage.
 */

import { GROUPS, groupOf, isSyncable, priority, type GroupId } from './catalog'
import { sameValue, type PropValue } from './ptp'
import { propertyName, type ClockBase, type PropDesc, type SonySession } from './sony'

export interface StoredValue {
  code: number
  dataType: number
  value: PropValue
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
}

// ── Snapshot ─────────────────────────────────────────────────────────────

export function snapshotFrom(props: PropDesc[]): StoredValue[] {
  return props
    .filter((p) => p.writable && isSyncable(p.code))
    .map((p) => ({ code: p.code, dataType: p.dataType, value: p.current }))
}

export async function takeSnapshot(session: SonySession, operatorId: string | undefined, id: string): Promise<Snapshot> {
  const props = await session.readAll()
  return {
    id,
    serial: session.info.serialNumber,
    model: session.info.model,
    operatorId,
    takenAt: new Date().toISOString(),
    values: snapshotFrom(props),
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
 * Then read back and report every value the camera did not take.
 */
export async function apply(session: SonySession, target: StoredValue[], opts: ApplyOptions = {}): Promise<ApplyReport> {
  const first = plan(await session.readAll(), target)
  const report: ApplyReport = { applied: [], unchanged: first.unchanged, skipped: first.skipped, failed: [], mismatched: [] }
  const total = first.steps.length
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

  if (opts.clock) {
    try {
      await session.setClock(opts.clock.now(), opts.clock.base)
      report.clockSet = true
    } catch (e) {
      report.clockSet = false
      report.clockError = (e as Error).message
    }
  }

  const after = new Map((await session.readAll()).map((p) => [p.code, p]))
  for (const s of report.applied) {
    const have = after.get(s.code)?.current
    if (have !== undefined && !sameValue(have, s.to)) {
      report.mismatched.push({ code: s.code, name: s.name, want: s.to, have })
    }
  }
  opts.onProgress?.(total, total, '')
  return report
}

export function reportOk(r: ApplyReport): boolean {
  return r.failed.length === 0 && r.mismatched.length === 0 && r.clockSet !== false
}
