import { useEffect } from 'react'
import {
  GAZE_CALIBRATION_CLICKS_PER_POINT,
  GAZE_CALIBRATION_POINTS,
  GAZE_GO_HIT150_MIN,
  GAZE_GO_MEAN_ERROR_PX,
  GAZE_NO_GO_HIT200_MIN,
  GAZE_NO_GO_MEAN_ERROR_PX,
  GAZE_VALIDATION_HIT_RADII_PX
} from '../constants/gazeThresholds'
import { useGazeStore } from '../store/gazeStore'
import type { GoNoGoVerdict } from '../types/gazeLab'
import GazeLabOverlay, {
  startGazeCalibration,
  startGazeValidation,
  stopGazeLab
} from './GazeLabOverlay'

function verdictLabel(verdict: GoNoGoVerdict | null): string {
  if (verdict === 'go') return 'Go — suitable for proxy metrics'
  if (verdict === 'caution') return 'Caution — coarse proxy only'
  if (verdict === 'no-go') return 'No-go — low accuracy (reference only)'
  return 'Not tested yet'
}

function verdictClass(verdict: GoNoGoVerdict | null): string {
  if (verdict === 'go') return 'gaze-verdict-go'
  if (verdict === 'caution') return 'gaze-verdict-caution'
  if (verdict === 'no-go') return 'gaze-verdict-no-go'
  return 'gaze-verdict-none'
}

