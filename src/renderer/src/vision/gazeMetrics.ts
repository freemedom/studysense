import {
  GAZE_GO_HIT150_MIN,
  GAZE_GO_MEAN_ERROR_PX,
  GAZE_NO_GO_HIT200_MIN,
  GAZE_NO_GO_MEAN_ERROR_PX,
  GAZE_VALIDATION_HIT_RADII_PX
} from '../constants/gazeThresholds'
import type {
  GoNoGoVerdict,
  GazePoint,
  GazeProxyMetrics,
  ValidationPointResult,
  ValidationReport
} from '../types/gazeLab'
import { pctToPx } from './webgazerLab'

function hitRatesForErrors(errors: number[]): Record<number, number> {
  const rates: Record<number, number> = {}
  if (errors.length === 0) {
    for (const radius of GAZE_VALIDATION_HIT_RADII_PX) rates[radius] = 0
    return rates
  }
  for (const radius of GAZE_VALIDATION_HIT_RADII_PX) {
    rates[radius] = errors.filter((e) => e <= radius).length / errors.length
  }
  return rates
}

function summarizeErrors(errors: number[]): {
  meanErrorPx: number
  rmsErrorPx: number
  precisionSdPx: number
  hitRates: Record<number, number>
} {
  if (errors.length === 0) {
    return {
      meanErrorPx: 0,
      rmsErrorPx: 0,
      precisionSdPx: 0,
      hitRates: hitRatesForErrors([])
    }
  }
  const meanErrorPx = errors.reduce((sum, e) => sum + e, 0) / errors.length
  const rmsErrorPx = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length)
  const variance =
    errors.reduce((sum, e) => sum + (e - meanErrorPx) ** 2, 0) / errors.length
  return {
    meanErrorPx,
    rmsErrorPx,
    precisionSdPx: Math.sqrt(variance),
    hitRates: hitRatesForErrors(errors)
  }
}

export function evaluateGoNoGo(meanErrorPx: number, hitRates: Record<number, number>): GoNoGoVerdict {
  if (meanErrorPx < GAZE_GO_MEAN_ERROR_PX && (hitRates[150] ?? 0) > GAZE_GO_HIT150_MIN) {
    return 'go'
  }
  if (meanErrorPx > GAZE_NO_GO_MEAN_ERROR_PX || (hitRates[200] ?? 0) < GAZE_NO_GO_HIT200_MIN) {
    return 'no-go'
  }
  return 'caution'
}

export function buildValidationReport(input: {
  regression: ValidationReport['regression']
  sampleRateHz: number
  trainingPointCount: number
  pointSamples: { targetPct: [number, number]; samples: GazePoint[] }[]
}): ValidationReport {
  const pointResults: ValidationPointResult[] = input.pointSamples.map((entry) => {
    const targetPx = pctToPx(entry.targetPct)
    const errors = entry.samples.map((s) => Math.hypot(s.x - targetPx.x, s.y - targetPx.y))
    const summary = summarizeErrors(errors)
    return {
      targetPct: entry.targetPct,
      targetPx,
      sampleCount: entry.samples.length,
      ...summary
    }
  })

  const allErrors = pointResults.flatMap((p) =>
    Array.from({ length: p.sampleCount }, () => p.meanErrorPx)
  )

  const pooledErrors = input.pointSamples.flatMap((entry) => {
    const targetPx = pctToPx(entry.targetPct)
    return entry.samples.map((s) => Math.hypot(s.x - targetPx.x, s.y - targetPx.y))
  })

  const summary = summarizeErrors(pooledErrors.length > 0 ? pooledErrors : allErrors)

  return {
    id: crypto.randomUUID(),
    recordedAt: new Date().toISOString(),
    regression: input.regression,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    sampleRateHz: input.sampleRateHz,
    trainingPointCount: input.trainingPointCount,
    pointResults,
    meanErrorPx: summary.meanErrorPx,
    rmsErrorPx: summary.rmsErrorPx,
    precisionSdPx: summary.precisionSdPx,
    hitRates: summary.hitRates,
    verdict: evaluateGoNoGo(summary.meanErrorPx, summary.hitRates)
  }
}

function inCenterBand(x: number, y: number, w: number, h: number, band: number): boolean {
  const minX = w * ((1 - band) / 2)
  const maxX = w * ((1 + band) / 2)
  const minY = h * ((1 - band) / 2)
  const maxY = h * ((1 + band) / 2)
  return x >= minX && x <= maxX && y >= minY && y <= maxY
}

function inBelowBand(y: number, h: number, topFrac: number): boolean {
  return y >= h * topFrac
}

function inEdgeBand(x: number, y: number, w: number, h: number, edge: number): boolean {
  return x <= w * edge || x >= w * (1 - edge) || y <= h * edge || y >= h * (1 - edge)
}

function isOffScreen(x: number, y: number, w: number, h: number, edge: number): boolean {
  return x < 0 || y < 0 || x > w || y > h || inEdgeBand(x, y, w, h, edge)
}

interface FixationSaccadeState {
  fixationRatePerMin: number
  meanFixationMs: number
  saccadeRatePerMin: number
}

