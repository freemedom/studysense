import type { Category } from '@mediapipe/tasks-vision'
import {
  BLINK_RATE_LOW,
  BROW_RESTLESS,
  EAR_TIRED,
  EAR_TIRED_SUSTAIN_RATIO,
  GAZE_DOWN_DISTRACTED,
  HEAD_DOWN_DISTRACTED_DELTA,
  HEAD_JITTER_RESTLESS,
  JAW_OPEN_SUSTAIN_RATIO,
  JAW_OPEN_YAWN,
  MOOD_HOLD_MS,
  MOOD_SMOOTH_MS,
  MOUTH_TENSION_RESTLESS,
  NOSE_BASELINE_MS,
  NOSE_Y_DOWN_DISTRACTED
} from '../constants/thresholds'
import type { Mood, MoodSignals, PostureBaseline } from '../types/metrics'

export type MoodUpdateResult = {
  mood: Mood
  signals: MoodSignals | null
}

/** Read a single MediaPipe face blendshape score by category name (0 if missing). */
function blendScore(blendshapes: Category[] | undefined, name: string): number {
  return blendshapes?.find((b) => b.categoryName === name)?.score ?? 0
}

/** Read blendshape by MediaPipe fixed index, falling back to category name. */
function blendScoreAt(
  blendshapes: Category[] | undefined,
  index: number,
  name: string
): number {
  return blendshapes?.find((b) => b.index === index)?.score ?? blendScore(blendshapes, name)
}

function browTension(blendshapes: Category[] | undefined): number {
  return (
    blendScoreAt(blendshapes, 1, 'browDownLeft') +
    blendScoreAt(blendshapes, 2, 'browDownRight') +
    blendScoreAt(blendshapes, 3, 'browInnerUp') * 0.5
  )
}

function mouthTension(blendshapes: Category[] | undefined): number {
  return (
    blendScoreAt(blendshapes, 30, 'mouthFrownLeft') +
    blendScoreAt(blendshapes, 31, 'mouthFrownRight') +
    blendScoreAt(blendshapes, 36, 'mouthPressLeft') +
    blendScoreAt(blendshapes, 37, 'mouthPressRight')
  )
}

function jawOpenScore(blendshapes: Category[] | undefined): number {
  return blendScoreAt(blendshapes, 25, 'jawOpen')
}

