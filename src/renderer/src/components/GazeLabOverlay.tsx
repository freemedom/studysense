import { useEffect, useRef, useState } from 'react'
import {
  GAZE_CALIBRATION_CLICKS_PER_POINT,
  GAZE_CALIBRATION_POINTS,
  GAZE_VALIDATION_DURATION_MS,
  GAZE_VALIDATION_POINTS
} from '../constants/gazeThresholds'
import { useGazeStore } from '../store/gazeStore'
import type { GazePoint, ValidationReport } from '../types/gazeLab'
import { buildValidationReport, computeSampleRateHz } from '../vision/gazeMetrics'
import {
  clearWebGazerData,
  endWebGazer,
  getTrainingPointCount,
  pctToPx
} from '../vision/webgazerLab'

export default function GazeLabOverlay(): React.JSX.Element | null {
  const labPhase = useGazeStore((s) => s.labPhase)
  const regression = useGazeStore((s) => s.regression)
  const calibrationIndex = useGazeStore((s) => s.calibrationIndex)
  const calibrationClick = useGazeStore((s) => s.calibrationClick)
  const validationIndex = useGazeStore((s) => s.validationIndex)
  const liveGaze = useGazeStore((s) => s.liveGaze)
  const setLabPhase = useGazeStore((s) => s.setLabPhase)
  const setCalibrationIndex = useGazeStore((s) => s.setCalibrationIndex)
  const setCalibrationClick = useGazeStore((s) => s.setCalibrationClick)
  const setValidationIndex = useGazeStore((s) => s.setValidationIndex)
  const setValidationSamples = useGazeStore((s) => s.setValidationSamples)
  const persistReport = useGazeStore((s) => s.persistReport)
  const webgazerReady = useGazeStore((s) => s.webgazerReady)
  const webgazerError = useGazeStore((s) => s.webgazerError)
  const trainingPointCount = useGazeStore((s) => s.trainingPointCount)
  const setTrainingPointCount = useGazeStore((s) => s.setTrainingPointCount)

  const validationPointResults = useRef<{ targetPct: [number, number]; samples: GazePoint[] }[]>(
    []
  )
  const validationTimer = useRef<number | null>(null)
  const calibrationAdvanceTimer = useRef<number | null>(null)
  const [validationSecondsLeft, setValidationSecondsLeft] = useState(0)
  const [calibrationPointCompleting, setCalibrationPointCompleting] = useState(false)

  useEffect(() => {
    return () => {
      if (calibrationAdvanceTimer.current) {
        window.clearTimeout(calibrationAdvanceTimer.current)
        calibrationAdvanceTimer.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (labPhase !== 'calibrating') {
      setCalibrationPointCompleting(false)
    }
  }, [labPhase, calibrationIndex])

  useEffect(() => {
    if (labPhase !== 'validating') {
      if (validationTimer.current) {
        window.clearInterval(validationTimer.current)
        validationTimer.current = null
      }
      return
    }

    const targetPct = GAZE_VALIDATION_POINTS[validationIndex]
    if (!targetPct) return

    if (validationIndex === 0) {
      validationPointResults.current = []
    }

    setValidationSamples([])
    setValidationSecondsLeft(Math.ceil(GAZE_VALIDATION_DURATION_MS / 1000))

    const startedAt = Date.now()
    validationTimer.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const left = Math.max(0, Math.ceil((GAZE_VALIDATION_DURATION_MS - elapsed) / 1000))
      setValidationSecondsLeft(left)
      if (elapsed >= GAZE_VALIDATION_DURATION_MS) {
        if (validationTimer.current) {
          window.clearInterval(validationTimer.current)
          validationTimer.current = null
        }
        const samples = [...useGazeStore.getState().validationSamples]
        validationPointResults.current.push({ targetPct, samples })

        if (validationIndex + 1 >= GAZE_VALIDATION_POINTS.length) {
          const allSamples = validationPointResults.current.flatMap((p) => p.samples)
          const report: ValidationReport = buildValidationReport({
            regression,
            sampleRateHz: computeSampleRateHz(allSamples),
            trainingPointCount: getTrainingPointCount(),
            pointSamples: validationPointResults.current
          })
          persistReport(report)
          validationPointResults.current = []
          exitGazePreview()
        } else {
          setValidationIndex(validationIndex + 1)
        }
      }
    }, 200)

    return () => {
      if (validationTimer.current) {
        window.clearInterval(validationTimer.current)
        validationTimer.current = null
      }
    }
  }, [
    labPhase,
    validationIndex,
    regression,
    persistReport,
    setLabPhase,
    setValidationIndex,
    setValidationSamples
  ])

  if (labPhase === 'idle' || labPhase === 'passivePreview') {
    return null
  }

  const calibrationPoint =
    labPhase === 'calibrating' ? GAZE_CALIBRATION_POINTS[calibrationIndex] : null
  const validationPoint =
    labPhase === 'validating' ? GAZE_VALIDATION_POINTS[validationIndex] : null

  const handleCalibrationClick = (): void => {
    if (!webgazerReady || calibrationPointCompleting) return
    setTrainingPointCount(getTrainingPointCount())
    if (calibrationClick < GAZE_CALIBRATION_CLICKS_PER_POINT) {
      setCalibrationClick(calibrationClick + 1)
      return
    }

    setCalibrationPointCompleting(true)
    calibrationAdvanceTimer.current = window.setTimeout(() => {
      calibrationAdvanceTimer.current = null
      setCalibrationPointCompleting(false)
      setCalibrationClick(1)
      const next = calibrationIndex + 1
      if (next >= GAZE_CALIBRATION_POINTS.length) {
        useGazeStore.getState().setGazeCalibrated(true)
        setLabPhase('preview')
        return
      }
      setCalibrationIndex(next)
    }, 300)
  }

  const calibrationOpacity = 0.2 * calibrationClick + 0.2
  const calibrationClicksLeft = GAZE_CALIBRATION_CLICKS_PER_POINT - calibrationClick + 1

  return (
    <div className="gaze-lab-overlay" role="dialog" aria-label="Gaze">
      <div className="gaze-lab-overlay-header">
        <div className="gaze-lab-overlay-status">
          <span>WebGazer: {webgazerReady ? 'ready' : 'starting…'}</span>
          <span>Training points: {trainingPointCount}</span>
        </div>
        {webgazerError && <div className="gaze-lab-overlay-error">{webgazerError}</div>}
        {labPhase === 'calibrating' && (
          <p>
            {webgazerReady
              ? `Look at the blue dot, then click it — red dot shows current gaze prediction · point ${calibrationIndex + 1}/${GAZE_CALIBRATION_POINTS.length}`
              : 'Waiting for WebGazer to start…'}
          </p>
        )}
        {labPhase === 'validating' && (
          <p>
            Look at the green dot — do not click ({validationIndex + 1}/
            {GAZE_VALIDATION_POINTS.length}) · {validationSecondsLeft}s
          </p>
        )}
        {labPhase === 'preview' && (
          <p>
            Live preview — red dot follows predicted gaze
            {liveGaze
              ? ` · (${Math.round(liveGaze.x)}, ${Math.round(liveGaze.y)})`
              : ' · waiting for gaze signal…'}
          </p>
        )}
      </div>

      <div className="gaze-lab-overlay-actions">
        {labPhase === 'preview' && (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => startGazeValidation()}
            >
              Run validation
            </button>
            <button
              type="button"
              className="btn-ghost gaze-lab-overlay-btn-exit"
              onClick={() => exitGazePreview()}
            >
              Exit preview
            </button>
          </>
        )}
        {labPhase === 'validating' && (
          <button
            type="button"
            className="btn-ghost gaze-lab-overlay-btn-exit"
            onClick={() => setLabPhase('preview')}
          >
            Cancel validation
          </button>
        )}
        {labPhase === 'calibrating' && (
          <button
            type="button"
            className="btn-ghost gaze-lab-overlay-btn-exit"
            onClick={() => void stopGazeLab()}
          >
            Cancel calibration
          </button>
        )}
      </div>

      {calibrationPoint && (
        <>
          <button
            type="button"
            className={`gaze-lab-target gaze-lab-target--calibrate${calibrationPointCompleting ? ' gaze-lab-target--calibrate-complete' : ''}`}
            disabled={!webgazerReady || calibrationPointCompleting}
            style={{
              left: `${calibrationPoint[0]}%`,
              top: `${calibrationPoint[1]}%`,
              opacity: webgazerReady && !calibrationPointCompleting ? calibrationOpacity : undefined
            }}
            onClick={handleCalibrationClick}
            aria-label={`Calibration point ${calibrationIndex + 1}, click ${calibrationClick} of ${GAZE_CALIBRATION_CLICKS_PER_POINT}`}
            aria-disabled={!webgazerReady || calibrationPointCompleting}
          />
          <div
            className="gaze-lab-calibrate-hint"
            style={{
              left: pctToPx(calibrationPoint).x,
              top: pctToPx(calibrationPoint).y
            }}
          >
            {calibrationPointCompleting
              ? 'Done!'
              : `Click ${calibrationClicksLeft} more time${calibrationClicksLeft === 1 ? '' : 's'}`}
          </div>
        </>
      )}

      {validationPoint && (
        <div
          className="gaze-lab-target gaze-lab-target--validate"
          style={{
            left: `${validationPoint[0]}%`,
            top: `${validationPoint[1]}%`
          }}
        />
      )}

      {labPhase === 'validating' && validationPoint && (
        <div
          className="gaze-lab-validate-hint"
          style={{
            left: pctToPx(validationPoint).x,
            top: pctToPx(validationPoint).y
          }}
        >
          target
        </div>
      )}
    </div>
  )
}

export function exitGazePreview(): void {
  const store = useGazeStore.getState()
  store.setLabPhase('passivePreview')
  store.setLabActive(false)
}

export function startGazeValidation(): void {
  const store = useGazeStore.getState()
  store.setValidationIndex(0)
  store.setValidationSamples([])
  store.setLabActive(true)
  store.setLabPhase('validating')
}

export async function startGazeCalibration(options: {
  regression: 'ridge' | 'weightedRidge'
}): Promise<void> {
  const store = useGazeStore.getState()
  store.setLabActive(true)
  store.setRegression(options.regression)
  store.resetLabFlow()
  store.setCalibrationIndex(0)
  store.setCalibrationClick(1)
  await clearWebGazerData()
  store.setGazeCalibrated(false)
  store.setLabPhase('calibrating')
}

export async function stopGazeLab(): Promise<void> {
  const store = useGazeStore.getState()
  store.setLabPhase('idle')
  store.setLabActive(false)
  store.setLiveGaze(null)
  store.clearGazeTrail()
  await endWebGazer()
  store.setWebGazerReady(false, null)
}
