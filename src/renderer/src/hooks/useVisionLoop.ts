import { useEffect, useRef } from 'react'
import { FATIGUE_BREAK_SECONDS, JAW_OPEN_YAWN, POSTURE_ALERT_HOLD_MS } from '../constants/thresholds'
import { useSessionStore } from '../store/sessionStore'
import type {
  ActivePostureIssue,
  DistanceStatus,
  Mood,
  MoodSignals,
  PostureBaseline,
  PostureMetrics
} from '../types/metrics'
import { BlinkDetector } from '../vision/blinkDetector'
import { drawPostureSkeleton } from '../vision/drawPostureSkeleton'
import { estimateDistanceStatus, estimateFaceRatio } from '../vision/distanceEstimator'
import { ExpressionEstimator } from '../vision/expressionEstimator'
import { detectFace, initFaceLandmarker } from '../vision/faceLandmarker'
import { PostureCalibrator } from '../vision/postureCalibrator'
import { estimatePosture, postureAlertMessages } from '../vision/postureEstimator'
import {
  buildPostureDebugSnapshot,
  isPostureDebugEnabled,
  postureIssuesEqual,
  POSTURE_DEBUG_LOG_MS
} from '../vision/postureDebug'
import { detectPose, initPoseLandmarker } from '../vision/poseLandmarker'
import { requestCameraStream, VisionInitError } from '../utils/visionInitError'
import { setSharedCameraStream } from '../utils/cameraStreamRegistry'

function computeFatigueLevel(
  blinksPerMinute: number,
  mood: Mood,
  blinkRateReady: boolean
): number {
  let level = 0
  if (blinkRateReady && blinksPerMinute < 10) level += 0.4
  if (mood === 'tired') level += 0.4
  return Math.min(level, 1)
}

function buildAlert(
  distanceStatus: DistanceStatus,
  postureIssues: ActivePostureIssue[],
  mood: Mood,
  blinksPerMinute: number,
  blinkRateReady: boolean,
  moodSignals: MoodSignals | null
): string | null {
  if (distanceStatus === 'too_near') return 'Move back from the screen — about an arm\'s length'
  if (distanceStatus === 'too_far') return 'Move closer to the camera or adjust your posture'
  const postureMsgs = postureAlertMessages(postureIssues)
  if (postureMsgs.length > 0) return postureMsgs.join('；')
  if (mood === 'tired' && moodSignals && moodSignals.jawOpen >= JAW_OPEN_YAWN)
    return 'Yawning — take a short break'
  if (mood === 'tired' || (blinkRateReady && blinksPerMinute < 10))
    return 'Low blink rate — take a short break'
  if (mood === 'distracted') return 'Looking down — refocus on your study'
  if (mood === 'restless') return 'Feeling restless — try a few deep breaths'
  return null
}

function isBadPosture(issues: ActivePostureIssue[]): boolean {
  return issues.length > 0
}

function getNewPostureIssues(
  prev: ActivePostureIssue[],
  next: ActivePostureIssue[]
): ActivePostureIssue[] {
  return next.filter((issue) => !prev.includes(issue))
}

function maybeLogPostureDebug(
  metrics: PostureMetrics,
  baseline: PostureBaseline | null,
  wallNow: number,
  lastLogAt: { current: number },
  prevIssues: { current: ActivePostureIssue[] }
): void {
  if (!isPostureDebugEnabled()) return

  const snapshot = buildPostureDebugSnapshot(metrics, baseline)
  const issues = metrics.postureIssues

  if (!postureIssuesEqual(issues, prevIssues.current)) {
    console.warn('[StudySense:posture] issues changed', {
      from: prevIssues.current,
      to: issues,
      snapshot
    })
    prevIssues.current = issues
  }

  if (wallNow - lastLogAt.current >= POSTURE_DEBUG_LOG_MS) {
    console.log('[StudySense:posture]', snapshot)
    lastLogAt.current = wallNow
  }
}

function logCalibrationComplete(baseline: PostureBaseline, usedFallback: boolean): void {
  if (!isPostureDebugEnabled()) return
  console.info('[StudySense:posture] calibration complete', { baseline, usedFallback })
}