function gazeDownScore(blendshapes: Category[] | undefined): number {
  return (
    blendScoreAt(blendshapes, 11, 'eyeLookDownLeft') +
    blendScoreAt(blendshapes, 12, 'eyeLookDownRight')
  )
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Heuristic mood estimator for the study session UI.
 *
 * Called once per vision frame from `useVisionLoop` with outputs from BlinkDetector
 * and MediaPipe Face Landmarker. Returns a single `Mood` label used by MetricsPanel,
 * fatigue scoring, and break suggestions.
 *
 * ## Inputs (per frame)
 * - `blendshapes` — MediaPipe ARKit-style face coefficients in [0, 1].
 * - `nose` — landmark index 1 (nose tip); proxy for head pose in normalized image space.
 * - `blinksPerMinute` — rolling count over the last 60 s (see `BLINK_HISTORY_MS`).
 * - `ear` — Eye Aspect Ratio; lower values mean more closed / droopy eyelids.
 *
 * ## Signals computed inside `update`
 * 1. **headJitter** — sum of Euclidean distances between consecutive nose positions
 *    over a 2 s sliding window. Captures fidgeting / looking away without training
 *    a separate head-pose model. Coordinates are normalized [0, 1], so thresholds
 *    are tuned empirically for webcam distance.
 * 2. **brow** — sum of `browDownLeft`, `browDownRight`, and `browInnerUp` scores.
 *    Raised inner brows and lowered outer brows often appear under concentration strain.
 * 3. **mouth** — sum of `mouthFrownLeft` and `mouthFrownRight`.
 *    - `mouthFrownLeft`: blendshape weight for the **left mouth corner** pulling **downward**
 *      (left-side frown / downturned lip); 0 = neutral, 1 = fully activated.
 *    - `mouthFrownRight`: same deformation on the **right mouth corner**.
 *    Together they approximate a frown (inverse of smile); higher values suggest discomfort,
 *    strain, or negative affect during long screen use.
 *
 * ## Decision tree (first match wins)
 * | Condition | Mood | Rationale |
 * |-----------|------|-----------|
 * | no nose landmark | `unknown` | face not reliably tracked |
 * | blinks/min < 10 OR EAR < 0.19 | `tired` | low blink rate and droopy eyes are classic fatigue cues (EAR 0.19 is slightly below the blink-close threshold 0.21) |
 * | headJitter > 0.035 OR brow > 1.2 OR mouth > 0.8 | `restless` | physical restlessness or expressive tension while still awake |
 * | otherwise | `focused` | stable head, normal blinks, neutral-to-attentive face |
 *
 * `tired` is checked before `restless` so physiological fatigue is not masked by movement.
 */
export class ExpressionEstimator {
  /** Recent nose positions used to measure head jitter over a sliding window. */
  private headHistory: { x: number; y: number; t: number }[] = []
  private signalSamples: {
    ear: number
    brow: number
    mouth: number
    jawOpen: number
    gazeDown: number
    headJitter: number
    t: number
  }[] = []
  private noseYBaselineSamples: { y: number; t: number }[] = []
  private currentMood: Mood = 'unknown'
  private candidateMood: Mood | null = null
  private candidateSince: number | null = null
  private restlessSince: number | null = null
  private distractedSince: number | null = null

  /** Clear head-movement history when a new study session starts. */
  reset(): void {
    this.headHistory = []
    this.signalSamples = []
    this.noseYBaselineSamples = []
    this.currentMood = 'unknown'
    this.candidateMood = null
    this.candidateSince = null
    this.restlessSince = null
    this.distractedSince = null
  }

  private getNoseBaseline(now: number): number | null {
    this.noseYBaselineSamples = this.noseYBaselineSamples.filter(
      (s) => now - s.t <= NOSE_BASELINE_MS
    )
    if (this.noseYBaselineSamples.length < 15) return null
    return median(this.noseYBaselineSamples.map((s) => s.y))
  }

  /**
   * Ingest one frame of face data and return the current mood label.
   * All thresholds are fixed constants chosen for demo stability, not ML calibration.
   */
  update(
    blendshapes: Category[] | undefined,
    nose: { x: number; y: number } | undefined,
    blinksPerMinute: number,
    ear: number,
    now = Date.now(),
    blinkRateReady = true,
    forwardRatio = 0,
    postureBaseline: PostureBaseline | null = null
  ): MoodUpdateResult {
    if (!nose) {
      this.currentMood = 'unknown'
      this.candidateMood = null
      this.candidateSince = null
      this.restlessSince = null
      this.distractedSince = null
      return { mood: 'unknown', signals: null }
    }

    this.noseYBaselineSamples.push({ y: nose.y, t: now })

    // Append current nose tip; drop samples older than 2 s so jitter reflects recent behavior.
    this.headHistory.push({ x: nose.x, y: nose.y, t: now })
    this.headHistory = this.headHistory.filter((p) => now - p.t <= 2000)

    // Total path length of the nose over the window (requires ≥3 points to be meaningful).
    // headJitter: cumulative Euclidean distance the nose tip travels across consecutive
    // frames in the 2 s window. Each hop is sqrt((Δx)² + (Δy)²) in normalized [0,1] image
    // coords — a proxy for head fidgeting / looking around without a dedicated pose model.
    // Require >2 samples so at least two frame-to-frame segments exist before scoring.
    let headJitter = 0
    if (this.headHistory.length > 2) {
      for (let i = 1; i < this.headHistory.length; i++) {
        const prev = this.headHistory[i - 1]
        const curr = this.headHistory[i]
        // Math.hypot(dx, dy) = straight-line distance between successive nose positions.
        headJitter += Math.hypot(curr.x - prev.x, curr.y - prev.y)
      }
    }

    // Aggregate blendshape groups; each score is already in [0, 1], sums can exceed 1.
    // Brow tension proxy (MediaPipe ARKit blendshapes, each score in [0, 1]):
    // - browDownLeft:  left outer brow pulls downward (furrow / frown on that side).
    // - browDownRight: right outer brow pulls downward (mirror of browDownLeft).
    // - browInnerUp:   inner brow corners raise (often seen with concentration or worry).
    // Summed score > 1.2 suggests strained or restless expression → mood 'restless'.
    const brow = browTension(blendshapes)
    // Mouth tension: frown corners + lip press (scheme B); not a smile metric.
    const mouth = mouthTension(blendshapes)
    const jawOpen = jawOpenScore(blendshapes)
    const gazeDown = gazeDownScore(blendshapes)

    this.signalSamples.push({ ear, brow, mouth, jawOpen, gazeDown, headJitter, t: now })
    this.signalSamples = this.signalSamples.filter((s) => now - s.t <= MOOD_SMOOTH_MS)

    const n = this.signalSamples.length
    const smoothedBrow = n > 0 ? this.signalSamples.reduce((sum, s) => sum + s.brow, 0) / n : brow
    const smoothedMouth =
      n > 0 ? this.signalSamples.reduce((sum, s) => sum + s.mouth, 0) / n : mouth
    const smoothedJitter =
      n > 0 ? this.signalSamples.reduce((sum, s) => sum + s.headJitter, 0) / n : headJitter
    const smoothedJawOpen =
      n > 0 ? this.signalSamples.reduce((sum, s) => sum + s.jawOpen, 0) / n : jawOpen
    const smoothedGazeDown =
      n > 0 ? this.signalSamples.reduce((sum, s) => sum + s.gazeDown, 0) / n : gazeDown
    const lowEarRatio =
      n > 0
        ? this.signalSamples.filter((s) => s.ear < EAR_TIRED).length / n
        : ear < EAR_TIRED
          ? 1
          : 0
    const highJawOpenRatio =
      n > 0
        ? this.signalSamples.filter((s) => s.jawOpen > JAW_OPEN_YAWN).length / n
        : jawOpen > JAW_OPEN_YAWN
          ? 1
          : 0

    const noseBaseline = this.getNoseBaseline(now)
    const headDown = postureBaseline
      ? forwardRatio > postureBaseline.forwardRatio + HEAD_DOWN_DISTRACTED_DELTA
      : noseBaseline !== null && nose.y > noseBaseline + NOSE_Y_DOWN_DISTRACTED
    const lookingDownStrong = smoothedGazeDown > GAZE_DOWN_DISTRACTED && headDown

    // Step 1 — fatigue: infrequent blinks, partially closed eyes, or sustained yawn (jaw open).
    const tiredFromBlinks = blinkRateReady && blinksPerMinute < BLINK_RATE_LOW
    const tiredFromEar = lowEarRatio >= EAR_TIRED_SUSTAIN_RATIO && !lookingDownStrong
    const tiredFromYawn = highJawOpenRatio >= JAW_OPEN_SUSTAIN_RATIO
    const rawTired = tiredFromBlinks || tiredFromEar || tiredFromYawn

    // Step 2 — distraction: looking down (e.g. phone) via gaze + head pitch.
    const distractedNow =
      !rawTired && smoothedGazeDown > GAZE_DOWN_DISTRACTED && headDown
    if (distractedNow) {
      if (!this.distractedSince) this.distractedSince = now
    } else {
      this.distractedSince = null
    }
    const rawDistracted =
      distractedNow &&
      this.distractedSince !== null &&
      now - this.distractedSince >= MOOD_HOLD_MS
    const distractedHoldMs =
      distractedNow && this.distractedSince !== null ? now - this.distractedSince : 0

    const signals: MoodSignals = {
      headJitter: smoothedJitter,
      brow: smoothedBrow,
      mouth: smoothedMouth,
      jawOpen: smoothedJawOpen,
      gazeDown: smoothedGazeDown,
      headDown,
      rawTired,
      distractedHoldMs
    }

    // Step 3 — restlessness: large head motion or strained facial expression.
    // Uses composite brow/mouth tension scores with retuned thresholds (see thresholds.ts).
    const restlessNow =
      smoothedJitter > HEAD_JITTER_RESTLESS ||
      smoothedBrow > BROW_RESTLESS ||
      smoothedMouth > MOUTH_TENSION_RESTLESS
    if (restlessNow) {
      if (!this.restlessSince) this.restlessSince = now
    } else {
      this.restlessSince = null
    }
    const rawRestless =
      !rawTired &&
      !rawDistracted &&
      restlessNow &&
      this.restlessSince !== null &&
      now - this.restlessSince >= MOOD_HOLD_MS

    const rawMood: Mood = rawTired
      ? 'tired'
      : rawDistracted
        ? 'distracted'
        : rawRestless
          ? 'restless'
          : 'focused'

    // Step 4 — default attentive state when no fatigue, distraction, or restlessness cues fire.
    // Debounce mood label changes so single-frame spikes do not flicker the UI.
    let mood = this.currentMood
    if (rawMood === mood) {
      this.candidateMood = null
      this.candidateSince = null
    } else if (this.candidateMood !== rawMood) {
      this.candidateMood = rawMood
      this.candidateSince = now
    } else if (this.candidateSince !== null && now - this.candidateSince >= MOOD_HOLD_MS) {
      mood = rawMood
      this.currentMood = rawMood
      this.candidateMood = null
      this.candidateSince = null
    }

    if (mood === 'unknown') {
      mood = rawMood
      this.currentMood = rawMood
    }

    return { mood, signals }
  }
}
