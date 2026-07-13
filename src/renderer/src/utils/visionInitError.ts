export type VisionInitStage = 'face-model' | 'pose-model' | 'camera' | 'video'

export class VisionInitError extends Error {
  readonly stage: VisionInitStage
  readonly cause: unknown

  constructor(stage: VisionInitStage, cause: unknown) {
    super(formatVisionInitError(stage, cause))
    this.name = 'VisionInitError'
    this.stage = stage
    this.cause = cause
  }
}

function domExceptionDetail(err: DOMException): string {
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return [
        'Camera permission was denied.',
        'Likely fix: Windows Settings → Privacy → Camera → allow desktop apps;',
        'or macOS System Settings → Privacy & Security → Camera → enable StudySense.',
        'Then fully quit and restart the app.'
      ].join('\n')
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return [
        'No camera device was found.',
        'Likely fix: connect a webcam, disable "camera off" on laptops,',
        'or check Device Manager / System Information.'
      ].join('\n')
    case 'NotReadableError':
    case 'TrackStartError':
      return [
        'The camera exists but could not be opened.',
        'Likely fix: close Zoom, Teams, OBS, or other apps using the camera,',
        'then restart StudySense.'
      ].join('\n')
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return [
        'The requested resolution or facingMode is not supported.',
        'Likely fix: we can relax video constraints in code (already attempted on retry).'
      ].join('\n')
    case 'SecurityError':
      return 'Camera access requires a secure context. In Electron this usually means a misconfigured window or CSP.'
    case 'AbortError':
      return 'Camera request was aborted (often due to rapid mount/unmount in React StrictMode). Try refreshing or restarting the app.'
    default:
      return `Browser error (${err.name}): ${err.message}`
  }
}

function stringifyUnknown(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err instanceof DOMException) return `${err.name}: ${err.message}`
  if (err instanceof Event) {
    const target = err.target as { src?: string; href?: string } | null
    const src = target?.src ?? target?.href
    return src
      ? `Resource load failed (${err.type}): ${src}`
      : `Resource load failed (${err.type}) — often caused by CSP blocking external scripts`
  }
  return String(err)
}

function modelErrorDetail(err: unknown, modelName: string, modelFile: string, modelUrl: string): string {
  const msg = stringifyUnknown(err)
  const lines = [`MediaPipe / ${modelName} failed: ${msg}`]

  if (/fetch|network|Failed to load|ECONNREFUSED|ENOTFOUND|Content Security Policy|CSP/i.test(msg)) {
    lines.push(
      'Likely fix: MediaPipe WASM must load from local public/wasm/ (run: npm install).',
      'If you see CSP errors, ensure script-src includes \'self\' and \'wasm-unsafe-eval\'.'
    )
  }
  if (new RegExp(modelFile.replace('.', '\\.'), 'i').test(msg) || /model|404|not found/i.test(msg)) {
    lines.push(
      `Likely fix: ensure public/models/${modelFile} exists.`,
      `Re-download: ${modelUrl}`
    )
  }
  if (/webgl|gpu|GL|delegate/i.test(msg)) {
    lines.push(
      'Likely fix: GPU/WebGL issue — the app will retry with CPU delegate.',
      'Update graphics drivers or run: npm run dev again after the CPU fallback patch.'
    )
  }
  if (/wasm|WebAssembly/i.test(msg)) {
    lines.push('Likely fix: CSP must allow wasm-unsafe-eval (see src/renderer/index.html).')
  }

  return lines.join('\n')
}

export function formatVisionInitError(stage: VisionInitStage, err: unknown): string {
  const stageLabel =
    stage === 'face-model'
      ? '[Step 1/4] Face model'
      : stage === 'pose-model'
        ? '[Step 2/4] Pose model'
        : stage === 'camera'
          ? '[Step 3/4] Camera'
          : '[Step 4/4] Video playback'

  let detail: string
  if (stage === 'face-model') {
    detail = modelErrorDetail(
      err,
      'Face Landmarker',
      'face_landmarker.task',
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
    )
  } else if (stage === 'pose-model') {
    detail = modelErrorDetail(
      err,
      'Pose Landmarker',
      'pose_landmarker_lite.task',
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
    )
  } else if (stage === 'camera' && err instanceof DOMException) {
    detail = domExceptionDetail(err)
  } else if (stage === 'camera') {
    detail =
      err instanceof Error
        ? `getUserMedia failed: ${err.name ? `${err.name}: ` : ''}${err.message}`
        : `getUserMedia failed: ${String(err)}`
    if (!navigator.mediaDevices?.getUserMedia) {
      detail += '\nLikely fix: mediaDevices API unavailable in this environment.'
    }
  } else {
    detail =
      err instanceof Error
        ? `Video element failed to play: ${err.message}`
        : `Video element failed to play: ${String(err)}`
    detail += '\nLikely fix: camera stream was obtained but attaching to <video> failed; restart the app.'
  }

  return `${stageLabel}\n${detail}`
}

export async function requestCameraStream(): Promise<MediaStream> {
  const constraints: MediaStreamConstraints[] = [
    { video: { width: 640, height: 480, facingMode: 'user' }, audio: false },
    { video: true, audio: false }
  ]

  let lastError: unknown
  for (const c of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(c)
    } catch (e) {
      lastError = e
      if (e instanceof DOMException && e.name === 'OverconstrainedError') continue
      throw e
    }
  }
  throw lastError
}
