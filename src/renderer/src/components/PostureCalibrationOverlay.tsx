import { useSessionStore } from '../store/sessionStore'

export default function PostureCalibrationOverlay(): React.JSX.Element | null {
  const calibrationPhase = useSessionStore((s) => s.calibrationPhase)
  const calibrationSecondsLeft = useSessionStore((s) => s.calibrationSecondsLeft)
  const beginCalibrationRecording = useSessionStore((s) => s.beginCalibrationRecording)
  const cancelCalibration = useSessionStore((s) => s.cancelCalibration)

  if (calibrationPhase !== 'preparing' && calibrationPhase !== 'running') return null

  if (calibrationPhase === 'preparing') {
    return (
      <div className="break-overlay calibration-overlay">
        <div className="break-card calibration-card">
          <h2>Posture calibration</h2>
          <p>Sit upright, relax your shoulders, face the screen, and keep both shoulders in view</p>
          <p className="break-hint">When ready, tap below to record your healthy posture baseline</p>
          <button type="button" className="btn-primary" onClick={beginCalibrationRecording}>
            I&apos;m ready — start calibration
          </button>
          <button type="button" className="btn-secondary calibration-cancel" onClick={cancelCalibration}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="break-overlay calibration-overlay">
      <div className="break-card calibration-card">
        <h2>Posture calibration</h2>
        <p>Sit upright, relax your shoulders, face the screen, and keep both shoulders in view</p>
        <div className="break-timer">{calibrationSecondsLeft}</div>
        <p className="break-hint">Hold this pose — recording your healthy posture baseline</p>
        <button type="button" className="btn-secondary calibration-cancel" onClick={cancelCalibration}>
          Cancel
        </button>
      </div>
    </div>
  )
}
