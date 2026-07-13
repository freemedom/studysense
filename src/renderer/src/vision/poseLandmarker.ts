import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from '@mediapipe/tasks-vision'

let landmarker: PoseLandmarker | null = null

async function createLandmarker(delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  const wasmPath = `${import.meta.env.BASE_URL}wasm`
  const vision = await FilesetResolver.forVisionTasks(wasmPath)

  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/models/pose_landmarker_lite.task',
      delegate
    },
    runningMode: 'VIDEO',
    numPoses: 1
  })
}

export async function initPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarker) return landmarker

  try {
    landmarker = await createLandmarker('GPU')
  } catch (gpuErr) {
    console.warn('[StudySense] Pose GPU delegate failed, retrying with CPU:', gpuErr)
    landmarker = await createLandmarker('CPU')
  }

  return landmarker
}

export function detectPose(
  video: HTMLVideoElement,
  timestampMs: number
): PoseLandmarkerResult | null {
  if (!landmarker) return null
  return landmarker.detectForVideo(video, timestampMs)
}
