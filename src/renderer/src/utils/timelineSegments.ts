import { BLINK_RATE_HIGH, BLINK_RATE_LOW } from '../constants/thresholds'
import type {
  ActivePostureIssue,
  BlinkRateBand,
  DistanceStatus,
  Mood,
  SessionTimeline,
  TimelineTrack
} from '../types/metrics'
import type { GazeMood } from '../types/gazeLab'

export function computeBlinkRateBand(
  blinksPerMinute: number,
  blinkRateReady: boolean
): BlinkRateBand {
  if (!blinkRateReady) return 'warming_up'
  if (blinksPerMinute < BLINK_RATE_LOW) return 'low'
  if (blinksPerMinute > BLINK_RATE_HIGH) return 'high'
  return 'normal'
}

export function encodePostureTimelineValue(issues: ActivePostureIssue[]): string {
  if (issues.length === 0) return 'none'
  return [...issues].sort().join(',')
}

const MOOD_LABELS: Record<Mood, string> = {
  focused: 'Focused',
  tired: 'Tired',
  restless: 'Restless',
  distracted: 'Distracted',
  unknown: 'Unknown'
}

const DISTANCE_LABELS: Record<DistanceStatus, string> = {
  good: 'Good',
  too_near: 'Too near',
  too_far: 'Too far',
  none: 'None'
}

const GAZE_MOOD_LABELS: Record<GazeMood, string> = {
  unknown: 'Unknown',
  likelyFocused: 'Focused',
  likelyMindWandering: 'Mind wandering',
  likelyDistracted: 'Distracted'
}

const POSTURE_ISSUE_LABELS: Record<ActivePostureIssue, string> = {
  forward_head: 'Forward head',
  head_tilt: 'Head tilt',
  shoulder_uneven: 'Uneven shoulders'
}

const BLINK_RATE_LABELS: Record<BlinkRateBand, string> = {
  warming_up: 'Warming up',
  low: 'Low',
  normal: 'Normal',
  high: 'High'
}

export interface TimelineSegment {
  startPct: number
  widthPct: number
  value: string
  valueClass: string
  label: string
  startMs: number
  endMs: number
}

function toValueClass(track: TimelineTrack, value: string): string {
  if (track === 'posture') {
    return value === 'none' ? 'none' : 'issue'
  }
  return value.replace(/_/g, '-')
}

export function formatTimelineValue(track: TimelineTrack, value: string): string {
  switch (track) {
    case 'mood':
      return MOOD_LABELS[value as Mood] ?? value
    case 'distance':
      return DISTANCE_LABELS[value as DistanceStatus] ?? value
    case 'gazeMood':
      return GAZE_MOOD_LABELS[value as GazeMood] ?? value
    case 'posture':
      if (value === 'none') return 'Good'
      return value
        .split(',')
        .map((issue) => POSTURE_ISSUE_LABELS[issue as ActivePostureIssue] ?? issue)
        .join(', ')
    case 'blinkRate':
      return BLINK_RATE_LABELS[value as BlinkRateBand] ?? value
  }
}

export function buildTrackSegments(
  timeline: SessionTimeline,
  track: TimelineTrack,
  durationMs: number
): TimelineSegment[] {
  const safeDurationMs = Math.max(durationMs, 1)
  const sessionEndMs = timeline.startedAtMs + safeDurationMs
  const trackEvents = timeline.events
    .filter((event) => event.track === track)
    .sort((a, b) => a.tMs - b.tMs)

  if (trackEvents.length === 0) return []

  const segments: TimelineSegment[] = []

  for (let index = 0; index < trackEvents.length; index += 1) {
    const event = trackEvents[index]
    const startMs = Math.max(event.tMs, timeline.startedAtMs)
    const endMs =
      index + 1 < trackEvents.length
        ? Math.min(trackEvents[index + 1].tMs, sessionEndMs)
        : sessionEndMs

    if (endMs <= startMs) continue

    const startPct = ((startMs - timeline.startedAtMs) / safeDurationMs) * 100
    const widthPct = ((endMs - startMs) / safeDurationMs) * 100

    segments.push({
      startPct,
      widthPct,
      value: event.value,
      valueClass: toValueClass(track, event.value),
      label: formatTimelineValue(track, event.value),
      startMs: startMs - timeline.startedAtMs,
      endMs: endMs - timeline.startedAtMs
    })
  }

  return segments
}

export function formatSegmentTime(offsetMs: number): string {
  const totalSec = Math.max(Math.round(offsetMs / 1000), 0)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
