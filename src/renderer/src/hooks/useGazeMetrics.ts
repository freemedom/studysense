import { useEffect, useRef } from 'react'
import {
  GAZE_BELOW_BAND_TOP,
  GAZE_CENTER_BAND,
  GAZE_DISPERSION_WINDOW_MS,
  GAZE_EDGE_BAND,
  GAZE_FIXATION_DISPERSION_PX,
  GAZE_FIXATION_MIN_MS,
  GAZE_METRICS_TICK_MS,
  GAZE_SACCADE_VELOCITY_PX_PER_MS
} from '../constants/gazeThresholds'
import { useGazeStore, isWebGazerUsable } from '../store/gazeStore'
import { useSessionStore } from '../store/sessionStore'
import type { GazeMood, GazePoint } from '../types/gazeLab'
import {
  computeGazeMood,
  gazeMoodHoldMs,
  shouldCommitGazeMood
} from '../vision/gazeMood'
import { computeProxyMetrics } from '../vision/gazeMetrics'
import {
  ensureWebGazerRunning,
  getTrainingPointCount,
  getWebGazerInstance,
  isValidGazePoint,
  pauseWebGazer,
  resumeWebGazer
} from '../vision/webgazerLab'

export function useGazeMetrics(): void {
  const isRunning = useSessionStore((s) => s.isRunning)
  const labActive = useGazeStore((s) => s.labActive)
  const sessionGazeEnabled = useGazeStore((s) => s.sessionGazeEnabled)
  const regression = useGazeStore((s) => s.regression)
  const setProxyMetrics = useGazeStore((s) => s.setProxyMetrics)
  const setProxyBaseline = useGazeStore((s) => s.setProxyBaseline)
  const setGazeMood = useGazeStore((s) => s.setGazeMood)
  const setGazeMoodCandidate = useGazeStore((s) => s.setGazeMoodCandidate)
  const setLiveGaze = useGazeStore((s) => s.setLiveGaze)
  const pushGazeTrail = useGazeStore((s) => s.pushGazeTrail)

  const gazeBuffer = useRef<GazePoint[]>([])
  const sessionStartedAt = useRef<number | null>(null)
  const webgazerStarted = useRef(false)

  // Session gaze gate — all four must pass before startSessionGaze() runs:
  // | Condition              | Store / hook              | User / code trigger                          |
  // |------------------------|---------------------------|----------------------------------------------|
  // | !labActive             | gazeStore.labActive       | startGazeCalibration / startGazeValidation   |
  // |                        |                           | set true; exitGazePreview / stopGazeLab false|
  // | isRunning              | sessionStore.isRunning    | finishCalibration → true; stopSession → false|
  // | sessionGazeEnabled     | gazeStore.sessionGazeEnabled | Gaze Lab checkbox; stopSession clears it  |
  // | isWebGazerUsable()     | gazeStore.gazeCalibrated  | 16-point calibration complete; cleared on    |
  // |                        |                           | restart calibration                          |
  // When any gate fails: pause WebGazer if this hook started it, then skip (no cleanup registered).
  // When a previously running effect's deps change, React runs the prior cleanup first (below).
  useEffect(() => {
    if (
      labActive || // Gaze Lab owns WebGazer (calibrating / validating overlay)
      !isRunning || // Study session ended or not started (SessionControls → stopSession)
      !sessionGazeEnabled || // User unchecked "Enable gaze proxy metrics" in Gaze Lab panel
      !isWebGazerUsable() // gazeCalibrated false — complete Gaze Lab calibration first
    ) {
      if (webgazerStarted.current) {
        void pauseWebGazer()
      }
      return
    }

    let cancelled = false

    async function startSessionGaze(): Promise<void> {
      try {
        if (!webgazerStarted.current) {
          await ensureWebGazerRunning({ regression })
          webgazerStarted.current = true
        } else {
          await resumeWebGazer()
        }

        const wg = getWebGazerInstance()
        if (!wg || cancelled) return

        sessionStartedAt.current = Date.now()
        gazeBuffer.current = []

        wg.setGazeListener((data) => {
          if (!data || !isValidGazePoint(data)) return
          const t = Date.now()
          const point: GazePoint = { x: data.x, y: data.y, t }
          gazeBuffer.current.push(point)
          const cutoff = t - GAZE_DISPERSION_WINDOW_MS
          gazeBuffer.current = gazeBuffer.current.filter((p) => p.t >= cutoff)
          setLiveGaze(point)
          pushGazeTrail(point)
        })
      } catch (err) {
        console.error('[StudySense:gaze] session webgazer failed', err)
      }
    }

    void startSessionGaze()

    // React effect cleanup: runs when the study session gaze hook shuts down (session
    // ended, gaze disabled, lab took over, or deps changed). Tears down session-owned
    // WebGazer state so it does not keep predicting or fight useGazeLabBoot's listener.
    return () => {
      // Ignore late async work from startSessionGaze (e.g. setGazeListener after unmount).
      cancelled = true
      // Remove this hook's gaze callback; useGazeLabBoot may re-attach if lab phase is still active.
      getWebGazerInstance()?.clearGazeListener()
      if (webgazerStarted.current) {
        // Stop the prediction loop started/resumed for session metrics (saves CPU/camera work).
        void pauseWebGazer()
      }
    }
  }, [
    labActive,
    isRunning,
    sessionGazeEnabled,
    regression,
    setLiveGaze,
    pushGazeTrail
  ])

  // Session mood/blink signals update every vision frame — read via getState() inside
  // the tick so this effect is not torn down before GAZE_METRICS_TICK_MS elapses.
  useEffect(() => {
    if (!isRunning || labActive || !sessionGazeEnabled || !isWebGazerUsable()) {
      return
    }

    const timer = window.setInterval(() => {
      const points = gazeBuffer.current
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const metrics = computeProxyMetrics(
        points,
        viewport,
        GAZE_CENTER_BAND,
        GAZE_BELOW_BAND_TOP,
        GAZE_EDGE_BAND,
        GAZE_FIXATION_DISPERSION_PX,
        GAZE_FIXATION_MIN_MS,
        GAZE_SACCADE_VELOCITY_PX_PER_MS
      )
      setProxyMetrics(metrics)

      const store = useGazeStore.getState()
      if (
        sessionStartedAt.current &&
        Date.now() - sessionStartedAt.current >= 120_000 &&
        !store.proxyBaseline
      ) {
        setProxyBaseline(metrics)
      }

      const candidate = computeGazeMood({
        metrics,
        baseline: store.proxyBaseline
      })

      const now = Date.now()
      if (candidate !== store.gazeMoodCandidate) {
        setGazeMoodCandidate(candidate, now)
      }

      if (
        shouldCommitGazeMood(
          candidate,
          store.gazeMood,
          store.gazeMoodCandidateSince,
          now
        )
      ) {
        const previous = store.gazeMood
        setGazeMood(candidate)
        const countable: GazeMood[] = [
          'likelyFocused',
          'likelyMindWandering',
          'likelyDistracted'
        ]
        if (candidate !== 'unknown' && candidate !== previous && countable.includes(candidate)) {
          useSessionStore.setState((s) => ({
            gazeMoodEvents: {
              ...s.gazeMoodEvents,
              [candidate]: s.gazeMoodEvents[candidate] + 1
            }
          }))
        }
      }

      useGazeStore.getState().setTrainingPointCount(getTrainingPointCount())
    }, GAZE_METRICS_TICK_MS)

    return () => window.clearInterval(timer)
  }, [isRunning, labActive, sessionGazeEnabled, setProxyMetrics, setProxyBaseline, setGazeMood, setGazeMoodCandidate])
}

export function useGazeMoodHoldMs(): number {
  const gazeMood = useGazeStore((s) => s.gazeMood)
  const gazeMoodCandidateSince = useGazeStore((s) => s.gazeMoodCandidateSince)
  return gazeMoodHoldMs(gazeMood, gazeMoodCandidateSince, Date.now())
}
