/**
 * A model profile: what a camera model offers — data type, allowed values or
 * range — for the settings a global setup can carry. Read once from a real
 * body; lets the app prepare setups without that camera connected.
 */

import { GROUPS, isSyncable } from './catalog'
import type { PropDesc } from './sony'

export interface ModelProfile {
  model: string
  firmware: string
  /** When and from what it was read — a profile is a snapshot of one body. */
  source: string
  props: PropDesc[]
}

const PROFILE_CODES = new Set(GROUPS.flatMap((g) => g.codes))

export function profileFrom(model: string, firmware: string, props: PropDesc[], source = new Date().toISOString().slice(0, 10)): ModelProfile {
  return {
    model,
    firmware,
    source,
    // Offline the camera's lock state is unknown: offer every key setting.
    props: props.filter((p) => PROFILE_CODES.has(p.code) && isSyncable(p.code)).map((p) => ({ ...p, writable: true, enabled: 1 })),
  }
}