export default function GazeLabPanel(): React.JSX.Element {
  const labPhase = useGazeStore((s) => s.labPhase)
  const regression = useGazeStore((s) => s.regression)
  const webgazerReady = useGazeStore((s) => s.webgazerReady)
  const webgazerError = useGazeStore((s) => s.webgazerError)
  const lastReport = useGazeStore((s) => s.lastReport)
  const reportHistory = useGazeStore((s) => s.reportHistory)
  const goNoGoVerdict = useGazeStore((s) => s.goNoGoVerdict)
  const gazeCalibrated = useGazeStore((s) => s.gazeCalibrated)
  const trainingPointCount = useGazeStore((s) => s.trainingPointCount)
  const sessionGazeEnabled = useGazeStore((s) => s.sessionGazeEnabled)
  const setRegression = useGazeStore((s) => s.setRegression)
  const loadGazeCalibrationState = useGazeStore((s) => s.loadGazeCalibrationState)
  const setSessionGazeEnabled = useGazeStore((s) => s.setSessionGazeEnabled)

  useEffect(() => {
    loadGazeCalibrationState()
    const latest = useGazeStore.getState().reportHistory[0]
    if (latest && !useGazeStore.getState().goNoGoVerdict) {
      useGazeStore.getState().setGoNoGoVerdict(latest.verdict)
      useGazeStore.getState().setLastReport(latest)
    }
  }, [loadGazeCalibrationState])

  const busy = labPhase === 'calibrating' || labPhase === 'validating'

  return (
    <div className="gaze-lab-panel">
      <GazeLabOverlay />

      <p className="gaze-lab-intro">
        Test WebGazer accuracy in this Electron window before using gaze proxy metrics. Maximize
        the window and keep the same size when you study.
      </p>

      {labPhase === 'passivePreview' && (
        <p className="gaze-lab-intro gaze-lab-passive-hint">
          Gaze preview is active — the red dot follows your gaze on screen. Click Stop WebGazer to
          turn it off.
        </p>
      )}

      <div className="metric-card">
        <div className="metric-label">Regression model</div>
        <div className="gaze-lab-radio-row">
          <label>
            <input
              type="radio"
              name="gaze-regression"
              checked={regression === 'weightedRidge'}
              disabled={busy}
              onChange={() => setRegression('weightedRidge')}
            />
            weightedRidge (recommended)
          </label>
          <label>
            <input
              type="radio"
              name="gaze-regression"
              checked={regression === 'ridge'}
              disabled={busy}
              onChange={() => setRegression('ridge')}
            />
            ridge
          </label>
        </div>
      </div>

      <div className="gaze-lab-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => void startGazeCalibration({ regression })}
        >
          Start {GAZE_CALIBRATION_POINTS.length}-point calibration (
          {GAZE_CALIBRATION_CLICKS_PER_POINT}× each)
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || (labPhase !== 'preview' && labPhase !== 'passivePreview')}
          onClick={() => startGazeValidation()}
        >
          Run validation
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={labPhase === 'idle' || busy}
          onClick={() => void stopGazeLab()}
        >
          Stop WebGazer
        </button>
      </div>

      <div className="metric-card">
        <div className="metric-label">Diagnostics</div>
        <div className="gaze-lab-diagnostics">
          <div>Phase: {labPhase}</div>
          <div>
            Viewport: {window.innerWidth}×{window.innerHeight}
          </div>
          <div>WebGazer ready: {webgazerReady ? 'yes' : 'no'}</div>
          <div>WebGazer calibrated: {gazeCalibrated ? 'yes' : 'no'}</div>
          <div>Training points: {trainingPointCount}</div>
          <div>Session gaze: {sessionGazeEnabled ? 'enabled' : 'disabled'}</div>
          {webgazerError && <div className="gaze-lab-error">{webgazerError}</div>}
        </div>
      </div>

      <div className={`gaze-lab-verdict ${verdictClass(goNoGoVerdict)}`}>
        {verdictLabel(goNoGoVerdict)}
      </div>

      <div className="metric-card">
        <div className="metric-label">Go / no-go thresholds</div>
        <div className="metric-hint">
          Go: mean &lt; {GAZE_GO_MEAN_ERROR_PX}px and &gt; {Math.round(GAZE_GO_HIT150_MIN * 100)}%
          within 150px
        </div>
        <div className="metric-hint">
          No-go: mean &gt; {GAZE_NO_GO_MEAN_ERROR_PX}px or &lt;{' '}
          {Math.round(GAZE_NO_GO_HIT200_MIN * 100)}% within 200px
        </div>
      </div>

      {lastReport && (
        <div className="metric-card">
          <div className="metric-label">Latest validation</div>
          <div className="gaze-lab-report">
            <div>
              Mean {Math.round(lastReport.meanErrorPx)}px · RMS {Math.round(lastReport.rmsErrorPx)}
              px
            </div>
            <div>Precision SD {Math.round(lastReport.precisionSdPx)}px</div>
            <div>Sample rate {lastReport.sampleRateHz.toFixed(1)} Hz</div>
            {GAZE_VALIDATION_HIT_RADII_PX.map((r) => (
              <div key={r}>
                Within {r}px: {Math.round((lastReport.hitRates[r] ?? 0) * 100)}%
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="gaze-lab-session-toggle">
        <input
          type="checkbox"
          checked={sessionGazeEnabled}
          disabled={!gazeCalibrated}
          onChange={(e) => setSessionGazeEnabled(e.target.checked)}
        />
        Enable gaze proxy metrics during study sessions
      </label>
      {!gazeCalibrated && (
        <p className="metric-hint">Complete Gaze calibration before enabling session metrics.</p>
      )}
      {gazeCalibrated && goNoGoVerdict === 'no-go' && (
        <p className="metric-hint gaze-lab-low-accuracy-hint">
          Low accuracy — for reference only.
        </p>
      )}

      {reportHistory.length > 0 && (
        <>
          <div className="metrics-section-title">Saved reports</div>
          <div className="gaze-lab-history">
            {reportHistory.slice(0, 5).map((report) => (
              <div key={report.id} className="gaze-lab-history-item">
                <span>{new Date(report.recordedAt).toLocaleString()}</span>
                <span className={verdictClass(report.verdict)}>{report.verdict}</span>
                <span>{Math.round(report.meanErrorPx)}px</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
