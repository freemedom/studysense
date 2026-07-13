import {
  GAZE_MOOD_CENTER_REF,
  GAZE_MOOD_DISPERSION_REF,
  GAZE_MOOD_FIXATION_REF_MS,
  GAZE_MOOD_HOLD_MS,
  GAZE_MOOD_SACCADE_REF,
  GAZE_DISTRACTED_BELOW_BAND,
  GAZE_DISTRACTED_OFF_SCREEN,
  GAZE_FOCUS_CENTER_FACTOR,
  GAZE_FOCUS_DISPERSION_MAX,
  GAZE_FOCUS_DISPERSION_MIN,
  GAZE_FOCUS_FIXATION_MAX_FACTOR,
  GAZE_FOCUS_FIXATION_MIN_MS,
  GAZE_MW_CENTER_FACTOR,
  GAZE_MW_DISPERSION_FACTOR,
  GAZE_MW_FIXATION_FACTOR,
  GAZE_MW_FIXATION_MIN_MS,
  GAZE_MW_SACCADE_FACTOR
} from '../constants/gazeThresholds'
import type { GazeMood, GazeProxyMetrics } from '../types/gazeLab'

export interface GazeMoodInputs {
  metrics: GazeProxyMetrics
  baseline: GazeProxyMetrics | null
}

const EMPTY: GazeProxyMetrics = {
  centerDwellRatio: 0,
  belowBandRatio: 0,
  offScreenRatio: 0,
  gazeDispersion: 0,
  fixationRatePerMin: 0,
  meanFixationMs: 0,
  saccadeRatePerMin: 0,
  saccadeRateTrend: 0
}

export function emptyGazeProxyMetrics(): GazeProxyMetrics {
  return { ...EMPTY }
}

/**
 * Gaze-only mood heuristic from WebGazer proxy metrics (not face/mood fusion).
 *
 * After ~2 min of session, we snapshot a personal baseline; until then, fixed
 * fallback refs from gazeThresholds are used. Rules are checked top-to-bottom:
 *
 * 1. likelyDistracted — gaze often leaves the study area: too much time in the
 *    lower band (phone/desk) or off-screen / at screen edges.
 * 2. likelyMindWandering — relative to baseline: less center dwell, tighter
 *    dispersion, fewer saccades, but long fixations (staring without active
 *    scanning).
 * 3. likelyFocused — relative to baseline: solid center dwell and moderate
 *    dispersion; fixation duration checked when fixation data exists, otherwise
 *    center + dispersion only (no-go friendly).
 * 4. unknown — none of the above matched (or fixation data not usable yet).
 *
 * Committed mood changes are debounced elsewhere (see shouldCommitGazeMood).
 */
export function computeGazeMood(input: GazeMoodInputs): GazeMood {
  const { metrics, baseline } = input

  const centerRef = baseline?.centerDwellRatio ?? GAZE_MOOD_CENTER_REF
  const dispersionRef = baseline?.gazeDispersion ?? GAZE_MOOD_DISPERSION_REF
  const saccadeRef = baseline?.saccadeRatePerMin ?? GAZE_MOOD_SACCADE_REF
  const fixationRef = baseline?.meanFixationMs ?? GAZE_MOOD_FIXATION_REF_MS

  const fixationUsable = metrics.meanFixationMs > 0 || metrics.fixationRatePerMin > 0

  if (
    metrics.belowBandRatio >= GAZE_DISTRACTED_BELOW_BAND ||
    metrics.offScreenRatio >= GAZE_DISTRACTED_OFF_SCREEN
  ) {
    return 'likelyDistracted'
  }

  const mwFixationMin = Math.max(
    GAZE_MW_FIXATION_MIN_MS,
    fixationRef * GAZE_MW_FIXATION_FACTOR
  )
  const mindWandering =
    fixationUsable &&
    metrics.centerDwellRatio < centerRef * GAZE_MW_CENTER_FACTOR &&
    metrics.gazeDispersion < dispersionRef * GAZE_MW_DISPERSION_FACTOR &&
    metrics.saccadeRatePerMin < saccadeRef * GAZE_MW_SACCADE_FACTOR &&
    metrics.meanFixationMs >= mwFixationMin

  const focusFixationMax = fixationRef * GAZE_FOCUS_FIXATION_MAX_FACTOR
  const focusCenterMin = centerRef * GAZE_FOCUS_CENTER_FACTOR
  const focusDispersionMin = dispersionRef * GAZE_FOCUS_DISPERSION_MIN
  const focusDispersionMax = dispersionRef * GAZE_FOCUS_DISPERSION_MAX
  const focusGeometry =
    metrics.centerDwellRatio >= focusCenterMin &&
    metrics.gazeDispersion >= focusDispersionMin &&
    metrics.gazeDispersion <= focusDispersionMax
  const focusFixation =
    !fixationUsable ||
    (metrics.meanFixationMs >= GAZE_FOCUS_FIXATION_MIN_MS &&
      metrics.meanFixationMs <= focusFixationMax)
  const focused = focusGeometry && focusFixation

  if (mindWandering) return 'likelyMindWandering'
  if (focused) return 'likelyFocused'
  return 'unknown'
}

export function gazeMoodHoldMs(mood: GazeMood, since: number | null, now: number): number {
  if (!since || mood === 'unknown') return 0
  return now - since
}

export function shouldCommitGazeMood(
  candidate: GazeMood,
  current: GazeMood,
  candidateSince: number | null,
  now: number,
  holdMs = GAZE_MOOD_HOLD_MS
): boolean {
  if (candidate === current) return false
  if (candidate === 'unknown') return true
  if (!candidateSince) return false
  return now - candidateSince >= holdMs
}
