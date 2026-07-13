/**
 * Collects posture metrics during a fixed 5 s calibration window and produces
 * a personal `PostureBaseline` (median of valid frames).
 *
 * Used by `useVisionLoop` when `calibrationPhase === 'running'`. Each frame calls
 * `addSample` with output from `estimatePosture(..., baseline=null)`. After
 * `POSTURE_CALIBRATION_MS`, `finish()` returns medians that `collectPostureIssues`
 * compares against during the study session.
 *
 * Fallback: if fewer than 50% of frames were trackable (shoulders visible), fixed
 * defaults from `thresholds.ts` are used instead.
 */
import {
  DEFAULT_FORWARD_RATIO,
  DEFAULT_HEAD_OFFSET_RATIO,
  DEFAULT_NECK_ANGLE_DEG,
  DEFAULT_SHOULDER_TILT_DEG,
  DEFAULT_SHOULDER_UNEVEN_RATIO,
  POSTURE_CALIBRATION_MS
} from '../constants/thresholds'
import type { PostureBaseline, PostureMetrics } from '../types/metrics'

/** Per-frame snapshot stored during calibration (subset of PostureMetrics). */
interface CalibrationSample {
  neckAngleDeg: number
  shoulderTiltDeg: number
  forwardRatio: number
  headOffsetRatio: number
  shoulderUnevenRatio: number
}

/** Robust center value; less sensitive to outlier frames than mean. */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export class PostureCalibrator {
  private startedAt: number | null = null
  private samples: CalibrationSample[] = []
  /** Total frames passed to addSample (including non-trackable). */
  private frameCount = 0

  /** Clear timer, samples, and frame count (after finish or cancel). */
  reset(): void {
    this.startedAt = null
    this.samples = []
    this.frameCount = 0
  }

  /** Begin the calibration window at `now` (epoch ms). */
  start(now: number): void {
    this.startedAt = now
    this.samples = []
    this.frameCount = 0
  }

  /** True while a calibration window is open (between start and reset/finish). */
  isActive(): boolean {
    return this.startedAt !== null
  }

  /**
   * Ingest one frame from `estimatePosture`. Always increments frameCount;
   * only appends to samples when shoulders were trackable.
   */
  addSample(metrics: PostureMetrics): void {
    this.frameCount += 1
    if (!metrics.trackable) return
    this.samples.push({
      neckAngleDeg: metrics.neckAngleDeg,
      shoulderTiltDeg: metrics.shoulderTiltDeg,
      forwardRatio: metrics.forwardRatio,
      headOffsetRatio: metrics.headOffsetRatio,
      shoulderUnevenRatio: metrics.shoulderUnevenRatio
    })
  }

  /** Seconds remaining in the calibration countdown (for UI overlay). */
  getSecondsLeft(now: number): number {
    if (!this.startedAt) return 0
    const elapsed = now - this.startedAt
    return Math.max(0, Math.ceil((POSTURE_CALIBRATION_MS - elapsed) / 1000))
  }

  /** True when the calibration window has elapsed. */
  isComplete(now: number): boolean {
    if (!this.startedAt) return false
    return now - this.startedAt >= POSTURE_CALIBRATION_MS
  }

  /**
   * Build baseline from sample medians, or defaults if too few valid frames.
   * `usedFallback: true` when validRatio < 0.5 (shown in calibrationMessage).
   */
  finish(): { baseline: PostureBaseline; usedFallback: boolean } {
    const validRatio = this.frameCount > 0 ? this.samples.length / this.frameCount : 0
    const usedFallback = validRatio < 0.5 || this.samples.length === 0

    if (usedFallback) {
      return {
        baseline: {
          neckAngleDeg: DEFAULT_NECK_ANGLE_DEG,
          shoulderTiltDeg: DEFAULT_SHOULDER_TILT_DEG,
          forwardRatio: DEFAULT_FORWARD_RATIO,
          headOffsetRatio: DEFAULT_HEAD_OFFSET_RATIO,
          shoulderUnevenRatio: DEFAULT_SHOULDER_UNEVEN_RATIO
        },
        usedFallback: true
      }
    }

    return {
      baseline: {
        neckAngleDeg: median(this.samples.map((s) => s.neckAngleDeg)),
        shoulderTiltDeg: median(this.samples.map((s) => s.shoulderTiltDeg)),
        forwardRatio: median(this.samples.map((s) => s.forwardRatio)),
        headOffsetRatio: median(this.samples.map((s) => s.headOffsetRatio)),
        shoulderUnevenRatio: median(this.samples.map((s) => s.shoulderUnevenRatio))
      },
      usedFallback: false
    }
  }
}
