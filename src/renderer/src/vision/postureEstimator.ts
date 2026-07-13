// Compared against a user-specific `PostureBaseline` from a 5 s calibration (`PostureCalibrator`) to detect slouching / tilt / uneven shoulders.

// * ## Landmarks used (see `poseLandmarks.ts`)
//  * - Pose nose (0), left shoulder (11), right shoulder (12)
//  * - Face nose preferred over pose nose when both are available (finer head position)
//  *
//  * ## Metrics computed
//  * 1. **neckAngleDeg** — angle of the nose→shoulder-mid vector from vertical (degrees).
//  *    Larger values suggest forward head / neck flexion.
//  * 2. **shoulderTiltDeg** — angle of the line between shoulders in the image plane.
//  *    Deviation from baseline indicates head or torso lean.
//  * 3. **forwardRatio** — (nose.y − shoulderMid.y) / shoulderWidth; head drop relative to shoulders.
//  * 4. **shoulderUnevenRatio** — vertical shoulder height difference / shoulderWidth.
//  *
//  * ## Classification (all matching issues returned)
//  * | Issue | Condition |
//  * |-------|-----------|
//  * | forward_head | neck angle or forwardRatio exceeds baseline + delta |
//  * | shoulder_uneven | shoulderUnevenRatio > SHOULDER_UNEVEN_RATIO |
//  * | head_tilt | shoulder tilt differs from baseline by > HEAD_TILT_DELTA |
//  * | good | none of the above |
//  *
//  * Without baseline (during calibration), returns raw metrics with `postureIssues: []`.


/**
 * Upper-body posture estimator from MediaPipe Pose + Face landmarks.
 *
 * Classification uses three decoupled 2D signals vs personal baseline:
 * - forward_head  → forwardRatio (signed vertical nose offset vs shoulders; increases when leaning forward)
 * - head_tilt     → headOffsetRatio (nose horizontal offset from shoulder mid)
 * - shoulder_uneven → shoulderUnevenRatio (left/right shoulder height diff)
 *
 * neckAngleDeg / shoulderTiltDeg are computed for display only.
 */
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import {
  FORWARD_RATIO_DELTA,
  HEAD_OFFSET_DELTA,
  SHOULDER_UNEVEN_DELTA
} from '../constants/thresholds'
import {
  MIN_LANDMARK_VISIBILITY,
  MIN_SHOULDER_WIDTH_RATIO,
  POSE_LEFT_SHOULDER,
  POSE_NOSE,
  POSE_RIGHT_SHOULDER
} from '../constants/poseLandmarks'
import type { ActivePostureIssue, PostureBaseline, PostureMetrics } from '../types/metrics'

/** Stable display order when multiple posture issues are active. */
export const POSTURE_ISSUE_ORDER: ActivePostureIssue[] = [
  'forward_head',
  'shoulder_uneven',
  'head_tilt'
]

const UNKNOWN_METRICS: PostureMetrics = {
  neckAngleDeg: 0,
  shoulderTiltDeg: 0,
  forwardRatio: 0,
  headOffsetRatio: 0,
  shoulderWidth: 0,
  shoulderUnevenRatio: 0,
  postureIssues: [],
  postureScore: 0,
  trackable: false
}

/** MediaPipe visibility score and in-bounds check; filters occluded / off-frame points. */
function landmarkVisible(p: NormalizedLandmark): boolean {
  const visibility = p.visibility ?? 1
  return (
    visibility >= MIN_LANDMARK_VISIBILITY &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1
  )
}