export function computeFixationSaccade(
  points: GazePoint[],
  dispersionPx: number,
  minFixationMs: number,
  saccadeVelocityPxPerMs: number
): FixationSaccadeState {
  if (points.length < 2) {
    return { fixationRatePerMin: 0, meanFixationMs: 0, saccadeRatePerMin: 0 }
  }

  const spanMs = Math.max(points[points.length - 1].t - points[0].t, 1)
  const minutes = spanMs / 60_000

  let fixationCount = 0
  let saccadeCount = 0
  let fixationTotalMs = 0

  let clusterStart = 0
  for (let i = 1; i <= points.length; i++) {
    const end = i === points.length
    const prev = points[i - 1]
    const curr = points[i]
    const speed =
      !end && curr
        ? Math.hypot(curr.x - prev.x, curr.y - prev.y) / Math.max(curr.t - prev.t, 1)
        : 0

    if (!end && speed >= saccadeVelocityPxPerMs) {
      saccadeCount += 1
    }

    const clusterEnded = end || speed >= saccadeVelocityPxPerMs
    if (clusterEnded) {
      const cluster = points.slice(clusterStart, i)
      if (cluster.length >= 2) {
        const minX = Math.min(...cluster.map((p) => p.x))
        const maxX = Math.max(...cluster.map((p) => p.x))
        const minY = Math.min(...cluster.map((p) => p.y))
        const maxY = Math.max(...cluster.map((p) => p.y))
        const durationMs = cluster[cluster.length - 1].t - cluster[0].t
        if (maxX - minX <= dispersionPx && maxY - minY <= dispersionPx && durationMs >= minFixationMs) {
          fixationCount += 1
          fixationTotalMs += durationMs
        }
      }
      clusterStart = i
    }
  }

  return {
    fixationRatePerMin: fixationCount / minutes,
    meanFixationMs: fixationCount > 0 ? fixationTotalMs / fixationCount : 0,
    saccadeRatePerMin: saccadeCount / minutes // high speed adjacent pair
  }
}

export function computeGazeDispersion(points: GazePoint[]): number {
  if (points.length < 2) return 0
  const meanX = points.reduce((s, p) => s + p.x, 0) / points.length
  const meanY = points.reduce((s, p) => s + p.y, 0) / points.length
  const variance =
    points.reduce((s, p) => s + (p.x - meanX) ** 2 + (p.y - meanY) ** 2, 0) / points.length
  return Math.sqrt(variance)
}

export function computeProxyMetrics(
  points: GazePoint[],
  viewport: { width: number; height: number },
  centerBand: number,
  belowTop: number,
  edgeBand: number,
  dispersionPx: number,
  minFixationMs: number,
  saccadeVelocityPxPerMs: number
): GazeProxyMetrics {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (valid.length === 0) {
    return {
      centerDwellRatio: 0,
      belowBandRatio: 0,
      offScreenRatio: 0,
      gazeDispersion: 0,
      fixationRatePerMin: 0,
      meanFixationMs: 0,
      saccadeRatePerMin: 0,
      saccadeRateTrend: 0
    }
  }

  const w = viewport.width
  const h = viewport.height
  let center = 0
  let below = 0
  let off = 0

  for (const p of valid) {
    if (inCenterBand(p.x, p.y, w, h, centerBand)) center += 1
    if (inBelowBand(p.y, h, belowTop)) below += 1
    if (isOffScreen(p.x, p.y, w, h, edgeBand)) off += 1
  }

  const n = valid.length
  const fixationSaccade = computeFixationSaccade(
    valid,
    dispersionPx,
    minFixationMs,
    saccadeVelocityPxPerMs
  )

  const half = Math.floor(valid.length / 2)
  const firstHalf = valid.slice(0, Math.max(half, 1))
  const secondHalf = valid.slice(Math.max(half, 1))
  const firstRate = computeFixationSaccade(
    firstHalf,
    dispersionPx,
    minFixationMs,
    saccadeVelocityPxPerMs
  ).saccadeRatePerMin
  const secondRate = computeFixationSaccade(
    secondHalf,
    dispersionPx,
    minFixationMs,
    saccadeVelocityPxPerMs
  ).saccadeRatePerMin
  const saccadeRateTrend =
    firstRate > 0 ? (secondRate - firstRate) / firstRate : secondRate > 0 ? 1 : 0

  return {
    centerDwellRatio: center / n,
    belowBandRatio: below / n,
    offScreenRatio: off / n,
    gazeDispersion: computeGazeDispersion(valid),
    fixationRatePerMin: fixationSaccade.fixationRatePerMin,
    meanFixationMs: fixationSaccade.meanFixationMs,
    saccadeRatePerMin: fixationSaccade.saccadeRatePerMin,
    saccadeRateTrend
  }
}

export function computeSampleRateHz(points: GazePoint[]): number {
  if (points.length < 2) return 0
  const spanMs = points[points.length - 1].t - points[0].t
  if (spanMs <= 0) return 0
  return (points.length / spanMs) * 1000
}
