import { useSessionStore } from '../store/sessionStore'
import { useContextStore } from '../store/contextStore'

export default function SessionControls(): React.JSX.Element {
  const activeMode = useContextStore((s) => s.activeMode)
  const isRunning = useSessionStore((s) => s.isRunning)
  const isReady = useSessionStore((s) => s.isReady)
  const calibrationPhase = useSessionStore((s) => s.calibrationPhase)
  const startCalibration = useSessionStore((s) => s.startCalibration)
  const stopSession = useSessionStore((s) => s.stopSession)

  const inCalibrationFlow = calibrationPhase === 'preparing' || calibrationPhase === 'running'
  const strictLocked = activeMode === 'strict' && (isRunning || inCalibrationFlow)

  return (
    <div className="session-controls">
      {!isRunning && !inCalibrationFlow ? (
        <button type="button" className="btn-primary" disabled={!isReady} onClick={startCalibration}>
          Start session
        </button>
      ) : (
        <button
          type="button"
          className="btn-secondary"
          disabled={calibrationPhase === 'running' || strictLocked}
          title={strictLocked ? 'Strict mode — session cannot be ended' : undefined}
          onClick={stopSession}
        >
          End session
        </button>
      )}
    </div>
  )
}
