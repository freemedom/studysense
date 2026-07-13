import { DEBUG_EXPORT_SAMPLE_MS, DEBUG_EXPORT_WINDOW_MS } from '../constants/debugExport'
import { useGazeStore } from '../store/gazeStore'
import { useSessionStore } from '../store/sessionStore'
import type { GazeMood, GazeProxyMetrics, GoNoGoVerdict } from '../types/gazeLab'
import type { ActivePostureIssue, DistanceStatus, Mood } from '../types/metrics'

export interface SessionDebugSample {
  t: number
  mood: Mood
  fatigueLevel: number
  ear: number
  blinksPerMinute: number
  blinkCount: number
  blinkRateReady: boolean
  headJitter: number | null
  brow: number | null
  mouth: number | null
  jawOpen: number | null
  gazeDown: number | null
  headDown: boolean | null
  rawTired: boolean | null
  distractedHoldMs: number | null
  faceRatio: number
  distanceStatus: DistanceStatus
  neckAngleDeg: number
  shoulderTiltDeg: number
  forwardRatio: number
  headOffsetRatio: number
  postureScore: number
  postureTrackable: boolean
  postureIssues: ActivePostureIssue[]
  sessionGazeEnabled: boolean
  gaze: GazeProxyMetrics | null
  gazeMood: GazeMood | null
  gazeMoodCandidate: GazeMood | null
  goNoGoVerdict: GoNoGoVerdict | null
}

export interface SessionDebugExportMeta {
  sessionId: string
  startedAt: number
  endedAt: number
  durationSec: number
  sessionGazeEnabled: boolean
}

const samples: SessionDebugSample[] = []

const CSV_COLUMNS = [
  't',
  'isoTime',
  'mood',
  'fatigueLevel',
  'ear',
  'blinksPerMinute',
  'blinkCount',
  'blinkRateReady',
  'headJitter',
  'brow',
  'mouth',
  'jawOpen',
  'gazeDown',
  'headDown',
  'rawTired',
  'distractedHoldMs',
  'faceRatio',
  'distanceStatus',
  'neckAngleDeg',
  'shoulderTiltDeg',
  'forwardRatio',
  'headOffsetRatio',
  'postureScore',
  'postureTrackable',
  'postureIssues',
  'sessionGazeEnabled',
  'centerDwellRatio',
  'belowBandRatio',
  'offScreenRatio',
  'gazeDispersion',
  'fixationRatePerMin',
  'meanFixationMs',
  'saccadeRatePerMin',
  'saccadeRateTrend',
  'gazeMood',
  'gazeMoodCandidate',
  'goNoGoVerdict'
] as const

export function isSessionDebugExportEnabled(): boolean {
  return import.meta.env.DEV
}

export function clearSessionDebugBuffer(): void {
  samples.length = 0
}

export function pushSessionDebugSample(sample: SessionDebugSample): void {
  if (!isSessionDebugExportEnabled()) return
  samples.push(sample)
  const cutoff = sample.t - DEBUG_EXPORT_WINDOW_MS
  while (samples.length > 0 && samples[0].t < cutoff) {
    samples.shift()
  }
}

