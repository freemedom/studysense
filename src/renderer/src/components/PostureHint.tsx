import { useSessionStore } from '../store/sessionStore'
import type { ActivePostureIssue } from '../types/metrics'

const HINT_TEXT: Record<ActivePostureIssue, string> = {
  forward_head: 'Tuck your chin — align ears with shoulders',
  head_tilt: 'Level your head and look at the center of the screen',
  shoulder_uneven: 'Drop both shoulders and keep them level'
}

export default function PostureHint(): React.JSX.Element | null {
  const showPostureHint = useSessionStore((s) => s.showPostureHint)
  const postureIssues = useSessionStore((s) => s.postureIssues)

  if (!showPostureHint || postureIssues.length === 0) {
    return null
  }

  return (
    <div className="posture-hint posture-hint-multi">
      <div className="posture-hint-title">Posture reminder</div>
      {postureIssues.map((issue) => (
        <div key={issue} className={`posture-hint-text posture-hint-${issue}`}>
          {HINT_TEXT[issue]}
        </div>
      ))}
    </div>
  )
}
