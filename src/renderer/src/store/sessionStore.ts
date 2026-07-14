import { create } from 'zustand'
import type {
  ActivePostureIssue,
  CalibrationPhase,
  DistanceStatus,
  Mood,
  MoodEventCounts,
  MoodSignals,
  PostureAlertCounts,
  PostureBaseline,
  SessionSummary,
  SessionTimeline,
  TimelineTrack
} from '../types/metrics'
import { emptyMoodEvents, emptyPostureAlertCounts } from '../types/metrics'
import type { GazeMoodEventCounts } from '../types/gazeLab'
import { emptyGazeMoodEvents } from '../types/gazeLab'
import { isWebGazerUsable, useGazeStore } from './gazeStore'
import { loadSessions, saveSession } from '../utils/sessionStorage'
import { exportSessionDebugCsv } from '../utils/sessionDebugExport'
import { useContextStore } from './contextStore'

interface SessionState {
  isRunning: boolean
  isReady: boolean
  error: string | null
  showMesh: boolean
  blinkCount: number
  blinksPerMinute: number
  blinkRateReady: boolean
  ear: number
  mood: Mood
  moodSignals: MoodSignals | null
  faceRatio: number
  distanceStatus: DistanceStatus
  fatigueLevel: number
  alertMessage: string | null
  showBreak: boolean
  breakSecondsLeft: number
  breakLatchDismissed: boolean
  calibrationPhase: CalibrationPhase
  calibrationSecondsLeft: number
  calibrationMessage: string | null
  postureBaseline: PostureBaseline | null
  postureIssues: ActivePostureIssue[]
  postureTrackable: boolean
  neckAngleDeg: number
  shoulderTiltDeg: number
  forwardRatio: number
  headOffsetRatio: number
  postureScore: number
  postureAlerts: PostureAlertCounts
  sessionStart: number | null
  distanceAlerts: number
  moodEvents: MoodEventCounts
  gazeMoodEvents: GazeMoodEventCounts
  history: SessionSummary[]
  timeline: SessionTimeline | null
  setReady: (ready: boolean) => void
  setError: (error: string | null) => void
  toggleMesh: () => void
  startCalibration: () => void
  beginCalibrationRecording: () => void
  finishCalibration: (baseline: PostureBaseline, usedFallback: boolean) => void
  cancelCalibration: () => void
  stopSession: () => void
  dismissBreak: () => void
  updateMetrics: (metrics: {
    blinkCount: number
    blinksPerMinute: number
    blinkRateReady: boolean
    ear: number
    mood: Mood
    moodSignals: MoodSignals | null
    faceRatio: number
    distanceStatus: DistanceStatus
    fatigueLevel: number
    alertMessage: string | null
    showBreak: boolean
    breakSecondsLeft: number
    postureIssues: ActivePostureIssue[]
    postureTrackable: boolean
    neckAngleDeg: number
    shoulderTiltDeg: number
    forwardRatio: number
    headOffsetRatio: number
    postureScore: number
    calibrationSecondsLeft?: number
  }) => void
  pushTimelineEvent: (track: TimelineTrack, value: string) => void
  loadHistory: () => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  isRunning: false,
  isReady: false,
  error: null,
  showMesh: true,
  blinkCount: 0,
  blinksPerMinute: 0,
  blinkRateReady: false,
  ear: 0,
  mood: 'unknown',
  moodSignals: null,
  faceRatio: 0,
  distanceStatus: 'none',
  fatigueLevel: 0,
  alertMessage: null,
  showBreak: false,
  breakSecondsLeft: 0,
  breakLatchDismissed: false,
  calibrationPhase: 'idle',
  calibrationSecondsLeft: 0,
  calibrationMessage: null,
  postureBaseline: null,
  postureIssues: [],
  postureTrackable: false,
  neckAngleDeg: 0,
  shoulderTiltDeg: 0,
  forwardRatio: 0,
  headOffsetRatio: 0,
  postureScore: 0,
  postureAlerts: emptyPostureAlertCounts(),
  sessionStart: null,
  distanceAlerts: 0,
  moodEvents: emptyMoodEvents(),
  gazeMoodEvents: emptyGazeMoodEvents(),
  history: loadSessions(),
  timeline: null,

  setReady: (ready) => set({ isReady: ready }),
  setError: (error) => set({ error }),
  toggleMesh: () => set((s) => ({ showMesh: !s.showMesh })),

