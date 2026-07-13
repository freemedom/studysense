/** 4×4 calibration grid — percent from top-left (corners at 10% / 90%). */
export const GAZE_CALIBRATION_POINTS: [number, number][] = [
  [10, 10],
  [37, 10],
  [63, 10],
  [90, 10],
  [10, 37],
  [37, 37],
  [63, 37],
  [90, 37],
  [10, 63],
  [37, 63],
  [63, 63],
  [90, 63],
  [10, 90],
  [37, 90],
  [63, 90],
  [90, 90]
]

/** Clicks per calibration target (same position, repeated looks). */
export const GAZE_CALIBRATION_CLICKS_PER_POINT = 2

/** Validation targets (offset from calibration grid). */
export const GAZE_VALIDATION_POINTS: [number, number][] = [
  [15, 15],
  [85, 15],
  [85, 85],
  [15, 85],
  [50, 50]
]

export const GAZE_VALIDATION_DURATION_MS = 2000
export const GAZE_VALIDATION_HIT_RADII_PX = [100, 150, 200] as const

export const GAZE_GO_MEAN_ERROR_PX = 150
export const GAZE_GO_HIT150_MIN = 0.5
export const GAZE_NO_GO_MEAN_ERROR_PX = 250
export const GAZE_NO_GO_HIT200_MIN = 0.3

/** Virtual AOI bands (fraction of viewport width/height). */
export const GAZE_CENTER_BAND = 0.5
export const GAZE_BELOW_BAND_TOP = 0.75
export const GAZE_EDGE_BAND = 0.1

/** Coarse fixation / saccade detection for noisy WebGazer streams. */
export const GAZE_FIXATION_DISPERSION_PX = 160
export const GAZE_FIXATION_MIN_MS = 250
export const GAZE_SACCADE_VELOCITY_PX_PER_MS = 1.75

export const GAZE_BASELINE_WINDOW_MS = 120_000
export const GAZE_DISPERSION_WINDOW_MS = 60_000
export const GAZE_METRICS_TICK_MS = 1000
export const GAZE_MOOD_HOLD_MS = 2000

/** Fallback refs when proxyBaseline is not yet set (first ~2 min of session). */
export const GAZE_MOOD_CENTER_REF = 0.45
export const GAZE_MOOD_DISPERSION_REF = 80
export const GAZE_MOOD_SACCADE_REF = 8
export const GAZE_MOOD_FIXATION_REF_MS = 600

/** Gaze mood — distracted (absolute AOI). Tuned high for noisy WebGazer / no-go. */
export const GAZE_DISTRACTED_BELOW_BAND = 0.5
export const GAZE_DISTRACTED_OFF_SCREEN = 0.45

/** Mind wandering — relative to baseline. */
export const GAZE_MW_CENTER_FACTOR = 0.55
export const GAZE_MW_DISPERSION_FACTOR = 0.45
export const GAZE_MW_SACCADE_FACTOR = 0.45
export const GAZE_MW_FIXATION_MIN_MS = 700
export const GAZE_MW_FIXATION_FACTOR = 1.25

/**
 * likelyFocused — all thresholds are relative to personal proxyBaseline (snapshot
 * at ~2 min). Before baseline exists, GAZE_MOOD_*_REF fallbacks apply.
 *
 * Geometry (always required):
 *   centerDwellRatio >= centerRef × CENTER_FACTOR
 *   gazeDispersion in [dispersionRef × DISPERSION_MIN, dispersionRef × DISPERSION_MAX]
 *
 * Fixation (when meanFixationMs or fixationRatePerMin > 0):
 *   meanFixationMs in [FIXATION_MIN_MS, fixationRef × FIXATION_MAX_FACTOR]
 * If fixation data is missing (common on noisy no-go streams), geometry alone suffices.
 *
 * Example with fallback refs (centerRef=0.45, dispersionRef=80px, fixationRef=600ms):
 *   center dwell ≥ 25%, dispersion 16–320px, fixation 150–960ms when usable.
 */
/** Min center dwell as a fraction of baseline center (0.55 → 55% of your norm). */
export const GAZE_FOCUS_CENTER_FACTOR = 0.55
/** Min dispersion vs baseline; filters out unrealistically tight “stare” clusters. */
export const GAZE_FOCUS_DISPERSION_MIN = 0.2
/** Max dispersion vs baseline; widened for noisy WebGazer (4× ≈ 320px at 80px ref). */
export const GAZE_FOCUS_DISPERSION_MAX = 4.0
/** Absolute floor for mean fixation duration when fixation metrics are present. */
export const GAZE_FOCUS_FIXATION_MIN_MS = 150
/** Max mean fixation as a multiple of baseline duration (1.6× personal norm). */
export const GAZE_FOCUS_FIXATION_MAX_FACTOR = 1.6

export const GAZE_LAB_REPORT_STORAGE_KEY = 'studylens_gaze_lab_reports'
export const GAZE_LAB_REPORT_MAX = 20
export const GAZE_CALIBRATED_STORAGE_KEY = 'studylens_gaze_calibrated'
