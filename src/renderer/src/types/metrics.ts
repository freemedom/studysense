export type Mood = 'focused' | 'tired' | 'restless' | 'distracted' | 'unknown'

export interface MoodSignals {
  headJitter: number
  brow: number
  mouth: number
  jawOpen: number
  gazeDown: number
  headDown: boolean
  rawTired: boolean
  distractedHoldMs: number
}

export type DistanceStatus = 'good' | 'too_near' | 'too_far' | 'none'

export type PostureIssue =
  | 'good'
  | 'forward_head'
  | 'head_tilt'
  | 'shoulder_uneven'
  | 'unknown'

/** Actionable posture problems (excludes good / unknown). */
export type ActivePostureIssue = Exclude<PostureIssue, 'good' | 'unknown'>

export type CalibrationPhase = 'idle' | 'preparing' | 'running' | 'done'

export interface PostureBaseline {
  neckAngleDeg: number
  shoulderTiltDeg: number
  forwardRatio: number
  headOffsetRatio: number
  shoulderUnevenRatio: number
}

export interface PostureMetrics {
  neckAngleDeg: number
  shoulderTiltDeg: number
  forwardRatio: number
  headOffsetRatio: number
  shoulderWidth: number
  shoulderUnevenRatio: number
  postureIssues: ActivePostureIssue[]
  postureScore: number
  trackable: boolean
}

export type SessionMood = Exclude<Mood, 'unknown'>

export interface MoodEventCounts {
  focused: number
  tired: number
  restless: number
  distracted: number
}

export interface PostureAlertCounts {
  forward_head: number
  head_tilt: number
  shoulder_uneven: number
}

export interface GazeSessionSummary {
  centerDwellRatio: number
  belowBandRatio: number
  offScreenRatio: number
  gazeDispersion: number
  saccadeRatePerMin: number
}

export type BlinkRateBand = 'warming_up' | 'low' | 'normal' | 'high'

export type TimelineTrack = 'mood' | 'gazeMood' | 'distance' | 'posture' | 'blinkRate'

export interface SessionTimelineEvent {
  tMs: number
  track: TimelineTrack
  value: string
}

export interface SessionTimeline {
  startedAtMs: number
  events: SessionTimelineEvent[]
}

export interface SessionSummary {
  id: string
  startedAt: string
  endedAt: string
  durationSec: number
  blinkCount: number
  avgBlinksPerMinute: number
  distanceAlerts: number
  moodEvents: MoodEventCounts
  postureAlerts: PostureAlertCounts
  gazeMoodEvents?: import('./gazeLab').GazeMoodEventCounts
  /** @deprecated legacy key from localStorage — use gazeMoodEvents */
  attentionEvents?: import('./gazeLab').GazeMoodEventCounts
  gazeSummary?: GazeSessionSummary
  timeline?: SessionTimeline
}

export function emptyMoodEvents(): MoodEventCounts {
  return { focused: 0, tired: 0, restless: 0, distracted: 0 }
}

export function emptyPostureAlertCounts(): PostureAlertCounts {
  return { forward_head: 0, head_tilt: 0, shoulder_uneven: 0 }
}