  startCalibration: () =>
    set({
      calibrationPhase: 'preparing',
      calibrationSecondsLeft: 0,
      calibrationMessage: null,
      isRunning: false,
      postureBaseline: null,
      postureAlerts: emptyPostureAlertCounts(),
      blinkCount: 0,
      blinksPerMinute: 0,
      blinkRateReady: false,
      mood: 'unknown',
      moodSignals: null,
      distanceAlerts: 0,
      moodEvents: emptyMoodEvents(),
      gazeMoodEvents: emptyGazeMoodEvents(),
      alertMessage: null,
      showBreak: false,
      breakLatchDismissed: false,
      timeline: null
    }),

  beginCalibrationRecording: () =>
    set({
      calibrationPhase: 'running',
      calibrationSecondsLeft: 5
    }),

  finishCalibration: (baseline, usedFallback) => {
    if (isWebGazerUsable()) {
      useGazeStore.getState().setSessionGazeEnabled(true)
    }
    const sessionStart = Date.now()
    set({
      calibrationPhase: 'done',
      postureBaseline: baseline,
      isRunning: true,
      sessionStart,
      timeline: {
        startedAtMs: sessionStart,
        events: [
          { tMs: sessionStart, track: 'mood', value: 'unknown' },
          { tMs: sessionStart, track: 'distance', value: 'none' },
          { tMs: sessionStart, track: 'posture', value: 'none' },
          { tMs: sessionStart, track: 'gazeMood', value: 'unknown' },
          { tMs: sessionStart, track: 'blinkRate', value: 'warming_up' }
        ]
      },
      calibrationMessage: usedFallback
        ? 'Not enough calibration samples — using default posture baseline'
        : 'Posture calibration complete'
    })
  },

  cancelCalibration: () =>
    set(() => {
      if (useContextStore.getState().activeMode === 'strict') return {}
      return {
        calibrationPhase: 'idle',
        calibrationSecondsLeft: 0,
        calibrationMessage: null
      }
    }),

  stopSession: () => {
    if (useContextStore.getState().activeMode === 'strict') return
    const state = get()
    if (state.sessionStart) {
      const durationSec = Math.max(Math.round((Date.now() - state.sessionStart) / 1000), 1)
      const durationMin = Math.max(durationSec / 60, 0.1)
      const gaze = useGazeStore.getState().proxyMetrics
      const summary: SessionSummary = {
        id: crypto.randomUUID(),
        startedAt: new Date(state.sessionStart).toISOString(),
        endedAt: new Date().toISOString(),
        durationSec,
        blinkCount: state.blinkCount,
        avgBlinksPerMinute: Math.round(state.blinkCount / durationMin),
        distanceAlerts: state.distanceAlerts,
        moodEvents: { ...state.moodEvents },
        postureAlerts: { ...state.postureAlerts },
        gazeMoodEvents: { ...state.gazeMoodEvents },
        gazeSummary: {
          centerDwellRatio: gaze.centerDwellRatio,
          belowBandRatio: gaze.belowBandRatio,
          offScreenRatio: gaze.offScreenRatio,
          gazeDispersion: gaze.gazeDispersion,
          saccadeRatePerMin: gaze.saccadeRatePerMin
        },
        timeline: state.timeline ? { ...state.timeline, events: [...state.timeline.events] } : undefined
      }
      saveSession(summary)
      set({ history: loadSessions() })

      if (import.meta.env.DEV) {
        void exportSessionDebugCsv({
          sessionId: summary.id,
          startedAt: state.sessionStart,
          endedAt: Date.now(),
          durationSec,
          sessionGazeEnabled: useGazeStore.getState().sessionGazeEnabled
        })
      }
    }
    set({
      isRunning: false,
      sessionStart: null,
      calibrationPhase: 'idle',
      calibrationSecondsLeft: 0,
      calibrationMessage: null,
      postureBaseline: null,
      moodSignals: null,
      showBreak: false,
      breakSecondsLeft: 0,
      breakLatchDismissed: false,
      gazeMoodEvents: emptyGazeMoodEvents(),
      timeline: null
    })
    useGazeStore.getState().setSessionGazeEnabled(false)
    useGazeStore.getState().setProxyBaseline(null)
    useGazeStore.getState().setGazeMood('unknown')
  },

  updateMetrics: (metrics) => set(metrics),

  dismissBreak: () => set({ breakLatchDismissed: true, showBreak: false, breakSecondsLeft: 0 }),

  pushTimelineEvent: (track, value) => {
    const state = get()
    if (!state.isRunning || !state.timeline) return

    const lastForTrack = [...state.timeline.events].reverse().find((event) => event.track === track)
    if (lastForTrack?.value === value) return

    set({
      timeline: {
        ...state.timeline,
        events: [...state.timeline.events, { tMs: Date.now(), track, value }]
      }
    })
  },

  loadHistory: () => set({ history: loadSessions() })
}))
