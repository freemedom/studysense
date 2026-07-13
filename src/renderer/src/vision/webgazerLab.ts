import type { WebGazerInstance } from 'webgazer'
import type { WebGazerRegression } from '../types/gazeLab'
import { getSharedCameraStream } from '../utils/cameraStreamRegistry'

let webgazerInstance: WebGazerInstance | null = null
let loadPromise: Promise<WebGazerInstance> | null = null
let webgazerBooted = false

const SHARED_STREAM_WAIT_MS = 12_000
const VIDEO_DIM_WAIT_MS = 8_000

async function loadWebGazer(): Promise<WebGazerInstance> {
  if (webgazerInstance) return webgazerInstance
  if (!loadPromise) {
    loadPromise = import('webgazer').then((mod) => {
      webgazerInstance = mod.default
      return webgazerInstance
    })
  }
  return loadPromise
}

function hideWebGazerDom(): void {
  const ids = [
    'webgazerVideoContainer',
    'webgazerVideoFeed',
    'webgazerFaceOverlay',
    'webgazerFaceFeedbackBox',
    'webgazerGazeDot'
  ]
  for (const id of ids) {
    const el = document.getElementById(id)
    if (el) {
      el.style.display = 'none'
      el.style.visibility = 'hidden'
      el.style.opacity = '0'
      el.style.pointerEvents = 'none'
    }
  }
}

/**
 * Poll cameraStreamRegistry until MediaPipe (useVisionLoop) publishes a live,
 * enabled video track. WebGazer must not attach to a stream before this,
 * otherwise srcObject swap leaves TF canvases at 0×0.
 */
async function waitForSharedCameraStream(): Promise<MediaStream> {
  const deadline = Date.now() + SHARED_STREAM_WAIT_MS
  while (Date.now() < deadline) {
    const stream = getSharedCameraStream()
    const live = stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
    if (stream && live) return stream
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('MediaPipe camera not ready — wait for the camera preview to load')
}

/**
 * After changing video.srcObject, wait until the element exposes non-zero
 * videoWidth/videoHeight. TensorFlow face-mesh rejects 0×0 textures without this.
 */
function waitForVideoDimensions(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('WebGazer video has no frame dimensions')),
      VIDEO_DIM_WAIT_MS
    )
    const check = (): void => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        window.clearTimeout(timer)
        video.removeEventListener('loadeddata', check)
        video.removeEventListener('loadedmetadata', check)
        video.removeEventListener('resize', check)
        resolve()
      }
    }
    video.addEventListener('loadeddata', check)
    video.addEventListener('loadedmetadata', check)
    video.addEventListener('resize', check)
    void video.play().catch(() => undefined)
    check()
  })
}

/**
 * WebGazer's begin() sizes internal canvases from its own getUserMedia stream.
 * When we replace #webgazerVideoFeed with the shared stream, those canvases are
 * stale unless we mirror the new intrinsic frame size (same as setInternalVideoBufferSizes).
 */
function syncWebGazerInternalCanvasSizes(video: HTMLVideoElement): void {
  const w = video.videoWidth
  const h = video.videoHeight
  if (w <= 0 || h <= 0) return
  for (const id of ['webgazerVideoCanvas', 'webgazerFaceOverlay']) {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null
    if (canvas) {
      canvas.width = w
      canvas.height = h
    }
  }
}

/** Stop tracks on WebGazer's temporary stream so only the shared MediaPipe track stays open. */
function stopStreamIfOwned(video: HTMLVideoElement, keep: MediaStream): void {
  const current = video.srcObject
  if (current instanceof MediaStream && current !== keep) {
    current.getTracks().forEach((track) => track.stop())
  }
}

/**
 * Point WebGazer at the same MediaStream MediaPipe uses (cameraStreamRegistry).
 *
 * WebGazer has no API to inject an external stream at boot — begin() always calls
 * getUserMedia and wires #webgazerVideoFeed to that private stream. StudySense runs
 * MediaPipe first (useVisionLoop → setSharedCameraStream), so we:
 *
 *   1. Wait for the registry stream (live + enabled).
 *   2. Pause the gaze loop so no TF frame is in flight during the swap.
 *   3. Stop WebGazer's duplicate stream tracks (avoid two open camera handles).
 *   4. Assign shared → #webgazerVideoFeed and ensure tracks are enabled.
 *   5. Block until videoWidth/Height > 0 (loadedmetadata / loadeddata / resize).
 *   6. Resize webgazerVideoCanvas + webgazerFaceOverlay to match frame pixels.
 *   7. Refresh viewer layout via setVideoViewerSize (overlay boxes, not TF input).
 *   8. Hide WebGazer DOM chrome and resume the prediction loop.
 *
 * Called after begin() on first boot and on every resumeWebGazer() / re-entry so
 * session gaze and Gaze Lab always read from MediaPipe's camera, not a stale stream.
 */