export function useVisionLoop(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): { loading: boolean } {
  const blinkDetector = useRef(new BlinkDetector())
  const expressionEstimator = useRef(new ExpressionEstimator())
  const postureCalibrator = useRef(new PostureCalibrator())
  const breakEndTime = useRef<number | null>(null)
  const lastTimestamp = useRef(0)
  const prevDistance = useRef<DistanceStatus>('none')
  const prevMood = useRef<Mood>('unknown')
  const prevPostureIssues = useRef<ActivePostureIssue[]>([])
  const badPostureSince = useRef<number | null>(null)
  const lastPostureLogAt = useRef(0)
  const prevPostureDebugIssues = useRef<ActivePostureIssue[]>([])
  const loadingRef = useRef(true)

  const isRunning = useSessionStore((s) => s.isRunning)
  const showMesh = useSessionStore((s) => s.showMesh)
  const updateMetrics = useSessionStore((s) => s.updateMetrics)
  const setReady = useSessionStore((s) => s.setReady)
  const setError = useSessionStore((s) => s.setError)

  useEffect(() => {
    if (isRunning) {
      blinkDetector.current.reset()
      expressionEstimator.current.reset()
      prevDistance.current = 'none'
      prevMood.current = 'unknown'
      prevPostureIssues.current = []
      badPostureSince.current = null
    }
  }, [isRunning])

  useEffect(() => {
    const unsub = useSessionStore.subscribe((state, prev) => {
      if (state.calibrationPhase === 'running' && prev.calibrationPhase !== 'running') {
        postureCalibrator.current.start(Date.now())
        prevPostureIssues.current = []
        badPostureSince.current = null
      }
      if (state.calibrationPhase === 'idle' && prev.calibrationPhase !== 'idle') {
        postureCalibrator.current.reset()
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    let rafId = 0
    let stream: MediaStream | null = null
    let cancelled = false

    async function setup(): Promise<void> {
      try {
        try {
          await initFaceLandmarker()
        } catch (err) {
          throw new VisionInitError('face-model', err)
        }

        try {
          await initPoseLandmarker()
        } catch (err) {
          throw new VisionInitError('pose-model', err)
        }

        try {
          stream = await requestCameraStream()
        } catch (err) {
          throw new VisionInitError('camera', err)
        }

        setSharedCameraStream(stream)

        const video = videoRef.current
        if (!video || cancelled) return

        video.srcObject = stream
        try {
          await video.play()
        } catch (err) {
          throw new VisionInitError('video', err)
        }

        setReady(true)
        loadingRef.current = false

        const loop = (): void => {
          if (cancelled || !videoRef.current) return

          const video = videoRef.current
          const canvas = canvasRef.current
          // `now` — monotonic high-res clock (ms since page load). Required by MediaPipe
          // VIDEO mode (detectFace/detectPose) and to skip duplicate RAF ticks.
          const now = performance.now()
          // `wallNow` — real-world epoch ms. Used for blink history, calibration/break
          // countdowns, and posture-hold debounce (compare with Date-based deadlines).
          const wallNow = Date.now()
          
          if (video.readyState >= 2 && now !== lastTimestamp.current) {
            lastTimestamp.current = now
            const faceResult = detectFace(video, now)
            const poseResult = detectPose(video, now)
            const poseLandmarks = poseResult?.landmarks?.[0]

            const store = useSessionStore.getState()
            const calibrating = store.calibrationPhase === 'running'
            const baseline = store.postureBaseline

            if (faceResult?.faceLandmarks?.[0]) {
              const landmarks = faceResult.faceLandmarks[0]
              const blendshapes = faceResult.faceBlendshapes?.[0]?.categories
              const nose = landmarks[1]

              const postureMetrics = estimatePosture(poseLandmarks, nose, calibrating ? null : baseline)
              maybeLogPostureDebug(
                postureMetrics,
                calibrating ? null : baseline,
                wallNow,
                lastPostureLogAt,
                prevPostureDebugIssues
              )

              if (calibrating) {
                postureCalibrator.current.addSample(postureMetrics)
                const secondsLeft = postureCalibrator.current.getSecondsLeft(wallNow)

                if (postureCalibrator.current.isComplete(wallNow)) {
                  const { baseline: newBaseline, usedFallback } = postureCalibrator.current.finish()
                  logCalibrationComplete(newBaseline, usedFallback)
                  store.finishCalibration(newBaseline, usedFallback)
                  postureCalibrator.current.reset()
                } else {
                  useSessionStore.setState({ calibrationSecondsLeft: secondsLeft })
                }

                if (canvas && showMesh) {
                  const ctx = canvas.getContext('2d')
                  if (ctx) {
                    canvas.width = video.videoWidth
                    canvas.height = video.videoHeight
                    ctx.clearRect(0, 0, canvas.width, canvas.height)
                    for (const p of landmarks) {
                      ctx.beginPath()
                      ctx.arc(p.x * canvas.width, p.y * canvas.height, 1.2, 0, Math.PI * 2)
                      ctx.fillStyle = '#4ade80'
                      ctx.fill()
                    }
                    if (poseLandmarks) {
                      drawPostureSkeleton(
                        ctx,
                        poseLandmarks,
                        nose,
                        canvas.width,
                        canvas.height,
                        postureMetrics.postureIssues
                      )
                    }
                  }
                }

                return void (rafId = requestAnimationFrame(loop))
              }

              const blink = blinkDetector.current.update(landmarks, wallNow)
              const faceRatio = estimateFaceRatio(landmarks)
              const distanceStatus = estimateDistanceStatus(faceRatio)
              const { mood, signals: moodSignals } = expressionEstimator.current.update(
                blendshapes,
                nose,
                blink.blinksPerMinute,
                blink.ear,
                wallNow,
                blink.blinkRateReady,
                postureMetrics.forwardRatio,
                baseline
              )
              const fatigueLevel = computeFatigueLevel(
                blink.blinksPerMinute,
                mood,
                blink.blinkRateReady
              )

              const postureIssues = isRunning ? postureMetrics.postureIssues : []
              const postureTrackable = postureMetrics.trackable
              const alertMessage = isRunning
                ? buildAlert(
                    distanceStatus,
                    postureIssues,
                    mood,
                    blink.blinksPerMinute,
                    blink.blinkRateReady,
                    moodSignals
                  )
                : null

              let showPostureHint = false
              if (isRunning && isBadPosture(postureIssues)) {
                if (!badPostureSince.current) badPostureSince.current = wallNow
                if (wallNow - badPostureSince.current >= POSTURE_ALERT_HOLD_MS) {
                  showPostureHint = true
                }
              } else {
                badPostureSince.current = null
              }

              if (
                isRunning &&
                distanceStatus !== 'good' &&
                distanceStatus !== 'none' &&
                prevDistance.current !== distanceStatus
              ) {
                useSessionStore.setState((s) => ({
                  distanceAlerts: s.distanceAlerts + 1
                }))
              }
              prevDistance.current = distanceStatus

              if (isRunning && mood !== 'unknown' && mood !== prevMood.current) {
                useSessionStore.setState((s) => ({
                  moodEvents: { ...s.moodEvents, [mood]: s.moodEvents[mood] + 1 }
                }))
              }
              prevMood.current = mood

              if (isRunning && isBadPosture(postureIssues)) {
                const newIssues = getNewPostureIssues(prevPostureIssues.current, postureIssues)
                if (newIssues.length > 0) {
                  useSessionStore.setState((s) => {
                    const postureAlerts = { ...s.postureAlerts }
                    for (const issue of newIssues) {
                      postureAlerts[issue] += 1
                    }
                    return { postureAlerts }
                  })
                }
              }
              prevPostureIssues.current = postureIssues

              let showBreak = false
              let breakSecondsLeft = 0
              if (
                isRunning &&
                fatigueLevel >= 0.6 &&
                distanceStatus === 'too_near' &&
                blink.blinkRateReady &&
                blink.blinksPerMinute < 12
              ) {
                if (!breakEndTime.current) {
                  breakEndTime.current = wallNow + FATIGUE_BREAK_SECONDS * 1000
                }
                showBreak = true
                breakSecondsLeft = Math.max(
                  0,
                  Math.ceil((breakEndTime.current - wallNow) / 1000)
                )
                if (breakSecondsLeft <= 0) breakEndTime.current = null
              } else {
                breakEndTime.current = null
              }

              updateMetrics({
                blinkCount: blink.blinkCount,
                blinksPerMinute: blink.blinksPerMinute,
                blinkRateReady: blink.blinkRateReady,
                ear: blink.ear,
                mood,
                moodSignals,
                faceRatio,
                distanceStatus,
                fatigueLevel,
                alertMessage,
                showBreak,
                breakSecondsLeft,
                postureIssues,
                postureTrackable,
                neckAngleDeg: postureMetrics.neckAngleDeg,
                shoulderTiltDeg: postureMetrics.shoulderTiltDeg,
                forwardRatio: postureMetrics.forwardRatio,
                headOffsetRatio: postureMetrics.headOffsetRatio,
                postureScore: postureMetrics.postureScore,
                showPostureHint
              })

              if (canvas && showMesh) {
                const ctx = canvas.getContext('2d')
                if (ctx) {
                  canvas.width = video.videoWidth
                  canvas.height = video.videoHeight
                  ctx.clearRect(0, 0, canvas.width, canvas.height)
                  ctx.strokeStyle = '#4ade80'
                  ctx.lineWidth = 1
                  for (const p of landmarks) {
                    const x = p.x * canvas.width
                    const y = p.y * canvas.height
                    ctx.beginPath()
                    ctx.arc(x, y, 1.2, 0, Math.PI * 2)
                    ctx.fillStyle = '#4ade80'
                    ctx.fill()
                  }
                  if (poseLandmarks) {
                    drawPostureSkeleton(
                      ctx,
                      poseLandmarks,
                      nose,
                      canvas.width,
                      canvas.height,
                      postureIssues
                    )
                  }
                }
              } else if (canvas) {
                const ctx = canvas.getContext('2d')
                ctx?.clearRect(0, 0, canvas.width, canvas.height)
              }
            } else {
              if (calibrating) {
                postureCalibrator.current.addSample({
                  neckAngleDeg: 0,
                  shoulderTiltDeg: 0,
                  forwardRatio: 0,
                  headOffsetRatio: 0,
                  shoulderWidth: 0,
                  shoulderUnevenRatio: 0,
                  postureIssues: [],
                  postureScore: 0,
                  trackable: false
                })
                const secondsLeft = postureCalibrator.current.getSecondsLeft(wallNow)
                if (postureCalibrator.current.isComplete(wallNow)) {
                  const { baseline: newBaseline, usedFallback } = postureCalibrator.current.finish()
                  logCalibrationComplete(newBaseline, usedFallback)
                  useSessionStore.getState().finishCalibration(newBaseline, usedFallback)
                  postureCalibrator.current.reset()
                } else {
                  useSessionStore.setState({ calibrationSecondsLeft: secondsLeft })
                }
              }

              updateMetrics({
                blinkCount: blinkDetector.current.getCount(),
                blinksPerMinute: 0,
                blinkRateReady: false,
                ear: 0,
                mood: 'unknown',
                moodSignals: null,
                faceRatio: 0,
                distanceStatus: 'none',
                fatigueLevel: 0,
                alertMessage: calibrating ? null : 'No face detected',
                showBreak: false,
                breakSecondsLeft: 0,
                postureIssues: [],
                postureTrackable: false,
                neckAngleDeg: 0,
                shoulderTiltDeg: 0,
                forwardRatio: 0,
                headOffsetRatio: 0,
                postureScore: 0,
                showPostureHint: false,
                calibrationSecondsLeft: calibrating
                  ? postureCalibrator.current.getSecondsLeft(wallNow)
                  : undefined
              })
            }
          }

          rafId = requestAnimationFrame(loop)
        }

        loop()
      } catch (err) {
        console.error('[StudySense] Vision init failed:', err)
        const message =
          err instanceof VisionInitError
            ? err.message
            : err instanceof Error
              ? `[Init] ${err.name}: ${err.message}`
              : `[Init] ${String(err)}`
        setError(message)
      }
    }

    setup()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((t) => t.stop())
      setSharedCameraStream(null)
    }
  }, [videoRef, canvasRef, isRunning, showMesh, updateMetrics, setReady, setError])

  return { loading: loadingRef.current }
}
