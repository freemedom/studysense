import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { BLINK_EAR_THRESHOLD, BLINK_HISTORY_MS, MOOD_BLINK_WARMUP_MS } from '../constants/thresholds'

const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const
const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function eyeAspectRatio(landmarks: NormalizedLandmark[], indices: readonly number[]): number {
  const p1 = landmarks[indices[0]]
  const p2 = landmarks[indices[1]]
  const p3 = landmarks[indices[2]]
  const p4 = landmarks[indices[3]]
  const p5 = landmarks[indices[4]]
  const p6 = landmarks[indices[5]]
  const vertical = dist(p2, p6) + dist(p3, p5)
  const horizontal = dist(p1, p4) * 2
  return horizontal > 0 ? vertical / horizontal : 0
}

export class BlinkDetector {
  private blinkCount = 0
  private wasClosed = false
  private blinkTimestamps: number[] = []
  private resetAt = Date.now()

  reset(): void {
    this.blinkCount = 0
    this.wasClosed = false
    this.blinkTimestamps = []
    this.resetAt = Date.now()
  }

  getCount(): number {
    return this.blinkCount
  }

  update(
    landmarks: NormalizedLandmark[],
    now = Date.now()
  ): { ear: number; blinkCount: number; blinksPerMinute: number; blinkRateReady: boolean } {
    const leftEar = eyeAspectRatio(landmarks, LEFT_EYE)
    const rightEar = eyeAspectRatio(landmarks, RIGHT_EYE)
    const ear = (leftEar + rightEar) / 2
    const isClosed = ear < BLINK_EAR_THRESHOLD

    if (isClosed && !this.wasClosed) {
      this.blinkCount += 1
      this.blinkTimestamps.push(now)
    }
    this.wasClosed = isClosed

    this.blinkTimestamps = this.blinkTimestamps.filter((t) => now - t <= BLINK_HISTORY_MS)
    const observationMs = Math.min(now - this.resetAt, BLINK_HISTORY_MS)
    const blinksPerMinute =
      observationMs >= 1000
        ? Math.round(this.blinkTimestamps.length / (observationMs / 60_000))
        : 0
    const blinkRateReady = observationMs >= MOOD_BLINK_WARMUP_MS

    return { ear, blinkCount: this.blinkCount, blinksPerMinute, blinkRateReady }
  }
}
