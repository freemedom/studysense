export type GazeLabPhase =
  | 'idle'
  | 'calibrating'
  | 'preview'
  | 'validating'
  | 'passivePreview'

export type WebGazerRegression = 'ridge' | 'weightedRidge'

export type GoNoGoVerdict = 'go' | 'caution' | 'no-go'

export interface GazePoint {
  x: number
  y: number
  t: number
}

export interface ValidationPointResult {
  targetPct: [number, number]
  targetPx: { x: number; y: number }
  sampleCount: number
  meanErrorPx: number
  rmsErrorPx: number
  precisionSdPx: number
  hitRates: Record<number, number>
}

export interface ValidationReport {
  id: string
  recordedAt: string
  regression: WebGazerRegression
  viewport: { width: number; height: number }
  sampleRateHz: number
  trainingPointCount: number
  pointResults: ValidationPointResult[]
  meanErrorPx: number
  rmsErrorPx: number
  precisionSdPx: number
  hitRates: Record<number, number>
  verdict: GoNoGoVerdict
}

export interface GazeProxyMetrics {
  centerDwellRatio: number
  belowBandRatio: number
  offScreenRatio: number
  gazeDispersion: number
  fixationRatePerMin: number
  meanFixationMs: number
  saccadeRatePerMin: number
  saccadeRateTrend: number
}

export type GazeMood =
  | 'unknown'
  | 'likelyFocused'
  | 'likelyMindWandering'
  | 'likelyDistracted'

export interface GazeMoodEventCounts {
  likelyFocused: number
  likelyMindWandering: number
  likelyDistracted: number
}

export function emptyGazeMoodEvents(): GazeMoodEventCounts {
  return {
    likelyFocused: 0,
    likelyMindWandering: 0,
    likelyDistracted: 0
  }
}
