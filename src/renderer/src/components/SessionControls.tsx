import { useSessionStore } from '../store/sessionStore'

export default function SessionControls(): React.JSX.Element {
  const isRunning = useSessionStore((s) => s.isRunning)
  const isReady = useSessionStore((s) => s.isReady)
  const calibrationPhase = useSessionStore((s) => s.calibrationPhase)
  const startCalibration = useSessionStore((s) => s.startCalibration)
  const stopSession = useSessionStore((s) => s.stopSession)

  const inCalibrationFlow = calibrationPhase === 'preparing' || calibrationPhase === 'running'

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
          disabled={calibrationPhase === 'running'}
          onClick={stopSession}
        >
          End session
        </button>
      )}
    </div>
  )
}
