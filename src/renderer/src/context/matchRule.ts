import { pickStrictestMode } from './modeProfiles'
import type {
  ContextMatchResult,
  ContextRule,
  ContextSource,
  GeoPoint,
  StudyMode
} from '../types/context'

const DEFAULT_MODE: StudyMode = 'relax'

/**
 * Great-circle distance between two WGS84 coordinates (Haversine formula).
 * Used to test whether the user's current GPS position falls inside a
 * location rule's circular geofence (see `matchLocationRules`).
 *
 * @returns Distance in meters (Earth mean radius ≈ 6_371_000 m).
 */
function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  // Latitude/longitude deltas in radians.
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  // Haversine intermediate value `h` ∈ [0, 1]: squared half-chord length on the unit sphere.
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  // Central angle (radians) × Earth radius → arc length in meters.
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function matchWifiRules(rules: ContextRule[], ssid: string | null): ContextRule[] {
  if (!ssid) return []
  const normalized = ssid.trim().toLowerCase()
  return rules.filter(
    (rule) => rule.kind === 'wifi' && rule.ssid.trim().toLowerCase() === normalized
  )
}

function matchLocationRules(rules: ContextRule[], location: GeoPoint | null): ContextRule[] {
  if (!location) return []
  const matched: ContextRule[] = []
  for (const rule of rules) {
    if (rule.kind !== 'location') continue
    const distance = haversineMeters(location, { lat: rule.lat, lng: rule.lng })
    if (distance <= rule.radiusM) matched.push(rule)
  }
  return matched
}

function collectMatchingRules(
  rules: ContextRule[],
  ssid: string | null,
  location: GeoPoint | null
): ContextRule[] {
  const matched: ContextRule[] = []
  matched.push(...matchWifiRules(rules, ssid))
  matched.push(...matchLocationRules(rules, location))
  return matched
}

/** Pick one rule for UI attribution when several match the winning mode. */
function pickRepresentativeRule(matched: ContextRule[], activeMode: StudyMode): ContextRule {
  const withWinningMode = matched.filter((rule) => rule.mode === activeMode)
  const pool = withWinningMode.length > 0 ? withWinningMode : matched
  return pool.find((rule) => rule.kind === 'wifi') ?? pool[0]
}

export function matchAutoContextRule(input: {
  rules: ContextRule[]
  currentWifi: string | null
  currentLocation: GeoPoint | null
}): ContextMatchResult {
  return matchContextRule({ ...input, manualMode: null })
}

export function matchContextRule(input: {
  rules: ContextRule[]
  manualMode: StudyMode | null
  currentWifi: string | null
  currentLocation: GeoPoint | null
}): ContextMatchResult {
  if (input.manualMode) {
    return {
      activeMode: input.manualMode,
      contextSource: 'manual',
      matchedRuleId: null
    }
  }

  const matched = collectMatchingRules(
    input.rules,
    input.currentWifi,
    input.currentLocation
  )

  if (matched.length === 0) {
    return {
      activeMode: DEFAULT_MODE,
      contextSource: 'default',
      matchedRuleId: null
    }
  }

  const activeMode = pickStrictestMode(matched.map((rule) => rule.mode))
  const representative = pickRepresentativeRule(matched, activeMode)
  const contextSource: ContextSource = representative.kind === 'wifi' ? 'wifi' : 'location'

  return {
    activeMode,
    contextSource,
    matchedRuleId: representative.id
  }
}
