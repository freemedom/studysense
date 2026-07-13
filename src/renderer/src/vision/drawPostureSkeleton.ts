import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import {
  POSE_LEFT_SHOULDER,
  POSE_NOSE,
  POSE_RIGHT_SHOULDER
} from '../constants/poseLandmarks'
import type { ActivePostureIssue } from '../types/metrics'

export function drawPostureSkeleton(
  ctx: CanvasRenderingContext2D,
  poseLandmarks: NormalizedLandmark[],
  faceNose: { x: number; y: number } | undefined,
  width: number,
  height: number,
  postureIssues: ActivePostureIssue[]
): void {
  const left = poseLandmarks[POSE_LEFT_SHOULDER]
  const right = poseLandmarks[POSE_RIGHT_SHOULDER]
  const poseNose = poseLandmarks[POSE_NOSE]
  if (!left || !right || !poseNose) return

  const nose = faceNose ?? poseNose
  const shoulderMidX = ((left.x + right.x) / 2) * width
  const shoulderMidY = ((left.y + right.y) / 2) * height
  const leftX = left.x * width
  const leftY = left.y * height
  const rightX = right.x * width
  const rightY = right.y * height
  const noseX = nose.x * width
  const noseY = nose.y * height

  const bad = postureIssues.length > 0
  const shoulderColor = bad ? '#f87171' : '#fbbf24'
  const neckColor = bad ? '#f87171' : '#22d3ee'

  ctx.strokeStyle = shoulderColor
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(leftX, leftY)
  ctx.lineTo(rightX, rightY)
  ctx.stroke()

  ctx.strokeStyle = neckColor
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(shoulderMidX, shoulderMidY)
  ctx.lineTo(noseX, noseY)
  ctx.stroke()

  for (const p of [left, right, poseNose]) {
    ctx.beginPath()
    ctx.arc(p.x * width, p.y * height, 4, 0, Math.PI * 2)
    ctx.fillStyle = shoulderColor
    ctx.fill()
  }
}
