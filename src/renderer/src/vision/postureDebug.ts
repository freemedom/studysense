/**
 * Console-only posture debugging (no UI panel).
 *
 * Enable in DevTools:
 *   localStorage.setItem('studylens:postureDebug', '1')
 * Disable:
 *   localStorage.removeItem('studylens:postureDebug')
 * Then refresh or restart the session. Open Electron DevTools to see logs.
 */
import {
  FORWARD_RATIO_DELTA,
  HEAD_OFFSET_DELTA,
  SHOULDER_UNEVEN_DELTA
} from '../constants/thresholds'
import { MIN_SHOULDER_WIDTH_RATIO } from '../constants/poseLandmarks'
import type { ActivePostureIssue, PostureBaseline, PostureMetrics } from '../types/metrics'

export const POSTURE_DEBUG_KEY = 'studylens:postureDebug'

export const POSTURE_DEBUG_LOG_MS = 500

export function isPostureDebugEnabled(): boolean {
  try {
    return localStorage.getItem(POSTURE_DEBUG_KEY) === '1'
  } catch {
    return false
  }
}

export function postureIssuesEqual(a: ActivePostureIssue[], b: ActivePostureIssue[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export interface PostureDebugSnapshot {
  trackable: boolean
  shoulderWidth: number
  minShoulderWidth: number
  neckAngleDeg: number
  shoulderTiltDeg: number
  forwardRatio: number
  headOffsetRatio: number
  shoulderUnevenRatio: number
  baseline: PostureBaseline | null
  deltas: { forward: number; headOffset: number; uneven: number }
  thresholds: {
    FORWARD_RATIO_DELTA: number
    HEAD_OFFSET_DELTA: number
    SHOULDER_UNEVEN_DELTA: number
  }
  triggers: {
    forwardHead: boolean
    headTilt: boolean
    shoulderUneven: boolean
  }
  postureIssues: ActivePostureIssue[]
  postureScore: number
  activeIssues: string[]
}

function resolveActiveIssues(triggers: PostureDebugSnapshot['triggers']): string[] {
  const active: string[] = []
  if (triggers.forwardHead) active.push('forward_head')
  if (triggers.shoulderUneven) active.push('shoulder_uneven')
  if (triggers.headTilt) active.push('head_tilt')
  return active
}

export function buildPostureDebugSnapshot(
  metrics: PostureMetrics,
  baseline: PostureBaseline | null
): PostureDebugSnapshot {
  const forwardDelta = baseline ? metrics.forwardRatio - baseline.forwardRatio : 0
  const headOffsetDelta = baseline ? metrics.headOffsetRatio - baseline.headOffsetRatio : 0
  const unevenDelta = baseline
    ? metrics.shoulderUnevenRatio - baseline.shoulderUnevenRatio
    : 0

  const forwardHead = baseline
    ? metrics.forwardRatio > baseline.forwardRatio + FORWARD_RATIO_DELTA
    : false
  const headTilt = baseline
    ? metrics.headOffsetRatio > baseline.headOffsetRatio + HEAD_OFFSET_DELTA
    : false
  const shoulderUneven = baseline
    ? metrics.shoulderUnevenRatio > baseline.shoulderUnevenRatio + SHOULDER_UNEVEN_DELTA
    : false

  const triggers = { forwardHead, headTilt, shoulderUneven }

  const activeIssues =
    !baseline || !metrics.trackable ? [] : resolveActiveIssues(triggers)

  return {
    trackable: metrics.trackable,
    shoulderWidth: metrics.shoulderWidth,
    minShoulderWidth: MIN_SHOULDER_WIDTH_RATIO,
    neckAngleDeg: metrics.neckAngleDeg,
    shoulderTiltDeg: metrics.shoulderTiltDeg,
    forwardRatio: metrics.forwardRatio,
    headOffsetRatio: metrics.headOffsetRatio,
    shoulderUnevenRatio: metrics.shoulderUnevenRatio,
    baseline,
    deltas: {
      forward: forwardDelta,
      headOffset: headOffsetDelta,
      uneven: unevenDelta
    },
    thresholds: {
      FORWARD_RATIO_DELTA,
      HEAD_OFFSET_DELTA,
      SHOULDER_UNEVEN_DELTA
    },
    triggers,
    postureIssues: metrics.postureIssues,
    postureScore: metrics.postureScore,
    activeIssues
  }
}
