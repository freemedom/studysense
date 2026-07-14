import type { SessionTimeline as SessionTimelineData, TimelineTrack } from '../types/metrics'
import { buildTrackSegments, formatSegmentTime } from '../utils/timelineSegments'

const TRACK_ORDER: TimelineTrack[] = ['mood', 'gazeMood', 'distance', 'posture', 'blinkRate']

const TRACK_LABELS: Record<TimelineTrack, string> = {
  mood: 'Mood',
  gazeMood: 'Gaze mood',
  distance: 'Distance',
  posture: 'Posture',
  blinkRate: 'Blink rate'
}

interface SessionTimelineProps {
  timeline?: SessionTimelineData
  durationSec: number
}

export default function SessionTimeline({
  timeline,
  durationSec
}: SessionTimelineProps): React.JSX.Element | null {
  if (!timeline || timeline.events.length === 0) return null

  const durationMs = Math.max(durationSec * 1000, 1)

  return (
    <div className="session-history-group">
      <div className="session-history-group-title">State timeline</div>
      <div className="session-timeline">
        {TRACK_ORDER.map((track) => {
          const segments = buildTrackSegments(timeline, track, durationMs)
          return (
            <div key={track} className="timeline-row">
              <span className="timeline-label">{TRACK_LABELS[track]}</span>
              <div className="timeline-track" aria-label={TRACK_LABELS[track]}>
                {segments.map((segment, index) => (
                  <div
                    key={`${track}-${index}`}
                    className={`timeline-segment timeline-${track} timeline-value-${segment.valueClass}`}
                    style={{
                      left: `${segment.startPct}%`,
                      width: `${segment.widthPct}%`
                    }}
                    title={`${segment.label} (${formatSegmentTime(segment.startMs)} – ${formatSegmentTime(segment.endMs)})`}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