/** Angle (degrees) between vector (dx, dy) and straight up. Image y grows downward, so -dy is "up". */
function angleDegFromVertical(dx: number, dy: number): number {
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return 0
  const cos = Math.max(-1, Math.min(1, -dy / len))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Shoulder line angle in the image plane (0° = level shoulders). */
function shoulderTiltDeg(left: NormalizedLandmark, right: NormalizedLandmark): number {
  return (Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI
}

/** Collect every posture issue that exceeds thresholds vs personal baseline. */
function collectPostureIssues(
  forwardRatio: number,
  headOffsetRatio: number,
  shoulderUnevenRatio: number,
  baseline: PostureBaseline
): ActivePostureIssue[] {
  const issues: ActivePostureIssue[] = []
  const forwardHead = forwardRatio > baseline.forwardRatio + FORWARD_RATIO_DELTA
  const headTilt = headOffsetRatio > baseline.headOffsetRatio + HEAD_OFFSET_DELTA
  const shoulderUneven =
    shoulderUnevenRatio > baseline.shoulderUnevenRatio + SHOULDER_UNEVEN_DELTA

  if (forwardHead) issues.push('forward_head')
  if (shoulderUneven) issues.push('shoulder_uneven')
  if (headTilt) issues.push('head_tilt')
  return issues
}

/**
 * Continuous 0–1 deviation score: max normalized excess across all four signals, capped at 1.
 * Used for the posture bar in MetricsPanel.
 */
function computePostureScore(
  forwardRatio: number,
  headOffsetRatio: number,
  shoulderUnevenRatio: number,
  baseline: PostureBaseline
): number {
  const forwardExcess = Math.max(0, forwardRatio - baseline.forwardRatio) / FORWARD_RATIO_DELTA
  const headOffsetExcess =
    Math.max(0, headOffsetRatio - baseline.headOffsetRatio) / HEAD_OFFSET_DELTA
  const unevenExcess =
    Math.max(0, shoulderUnevenRatio - baseline.shoulderUnevenRatio) / SHOULDER_UNEVEN_DELTA
  return Math.min(1, Math.max(forwardExcess, headOffsetExcess, unevenExcess))
}

/**
 * Estimate posture metrics for one frame.
 *
 * @param poseLandmarks — MediaPipe Pose 33-point set (normalized [0,1] coords).
 * @param faceNose — Face Landmarker nose tip; preferred over pose nose when present.
 * @param baseline — Personal good posture from calibration; null during calibration window.
 */
export function estimatePosture(
  poseLandmarks: NormalizedLandmark[] | undefined,
  faceNose: { x: number; y: number } | undefined,
  baseline: PostureBaseline | null
): PostureMetrics {
  if (!poseLandmarks?.length) return UNKNOWN_METRICS

  const leftShoulder = poseLandmarks[POSE_LEFT_SHOULDER]
  const rightShoulder = poseLandmarks[POSE_RIGHT_SHOULDER]
  const poseNose = poseLandmarks[POSE_NOSE]

  if (!leftShoulder || !rightShoulder || !poseNose) return UNKNOWN_METRICS
  if (!landmarkVisible(leftShoulder) || !landmarkVisible(rightShoulder)) {
    return UNKNOWN_METRICS
  }

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2
  const shoulderWidth = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y)

  // Reject face-only framing: shoulders too close together in normalized coords.
  if (shoulderWidth < MIN_SHOULDER_WIDTH_RATIO) return UNKNOWN_METRICS

  const nose = faceNose ?? poseNose
  const neckDx = nose.x - shoulderMidX
  const neckDy = nose.y - shoulderMidY
  const neckAngleDeg = angleDegFromVertical(neckDx, neckDy)
  const tiltDeg = shoulderTiltDeg(leftShoulder, rightShoulder)

  // How far the nose sits below shoulder midline, normalized by shoulder span.
  // Signed vertical offset: positive = nose below shoulder midline (forward lean), negative = above (normal).
  const forwardRatio = (nose.y - shoulderMidY) / shoulderWidth
  const headOffsetRatio = Math.abs(nose.x - shoulderMidX) / shoulderWidth
  const shoulderUnevenRatio = Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth

  // Calibration phase: collect raw angles only; no issues/score until baseline exists.
  if (!baseline) {
    return {
      neckAngleDeg,
      shoulderTiltDeg: tiltDeg,
      forwardRatio,
      headOffsetRatio,
      shoulderWidth,
      shoulderUnevenRatio,
      postureIssues: [],
      postureScore: 0,
      trackable: true
    }
  }

  const postureIssues = collectPostureIssues(
    forwardRatio,
    headOffsetRatio,
    shoulderUnevenRatio,
    baseline
  )
  const postureScore = computePostureScore(
    forwardRatio,
    headOffsetRatio,
    shoulderUnevenRatio,
    baseline
  )

  return {
    neckAngleDeg,
    shoulderTiltDeg: tiltDeg,
    forwardRatio,
    headOffsetRatio,
    shoulderWidth,
    shoulderUnevenRatio,
    postureIssues,
    postureScore,
    trackable: true
  }
}

/** User-facing alert copy for one active posture issue (Chinese UI strings). */
export function postureAlertMessage(issue: ActivePostureIssue): string {
  switch (issue) {
    case 'forward_head':
      return 'Tuck your chin in and straighten your neck'
    case 'head_tilt':
      return 'Keep your head level — avoid tilting'
    case 'shoulder_uneven':
      return 'Relax your shoulders and keep them level'
  }
}

export function postureAlertMessages(issues: ActivePostureIssue[]): string[] {
  return issues.map(postureAlertMessage)
}
