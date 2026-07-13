export type StudyMode = 'strict' | 'study' | 'relax'

/**
 * String literal union — `ContextSource` may only be one of these four strings (not any string).
 * TypeScript narrows types in `switch`/`if` and flags typos at compile time.
 * Describes *how* the active study mode was chosen (see `matchRule.ts` priority).
 * Describes which signal *attributed* the active mode in UI (see `matchRule.ts`):
 * manual lock; or the representative WiFi/location rule after strict > study > relax merge.
 */
export type ContextSource = 'wifi' | 'location' | 'manual' | 'default' | 'sync'

export type PeerModeEntry = {
  mode: StudyMode
  updatedAt: number
}
export type WifiContextRule = {
  id: string
  kind: 'wifi'
  ssid: string
  mode: StudyMode
  label?: string
  createdAt?: number
}

export type LocationContextRule = {
  id: string
  kind: 'location'
  lat: number
  lng: number
  radiusM: number
  mode: StudyMode
  label?: string
  createdAt?: number
}

export type ContextRule = WifiContextRule | LocationContextRule

export interface GeoPoint {
  lat: number
  lng: number
}

export interface ContextMatchResult {
  activeMode: StudyMode
  contextSource: ContextSource
  matchedRuleId: string | null
}