export function captureSessionDebugSample(): void {
  if (!isSessionDebugExportEnabled()) return

  const session = useSessionStore.getState()
  const gazeStore = useGazeStore.getState()
  const signals = session.moodSignals
  const gazeEnabled = gazeStore.sessionGazeEnabled

  pushSessionDebugSample({
    t: Date.now(),
    mood: session.mood,
    fatigueLevel: session.fatigueLevel,
    ear: session.ear,
    blinksPerMinute: session.blinksPerMinute,
    blinkCount: session.blinkCount,
    blinkRateReady: session.blinkRateReady,
    headJitter: signals?.headJitter ?? null,
    brow: signals?.brow ?? null,
    mouth: signals?.mouth ?? null,
    jawOpen: signals?.jawOpen ?? null,
    gazeDown: signals?.gazeDown ?? null,
    headDown: signals?.headDown ?? null,
    rawTired: signals?.rawTired ?? null,
    distractedHoldMs: signals?.distractedHoldMs ?? null,
    faceRatio: session.faceRatio,
    distanceStatus: session.distanceStatus,
    neckAngleDeg: session.neckAngleDeg,
    shoulderTiltDeg: session.shoulderTiltDeg,
    forwardRatio: session.forwardRatio,
    headOffsetRatio: session.headOffsetRatio,
    postureScore: session.postureScore,
    postureTrackable: session.postureTrackable,
    postureIssues: [...session.postureIssues],
    sessionGazeEnabled: gazeEnabled,
    gaze: gazeEnabled ? { ...gazeStore.proxyMetrics } : null,
    gazeMood: gazeEnabled ? gazeStore.gazeMood : null,
    gazeMoodCandidate: gazeEnabled ? gazeStore.gazeMoodCandidate : null,
    goNoGoVerdict: gazeEnabled ? gazeStore.goNoGoVerdict : null
  })
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function formatExportTimestamp(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function sampleToRow(sample: SessionDebugSample): string {
  const gaze = sample.gaze
  return [
    sample.t,
    new Date(sample.t).toISOString(),
    sample.mood,
    sample.fatigueLevel,
    sample.ear,
    sample.blinksPerMinute,
    sample.blinkCount,
    sample.blinkRateReady,
    sample.headJitter,
    sample.brow,
    sample.mouth,
    sample.jawOpen,
    sample.gazeDown,
    sample.headDown,
    sample.rawTired,
    sample.distractedHoldMs,
    sample.faceRatio,
    sample.distanceStatus,
    sample.neckAngleDeg,
    sample.shoulderTiltDeg,
    sample.forwardRatio,
    sample.headOffsetRatio,
    sample.postureScore,
    sample.postureTrackable,
    sample.postureIssues.join(';'),
    sample.sessionGazeEnabled,
    gaze?.centerDwellRatio ?? '',
    gaze?.belowBandRatio ?? '',
    gaze?.offScreenRatio ?? '',
    gaze?.gazeDispersion ?? '',
    gaze?.fixationRatePerMin ?? '',
    gaze?.meanFixationMs ?? '',
    gaze?.saccadeRatePerMin ?? '',
    gaze?.saccadeRateTrend ?? '',
    sample.gazeMood ?? '',
    sample.gazeMoodCandidate ?? '',
    sample.goNoGoVerdict ?? ''
  ]
    .map((v) => csvCell(v as string | number | boolean | null | undefined))
    .join(',')
}

export function buildSessionDebugCsv(meta: SessionDebugExportMeta): string {
  const metaLine = [
    `# sessionId=${meta.sessionId}`,
    `startedAt=${new Date(meta.startedAt).toISOString()}`,
    `endedAt=${new Date(meta.endedAt).toISOString()}`,
    `durationSec=${meta.durationSec}`,
    `sessionGazeEnabled=${meta.sessionGazeEnabled}`,
    `sampleIntervalMs=${DEBUG_EXPORT_SAMPLE_MS}`,
    `maxWindowMs=${DEBUG_EXPORT_WINDOW_MS}`,
    `sampleCount=${samples.length}`
  ].join(',')

  const lines = [metaLine, CSV_COLUMNS.join(','), ...samples.map(sampleToRow)]
  return `${lines.join('\r\n')}\r\n`
}

export async function exportSessionDebugCsv(meta: SessionDebugExportMeta): Promise<void> {
  if (!isSessionDebugExportEnabled()) return
  if (samples.length === 0) {
    console.info('[StudySense:debug] no samples to export')
    return
  }

  const content = buildSessionDebugCsv(meta)
  const filename = `session-debug-${formatExportTimestamp(meta.endedAt)}.csv`

  try {
    const filePath = await window.api.writeSessionDebugExport({ filename, content })
    console.info('[StudySense:debug] exported', filePath)
  } catch (err) {
    console.error('[StudySense:debug] export failed', err)
  }
}
