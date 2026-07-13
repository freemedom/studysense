import { create } from 'zustand'
import {
  GAZE_CALIBRATED_STORAGE_KEY,
  GAZE_LAB_REPORT_MAX,
  GAZE_LAB_REPORT_STORAGE_KEY
} from '../constants/gazeThresholds'
import type {
  GazeLabPhase,
  GazeMood,
  GazePoint,
  GazeProxyMetrics,
  GoNoGoVerdict,
  ValidationReport,
  WebGazerRegression
} from '../types/gazeLab'
import { emptyGazeProxyMetrics } from '../vision/gazeMood'

function loadReports(): ValidationReport[] {
  try {
    const raw = localStorage.getItem(GAZE_LAB_REPORT_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ValidationReport[]
  } catch {
    return []
  }
}

function saveReport(report: ValidationReport): void {
  const next = [report, ...loadReports()].slice(0, GAZE_LAB_REPORT_MAX)
  localStorage.setItem(GAZE_LAB_REPORT_STORAGE_KEY, JSON.stringify(next))
}

function loadGazeCalibratedFlag(): boolean {
  try {
    return localStorage.getItem(GAZE_CALIBRATED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistGazeCalibrated(calibrated: boolean): void {
  try {
    if (calibrated) {
      localStorage.setItem(GAZE_CALIBRATED_STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(GAZE_CALIBRATED_STORAGE_KEY)
    }
  } catch {
    /* ignore quota errors */
  }
}

interface GazeState {
  labActive: boolean
  labPhase: GazeLabPhase
  regression: WebGazerRegression
  webgazerReady: boolean
  webgazerError: string | null
  liveGaze: GazePoint | null
  gazeTrail: GazePoint[]
  calibrationIndex: number
  calibrationClick: number
  validationIndex: number
  validationSamples: GazePoint[]
  lastReport: ValidationReport | null
  reportHistory: ValidationReport[]
  goNoGoVerdict: GoNoGoVerdict | null
  gazeCalibrated: boolean
  sessionGazeEnabled: boolean
  proxyMetrics: GazeProxyMetrics
  proxyBaseline: GazeProxyMetrics | null
  gazeMood: GazeMood
  gazeMoodCandidate: GazeMood
  gazeMoodCandidateSince: number | null
  trainingPointCount: number
  setLabActive: (active: boolean) => void
  setLabPhase: (phase: GazeLabPhase) => void
  setRegression: (regression: WebGazerRegression) => void
  setWebGazerReady: (ready: boolean, error?: string | null) => void
  setLiveGaze: (point: GazePoint | null) => void
  pushGazeTrail: (point: GazePoint) => void
  clearGazeTrail: () => void
  setCalibrationIndex: (index: number) => void
  setCalibrationClick: (click: number) => void
  setValidationIndex: (index: number) => void
  setValidationSamples: (samples: GazePoint[]) => void
  appendValidationSample: (sample: GazePoint) => void
  setLastReport: (report: ValidationReport | null) => void
  persistReport: (report: ValidationReport) => void
  loadReportHistory: () => void
  setGoNoGoVerdict: (verdict: GoNoGoVerdict | null) => void
  setGazeCalibrated: (calibrated: boolean) => void
  loadGazeCalibrationState: () => void
  setSessionGazeEnabled: (enabled: boolean) => void
  setProxyMetrics: (metrics: GazeProxyMetrics) => void
  setProxyBaseline: (baseline: GazeProxyMetrics | null) => void
  setGazeMood: (state: GazeMood) => void
  setGazeMoodCandidate: (state: GazeMood, since: number | null) => void
  setTrainingPointCount: (count: number) => void
  resetLabFlow: () => void
}

export const useGazeStore = create<GazeState>((set) => ({
  labActive: false,
  labPhase: 'idle',
  regression: 'weightedRidge',
  webgazerReady: false,
  webgazerError: null,
  liveGaze: null,
  gazeTrail: [],
  calibrationIndex: 0,
  calibrationClick: 1,
  validationIndex: 0,
  validationSamples: [],
  lastReport: null,
  reportHistory: loadReports(),
  goNoGoVerdict: null,
  gazeCalibrated: loadGazeCalibratedFlag() || loadReports().length > 0,
  sessionGazeEnabled: false,
  proxyMetrics: emptyGazeProxyMetrics(),
  proxyBaseline: null,
  gazeMood: 'unknown',
  gazeMoodCandidate: 'unknown',
  gazeMoodCandidateSince: null,
  trainingPointCount: 0,

  setLabActive: (active) => set({ labActive: active }),
  setLabPhase: (phase) => set({ labPhase: phase }),
  setRegression: (regression) => set({ regression }),
  setWebGazerReady: (ready, error = null) => set({ webgazerReady: ready, webgazerError: error }),
  setLiveGaze: (point) => set({ liveGaze: point }),
  pushGazeTrail: (point) =>
    set((s) => ({ gazeTrail: [...s.gazeTrail.slice(-80), point] })),
  clearGazeTrail: () => set({ gazeTrail: [] }),
  setCalibrationIndex: (index) => set({ calibrationIndex: index }),
  setCalibrationClick: (click) => set({ calibrationClick: click }),
  setValidationIndex: (index) => set({ validationIndex: index }),
  setValidationSamples: (samples) => set({ validationSamples: samples }),
  appendValidationSample: (sample) =>
    set((s) => ({ validationSamples: [...s.validationSamples, sample] })),
  setLastReport: (report) => set({ lastReport: report }),
  persistReport: (report) => {
    saveReport(report)
    set({ lastReport: report, reportHistory: loadReports(), goNoGoVerdict: report.verdict })
  },
  loadReportHistory: () => set({ reportHistory: loadReports() }),
  setGoNoGoVerdict: (verdict) => set({ goNoGoVerdict: verdict }),
  setGazeCalibrated: (calibrated) => {
    persistGazeCalibrated(calibrated)
    set({ gazeCalibrated: calibrated })
  },
  loadGazeCalibrationState: () => {
    const reports = loadReports()
    const calibrated = loadGazeCalibratedFlag() || reports.length > 0
    if (calibrated && !loadGazeCalibratedFlag()) {
      persistGazeCalibrated(true)
    }
    set({ reportHistory: reports, gazeCalibrated: calibrated })
  },
  setSessionGazeEnabled: (enabled) => set({ sessionGazeEnabled: enabled }),
  setProxyMetrics: (metrics) => set({ proxyMetrics: metrics }),
  setProxyBaseline: (baseline) => set({ proxyBaseline: baseline }),
  setGazeMood: (state) => set({ gazeMood: state }),
  setGazeMoodCandidate: (state, since) =>
    set({ gazeMoodCandidate: state, gazeMoodCandidateSince: since }),
  setTrainingPointCount: (count) => set({ trainingPointCount: count }),
  resetLabFlow: () =>
    set({
      labPhase: 'idle',
      calibrationIndex: 0,
      calibrationClick: 1,
      validationIndex: 0,
      validationSamples: [],
      liveGaze: null,
      gazeTrail: []
    })
}))

export function isGazeCalibrated(): boolean {
  return useGazeStore.getState().gazeCalibrated
}

/** True when Gaze Lab calibration has been completed (independent of go/no-go verdict). */
export function isWebGazerUsable(): boolean {
  return isGazeCalibrated()
}
