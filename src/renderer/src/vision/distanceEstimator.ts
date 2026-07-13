import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { FACE_RATIO_FAR, FACE_RATIO_NEAR } from '../constants/thresholds'
import type { DistanceStatus } from '../types/metrics'

/**
 * Proxy for screen distance from face landmark span in the image.
 *
 * MediaPipe `NormalizedLandmark` coordinates are normalized to the image frame:
 * x and y are in [0, 1] (0 = left/top edge, 1 = right/bottom edge), independent
 * of pixel resolution. Closer to the camera → face appears wider → larger span.
 */
export function estimateFaceRatio(landmarks: NormalizedLandmark[]): number {
  let minX = 1
  let maxX = 0
  for (const p of landmarks) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
  }
  // Horizontal face width in normalized coords (leftmost to rightmost landmark).
  return maxX - minX
}

/** Map face width ratio to too_near / good / too_far using fixed thresholds. */
export function estimateDistanceStatus(faceRatio: number): DistanceStatus {  if (faceRatio <= 0) return 'none'
  if (faceRatio > FACE_RATIO_NEAR) return 'too_near'
  if (faceRatio < FACE_RATIO_FAR) return 'too_far'
  return 'good'
}
