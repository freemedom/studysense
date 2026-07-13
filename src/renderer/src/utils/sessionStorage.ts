import { SESSION_HISTORY_MAX, SESSIONS_STORAGE_KEY } from '../constants/thresholds'
import type { MoodEventCounts, PostureAlertCounts, SessionSummary } from '../types/metrics'

function isNonNegInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isMoodEvents(value: unknown): value is MoodEventCounts {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    isNonNegInt(v.focused) &&
    isNonNegInt(v.tired) &&
    isNonNegInt(v.restless) &&
    isNonNegInt(v.distracted)
  )
}

function isPostureAlertCounts(value: unknown): value is PostureAlertCounts {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    isNonNegInt(v.forward_head) &&
    isNonNegInt(v.head_tilt) &&
    isNonNegInt(v.shoulder_uneven)
  )
}

export function isValidSessionSummary(raw: unknown): raw is SessionSummary {
  if (!raw || typeof raw !== 'object') return false
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || typeof s.startedAt !== 'string' || typeof s.endedAt !== 'string') {
    return false
  }
  if (Number.isNaN(Date.parse(s.startedAt)) || Number.isNaN(Date.parse(s.endedAt))) return false
  if (!isNonNegInt(s.durationSec) || s.durationSec < 1) return false
  if (!isNonNegInt(s.blinkCount) || !isNonNegInt(s.avgBlinksPerMinute)) return false
  if (!isNonNegInt(s.distanceAlerts)) return false
  if (!isMoodEvents(s.moodEvents)) return false
  if (!isPostureAlertCounts(s.postureAlerts)) return false
  return true
}

export function loadSessions(): SessionSummary[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(isValidSessionSummary).slice(0, SESSION_HISTORY_MAX)
    if (valid.length !== parsed.length) {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(valid))
    }
    return valid
  } catch {
    return []
  }
}

export function saveSession(summary: SessionSummary): void {
  const existing = loadSessions()
  const next = [summary, ...existing].slice(0, SESSION_HISTORY_MAX)
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(next))
}
