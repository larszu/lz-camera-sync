/**
 * App state. Persistent data (operators, known cameras, private backups,
 * global setups) lives in localStorage and can be exported as one JSON file.
 * Live connections are in memory only.
 */

import { useSyncExternalStore } from 'react'
import type { ApplyReport, GlobalSetup, GroupId, ModelProfile, PropDesc, Snapshot, SonySession } from '../core'

export interface Operator {
  id: string
  name: string
}

export interface KnownCamera {
  serial: string
  model: string
  label: string
  operatorId?: string
}

export type CameraState = 'private' | 'global' | 'restored'

export interface Persisted {
  version: 1
  operators: Operator[]
  cameras: Record<string, KnownCamera>
  /** Latest private backup per camera serial. */
  backups: Record<string, Snapshot>
  setups: GlobalSetup[]
  activeSetupId?: string
  /** Job preferences: what a global setup carries, clock on/off, UTC. */
  groups: GroupId[]
  withClock: boolean
  clockUtc: boolean
  /** What each camera carries right now, as far as this app knows. */
  states: Record<string, CameraState>
  guid: string
  /** Which LUT this app put into which user slot, per camera serial. */
  lutSlots?: Record<string, Record<number, string>>
  /** Show all cameras' settings as one table instead of tiles. */
  overview?: boolean
  /** Show live view in the camera tiles. */
  liveTiles?: boolean
  /** Show live view in the camera sheet (on unless switched off). */
  liveSheet?: boolean
  /** What each camera model offers, read from a real body — for preparing setups offline. */
  profiles: Record<string, ModelProfile>
  /** Per camera IP: SSH user and the confirmed host fingerprint. Never the password. */
  hosts: Record<string, { user?: string; fingerprint?: string }>
}

export interface Live {
  serial: string
  transport: 'usb' | 'ptpip' | 'sim'
  address: string
  session: SonySession
  props: PropDesc[]
  busy?: string
  progress?: { done: number; total: number }
  /** Base-look names as the camera reports them (presets and user LUT slots). */
  baseLooks?: Map<number, string>
  /** This job so far: settings written, clock set. Reset by a new job. */
  written?: number
  clockSet?: boolean
  report?: ApplyReport
  /** The alignment was cancelled on this camera after it had written something. */
  cancelled?: boolean
  error?: string
}

const KEY = 'lz-camera-sync/v1'

function randomGuid(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function empty(): Persisted {
  return {
    version: 1,
    operators: [],
    cameras: {},
    backups: {},
    setups: [],
    states: {},
    groups: ['exposure', 'whiteBalance', 'picture', 'movie'],
    withClock: true,
    clockUtc: false,
    guid: randomGuid(),
    hosts: {},
    profiles: {},
  }
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...empty(), ...JSON.parse(raw) }
  } catch {
    // private window or blocked storage: start empty
  }
  return empty()
}

let data: Persisted = load()
let live: Live[] = []
const listeners = new Set<() => void>()
let snapshot = { data, live }

function emit() {
  snapshot = { data, live }
  for (const l of listeners) l()
}

export function update(fn: (d: Persisted) => Persisted) {
  data = fn(data)
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // storage full or blocked; export still works
  }
  emit()
}

export function setLive(fn: (l: Live[]) => Live[]) {
  live = fn(live)
  emit()
}

export function patchLive(serial: string, patch: Partial<Live>) {
  setLive((l) => l.map((x) => (x.serial === serial ? { ...x, ...patch } : x)))
}

export function useStore() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
  )
}

export function getLive(): Live[] {
  return live
}

export function getData(): Persisted {
  return data
}

export function exportJson(): string {
  return JSON.stringify(data, null, 2)
}

export function importJson(text: string) {
  const parsed = JSON.parse(text) as Persisted
  if (parsed.version !== 1) throw new Error('Unknown file version')
  update(() => ({ ...empty(), ...parsed }))
}

export function newId(): string {
  return randomGuid().slice(0, 12)
}