async function applySharedStream(wg: WebGazerInstance): Promise<void> {
  const shared = await waitForSharedCameraStream()
  const video = document.getElementById('webgazerVideoFeed') as HTMLVideoElement | null
  if (!video) {
    throw new Error('WebGazer video element missing')
  }

  wg.pause()
  stopStreamIfOwned(video, shared)
  shared.getTracks().forEach((track) => {
    track.enabled = true
  })
  video.srcObject = shared
  await waitForVideoDimensions(video)
  syncWebGazerInternalCanvasSizes(video)
  wg.setVideoViewerSize(wg.params.videoViewerWidth, wg.params.videoViewerHeight)
  hideWebGazerDom()
  await wg.resume()
}

function configureWebGazer(wg: WebGazerInstance, regression: WebGazerRegression): void {
  wg.params.videoViewerWidth = 640
  wg.params.videoViewerHeight = 480
  wg.params.camConstraints = {
    video: {
      width: { min: 320, ideal: 640, max: 1920 },
      height: { min: 240, ideal: 480, max: 1080 },
      facingMode: 'user'
    }
  }
  wg.setRegression(regression)
  wg.showVideo(false)
  wg.showVideoPreview(false)
  wg.showPredictionPoints(false)
  wg.showFaceOverlay(false)
  wg.showFaceFeedbackBox(false)
  wg.applyKalmanFilter(true)
  wg.saveDataAcrossSessions(true)
  hideWebGazerDom()
}

export async function ensureWebGazerRunning(options: {
  regression: WebGazerRegression
}): Promise<WebGazerInstance> {
  const wg = await loadWebGazer()

  if (!webgazerBooted || !wg.isReady()) {
    configureWebGazer(wg, options.regression)
    await waitForSharedCameraStream()

    await wg.begin(() => {
      throw new Error('WebGazer could not access the camera')
    })

    await applySharedStream(wg)
    webgazerBooted = true
  } else {
    wg.setRegression(options.regression)
    await applySharedStream(wg)
    hideWebGazerDom()
  }

  wg.addMouseEventListeners()
  hideWebGazerDom()
  return wg
}

/** @deprecated Use ensureWebGazerRunning — kept for call-site clarity */
export async function beginWebGazer(options: {
  regression: WebGazerRegression
}): Promise<WebGazerInstance> {
  return ensureWebGazerRunning(options)
}

/**
 * WebGazer exposes two independent channels:
 * - clearGazeListener: who receives prediction output (setGazeListener callback per frame).
 * - removeMouseEventListeners / addMouseEventListeners: whether click/move writes calibration
 *   samples into the regression model (self-calibration). Does not affect the gaze callback.
 */

export async function pauseWebGazer(): Promise<void> {
  if (!webgazerInstance) return
  webgazerInstance.pause()
  // Stop mouse click/move from being recorded as training data (not the gaze output callback).
  webgazerInstance.removeMouseEventListeners()
}

export async function resumeWebGazer(): Promise<void> {
  if (!webgazerInstance) return
  await applySharedStream(webgazerInstance)
  // Re-enable document click/move self-calibration (orthogonal to setGazeListener).
  webgazerInstance.addMouseEventListeners()
  hideWebGazerDom()
}

export async function endWebGazer(): Promise<void> {
  if (!webgazerInstance) return
  webgazerInstance.removeMouseEventListeners()
  // Detach the per-frame prediction callback (liveGaze / proxy buffer consumers).
  webgazerInstance.clearGazeListener()
  webgazerInstance.end()
  webgazerBooted = false
  hideWebGazerDom()
}

export async function clearWebGazerData(): Promise<void> {
  const wg = await loadWebGazer()
  await wg.clearData()
}

export function getWebGazerInstance(): WebGazerInstance | null {
  return webgazerInstance
}

export function pctToPx(pct: [number, number]): { x: number; y: number } {
  return {
    x: (pct[0] / 100) * window.innerWidth,
    y: (pct[1] / 100) * window.innerHeight
  }
}

export function isValidGazePoint(
  point: { x: number; y: number } | null | undefined
): point is { x: number; y: number } {
  if (!point) return false
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
  return !(point.x === 0 && point.y === 0)
}

export function getTrainingPointCount(): number {
  if (!webgazerInstance) return 0
  try {
    const data = webgazerInstance.getRegression()?.[0] as { getData?: () => unknown[] } | undefined
    return data?.getData?.()?.length ?? 0
  } catch {
    return 0
  }
}
