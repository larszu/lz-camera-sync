/**
 * Where the job stands — derived, never stored. The UI shows one next action
 * at a time; this decides which.
 */

import type { CameraState } from './store'

export type Phase = 'connect' | 'backup' | 'push' | 'restore' | 'done'

export const PHASES: Phase[] = ['connect', 'backup', 'push', 'restore', 'done']

/** Checkpoints a single camera passes; index = how many are done. */
export const CHECKPOINTS = ['backup', 'push', 'restore'] as const

export function checkpointsDone(state: CameraState | undefined): number {
  if (state === 'private') return 1
  if (state === 'global') return 2
  if (state === 'restored') return 3
  return 0
}

export interface JobView {
  phase: Phase
  /** Cameras that still need the current phase's action. */
  pending: string[]
  /** Per phase (backup, push, restore): how many live cameras are through. */
  counts: { backup: number; push: number; restore: number }
  total: number
}

export function jobView(liveSerials: string[], states: Record<string, CameraState | undefined>): JobView {
  const total = liveSerials.length
  const done = liveSerials.map((s) => checkpointsDone(states[s]))
  const counts = {
    backup: done.filter((d) => d >= 1).length,
    push: done.filter((d) => d >= 2).length,
    restore: done.filter((d) => d >= 3).length,
  }
  if (total === 0) return { phase: 'connect', pending: [], counts, total }
  const min = Math.min(...done)
  const phase: Phase = min === 0 ? 'backup' : min === 1 ? 'push' : min === 2 ? 'restore' : 'done'
  const pending = liveSerials.filter((_, i) => done[i] === min && phase !== 'done')
  return { phase, pending, counts, total }
}
