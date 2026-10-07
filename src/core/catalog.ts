/**
 * What gets synced, in which order, and how values read.
 *
 * The backup itself is not limited to this list: every property the camera
 * reports as writable goes into a private snapshot, known or not. The groups
 * only decide what a *global setup* may carry.
 */

import type { PropValue } from './ptp'
import { DPC_DateTimeSet, isControl } from './sony'
import { VALUE_LABELS } from './sony-values'

export type GroupId = 'exposure' | 'whiteBalance' | 'picture' | 'movie' | 'focus' | 'body' | 'other'

export const GROUPS: { id: GroupId; codes: number[] }[] = [
  { id: 'exposure', codes: [0x500e, 0xd001, 0x5007, 0xd20d, 0xd21e, 0xd226, 0x5010, 0xd224, 0x500b] },
  { id: 'whiteBalance', codes: [0x5005, 0xd20f, 0xd210, 0xd21c] },
  { id: 'picture', codes: [0xd23f, 0xd03c, 0xd240, 0xd201, 0xd200] },
  { id: 'movie', codes: [0xd241, 0xd242] },
  { id: 'focus', codes: [0x500a, 0xd007, 0xd22c, 0xd255] },
  { id: 'body', codes: [0xd0d9, 0xd0db, 0xd0df] },
]

export function groupOf(code: number): GroupId {
  return GROUPS.find((g) => g.codes.includes(code))?.id ?? 'other'
}

/**
 * Never written back, neither from a backup nor from a global setup:
 * buttons, the write-only clock (it has its own step) and lens positions —
 * restoring those would drive the lens of a camera that is on a rig.
 */
const NEVER_SYNC = new Set<number>([
  DPC_DateTimeSet,
  0x5009, // FocusDistance
  0xd004, // FocalDistanceInMeter
  0xd005, // FocalDistanceInFeet
  0xd214, // Zoom
  0xd24c, // FocalPosition
  0xd230, // FocusMagnifierPosition
])

export function isSyncable(code: number): boolean {
  return !isControl(code) && !NEVER_SYNC.has(code)
}

/**
 * Write order. A Sony body only accepts shutter/ISO/aperture once the
 * exposure mode allows them, and movie format before frame-dependent values.
 * Whatever still fails is retried in a second pass (see sync.ts).
 */
const PRIORITY: Record<number, number> = {
  0x500e: 0, // exposure program
  0xd241: 1, // movie file format
  0xd242: 1, // movie recording setting
  0xd001: 2, // iris mode
  0x5005: 2, // white balance mode before colour temperature
  0x500a: 2, // focus mode
}

export function priority(code: number): number {
  return PRIORITY[code] ?? 5
}

// ── Display ──────────────────────────────────────────────────────────────

const WB: Record<number, string> = {
  0x0002: 'Auto', 0x0004: 'Daylight', 0x8011: 'Shade', 0x8010: 'Cloudy', 0x0006: 'Tungsten',
  0x8001: 'Fluor. warm', 0x8002: 'Fluor. cool', 0x8003: 'Fluor. day white', 0x8004: 'Fluor. daylight',
  0x0007: 'Flash', 0x8012: 'Color temp.', 0x8020: 'Custom 1', 0x8021: 'Custom 2', 0x8022: 'Custom 3',
  0x8023: 'Custom', 0x8030: 'Underwater auto',
}

// Values from libgphoto2 config.c. Mode-3 bodies (FX3, A7S III) report
// 32 bit with the classic code in the low half (0x00010002 = P).
const PROGRAM: Record<number, string> = {
  0x0001: 'M', 0x0002: 'P', 0x0003: 'A', 0x0004: 'S',
  0x8050: 'Movie P', 0x8051: 'Movie A', 0x8052: 'Movie S', 0x8053: 'Movie M',
  0x8080: 'HFR P', 0x8081: 'HFR A', 0x8082: 'HFR S', 0x8083: 'HFR M',
  0x8084: 'S&Q P', 0x8085: 'S&Q A', 0x8086: 'S&Q S', 0x8087: 'S&Q M',
}

export function formatValue(code: number, value: PropValue): string {
  if (typeof value !== 'number') return Array.isArray(value) ? value.join(', ') : String(value)
  switch (code) {
    case 0x5007:
      return value === 0 || value === 0xfffe ? '—' : `f/${(value / 100).toFixed(1)}`
    case 0xd20d: {
      if (value === 0) return 'Bulb'
      const num = value >>> 16
      const den = value & 0xffff
      return num === 1 ? `1/${den}` : den === 1 ? `${num}"` : `${num / den}"`
    }
    case 0xd21e:
    case 0xd226:
      return (value & 0xffffff) === 0xffffff ? 'ISO Auto' : `ISO ${value & 0xffffff}`
    case 0xd20f:
      return `${value} K`
    case 0x5010:
    case 0xd224: {
      const ev = value > 0x7fff ? value - 0x10000 : value
      return `${ev >= 0 ? '+' : ''}${(ev / 1000).toFixed(1)} EV`
    }
    case 0x5005:
      return WB[value] ?? VALUE_LABELS[0x5005]?.[value] ?? `0x${value.toString(16)}`
    case 0x500e:
      return PROGRAM[value & 0xffff] ?? `0x${value.toString(16)}`
    case 0xd23f:
      return value === 0 ? 'PP off' : `PP${value}`
    default: {
      const label = VALUE_LABELS[code]?.[value]
      if (label) return label
      return value > 255 ? `0x${value.toString(16).toUpperCase()}` : String(value)
    }
  }
}
