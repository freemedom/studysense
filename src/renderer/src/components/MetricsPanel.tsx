import { useSessionStore } from '../store/sessionStore'
import { useGazeStore } from '../store/gazeStore'
import type { GazeMood } from '../types/gazeLab'
import {
  BROW_RESTLESS,
  EAR_TIRED,
  GAZE_DOWN_DISTRACTED,
  HEAD_JITTER_RESTLESS,
  JAW_OPEN_YAWN,
  MOOD_BLINK_WARMUP_MS,
  MOOD_HOLD_MS,
  MOUTH_TENSION_RESTLESS
} from '../constants/thresholds'
import type { ActivePostureIssue, DistanceStatus, Mood } from '../types/metrics'

const MOOD_LABELS: Record<Mood, string> = {
  focused: 'Focused',
  tired: 'Tired',
  restless: 'Restless',
  distracted: 'Distracted',
  unknown: 'Unknown'
}

const MOOD_CLASS: Record<Mood, string> = {
  focused: 'mood-focused',
  tired: 'mood-tired',
  restless: 'mood-restless',
  distracted: 'mood-distracted',
  unknown: 'mood-unknown'
}

const DISTANCE_LABELS: Record<DistanceStatus, string> = {
  good: 'Good distance',
  too_near: 'Too close',
  too_far: 'Too far',
  none: '—'
}

const POSTURE_LABELS: Record<ActivePostureIssue, string> = {
  forward_head: 'Forward head',
  head_tilt: 'Head tilt',
  shoulder_uneven: 'Uneven shoulders'
}

const POSTURE_CLASS: Record<ActivePostureIssue, string> = {
  forward_head: 'posture-bad',
  head_tilt: 'posture-bad',
  shoulder_uneven: 'posture-bad'
}

const GAZE_MOOD_LABELS: Record<GazeMood, string> = {
  unknown: 'Unknown',
  likelyFocused: 'Likely focused',
  likelyMindWandering: 'Mind wandering',
  likelyDistracted: 'Likely distracted'
}

const GAZE_MOOD_CLASS: Record<GazeMood, string> = {
  unknown: 'mood-unknown',
  likelyFocused: 'mood-focused',
  likelyMindWandering: 'mood-restless',
  likelyDistracted: 'mood-distracted'
}

function fatigueLevelLabel(level: number): string {
  if (level < 0.34) return 'Low'
  if (level < 0.67) return 'Medium'
  return 'High'
}

export default function MetricsPanel(): React.JSX.Element {
  const blinkCount = useSessionStore((s) => s.blinkCount)
  const blinksPerMinute = useSessionStore((s) => s.blinksPerMinute)
  const ear = useSessionStore((s) => s.ear)
  const mood = useSessionStore((s) => s.mood)
  const moodSignals = useSessionStore((s) => s.moodSignals)
  const blinkRateReady = useSessionStore((s) => s.blinkRateReady)
  const faceRatio = useSessionStore((s) => s.faceRatio)
  const distanceStatus = useSessionStore((s) => s.distanceStatus)
  const fatigueLevel = useSessionStore((s) => s.fatigueLevel)
  const isRunning = useSessionStore((s) => s.isRunning)
  const calibrationPhase = useSessionStore((s) => s.calibrationPhase)
  const postureIssues = useSessionStore((s) => s.postureIssues)
  const postureTrackable = useSessionStore((s) => s.postureTrackable)
  const neckAngleDeg = useSessionStore((s) => s.neckAngleDeg)
  const shoulderTiltDeg = useSessionStore((s) => s.shoulderTiltDeg)
  const forwardRatio = useSessionStore((s) => s.forwardRatio)
  const headOffsetRatio = useSessionStore((s) => s.headOffsetRatio)
  const postureScore = useSessionStore((s) => s.postureScore)
  const postureBaseline = useSessionStore((s) => s.postureBaseline)
  const calibrationMessage = useSessionStore((s) => s.calibrationMessage)
  const sessionGazeEnabled = useGazeStore((s) => s.sessionGazeEnabled)
  const proxyMetrics = useGazeStore((s) => s.proxyMetrics)
  const gazeMood = useGazeStore((s) => s.gazeMood)
  const goNoGoVerdict = useGazeStore((s) => s.goNoGoVerdict)

  const distancePercent = Math.min(100, Math.round(faceRatio * 200))
  const sessionActive = isRunning
  const gazeLive = sessionGazeEnabled && sessionActive
  const calibrating =
    calibrationPhase === 'preparing' || calibrationPhase === 'running'

  let sessionBannerText = 'Start a session from the header to begin tracking'
  if (calibrating) {
    sessionBannerText = 'Calibrating posture…'
  } else if (sessionActive) {
    sessionBannerText = 'Session active'
  }

  return (
    <div className="metrics-panel">
      <div
        className={`metrics-session-banner${sessionActive || calibrating ? ' metrics-session-banner-active' : ''}`}
      >
        {sessionBannerText}
      </div>

      {calibrationMessage && (
        <div className="calibration-message">{calibrationMessage}</div>
      )}

      <div className="metrics-summary-grid">
        <div className="metrics-mood-row">
          <div className="metric-card">
            <div className="metric-label">Mood</div>
            <div className={`metric-badge ${MOOD_CLASS[mood]}`}>{MOOD_LABELS[mood]}</div>
            <div className="metric-hint">Fatigue: {fatigueLevelLabel(fatigueLevel)}</div>
            <div className="fatigue-bar">
              <div className="fatigue-fill" style={{ width: `${fatigueLevel * 100}%` }} />
            </div>
          </div>

          <div className={`metric-card${!gazeLive ? ' metric-card-muted' : ''}`}>
            <div className="metric-label">Gaze mood</div>
            {gazeLive ? (
              <div className={`metric-badge ${GAZE_MOOD_CLASS[gazeMood]}`}>
                {GAZE_MOOD_LABELS[gazeMood]}
              </div>
            ) : (
              <div className="metric-badge posture-unknown">—</div>
            )}
            <div className="metric-hint">
              {gazeLive
                ? `Gaze-only heuristic — WebGazer verdict: ${goNoGoVerdict ?? 'none'}`
                : sessionActive
                  ? 'Enable gaze in the Gaze tab to track proxy metrics'
                  : 'Available during an active session with gaze enabled'}
            </div>
            {gazeLive && goNoGoVerdict === 'no-go' && (
              <p className="metric-hint gaze-lab-low-accuracy-hint">
                Low accuracy — for reference only.
              </p>
            )}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Blinks per minute</div>
          <div className="metric-value small">
            {sessionActive ? (
              <>
                {blinksPerMinute}
                <span className="metric-unit">/ min</span>
              </>
            ) : (
              '—'
            )}
          </div>
          <div className="metric-hint">
            {sessionActive
              ? `Total: ${blinkCount} blinks`
              : 'Starts counting when session is active'}
          </div>
        </div>

        <div className={`metric-card${!sessionActive ? ' metric-card-muted' : ''}`}>
          <div className="metric-label">Screen distance</div>
          <div
            className={
              sessionActive
                ? `metric-badge distance-badge status-${distanceStatus}`
                : 'metric-badge posture-unknown'
            }
          >
            {sessionActive ? DISTANCE_LABELS[distanceStatus] : '—'}
          </div>
          {sessionActive && (
            <div className="distance-bar">
              <div
                className={`distance-fill status-${distanceStatus}`}
                style={{ width: `${distancePercent}%` }}
              />
            </div>
          )}
        </div>

        <div className={`metric-card${!sessionActive ? ' metric-card-muted' : ''}`}>
          <div className="metric-label">Posture</div>
          <div className="posture-badges">
            {!sessionActive || !postureTrackable ? (
              <div className="metric-badge posture-unknown">Not detected</div>
            ) : postureIssues.length === 0 ? (
              <div className="metric-badge posture-good">Good posture</div>
            ) : (
              postureIssues.map((issue) => (
                <div key={issue} className={`metric-badge ${POSTURE_CLASS[issue]}`}>
                  {POSTURE_LABELS[issue]}
                </div>
              ))
            )}
          </div>
          {sessionActive && postureTrackable && (
            <>
              <div className="metric-hint">Deviation</div>
              <div className="fatigue-bar">
                <div
                  className="posture-fill"
                  style={{ width: `${Math.min(100, postureScore * 100)}%` }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <details className="metrics-advanced">
        <summary className="metrics-advanced-summary">Advanced details</summary>
        <div className="metrics-advanced-body">
          <div className="metric-card">
            <div className="metric-label">EAR (eye aspect ratio)</div>
            <div className="metric-value small">{moodSignals ? ear.toFixed(3) : '—'}</div>
            <div className="metric-hint">Tired if &lt; {EAR_TIRED}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Blink rate ready</div>
            <div className="metric-value small">{blinkRateReady ? 'Ready' : 'Stabilizing…'}</div>
            <div className="metric-hint">
              Ready after {MOOD_BLINK_WARMUP_MS / 1000}s of observation
            </div>
          </div>

          <div className="metrics-section-title">Mood signals</div>
          <div className="metric-card">
            <div className="metric-label">Head jitter (2s)</div>
            <div className="metric-value small">
              {moodSignals ? moodSignals.headJitter.toFixed(4) : '—'}
            </div>
            <div className="metric-hint">Restless if &gt; {HEAD_JITTER_RESTLESS}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Brow tension</div>
            <div className="metric-value small">
              {moodSignals ? moodSignals.brow.toFixed(4) : '—'}
            </div>
            <div className="metric-hint">Restless if &gt; {BROW_RESTLESS}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Mouth tension</div>
            <div className="metric-value small">
              {moodSignals ? moodSignals.mouth.toFixed(4) : '—'}
            </div>
            <div className="metric-hint">Restless if &gt; {MOUTH_TENSION_RESTLESS}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Jaw open</div>
            <div className="metric-value small">
              {moodSignals ? moodSignals.jawOpen.toFixed(4) : '—'}
            </div>
            <div className="metric-hint">Contributes to tired if sustained above {JAW_OPEN_YAWN}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Gaze down</div>
            <div className="metric-value small">
              {moodSignals ? moodSignals.gazeDown.toFixed(4) : '—'}
            </div>
            <div className="metric-hint">
              Distracted if &gt; {GAZE_DOWN_DISTRACTED} with head down
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Head down</div>
            <div className="metric-value small">
              {moodSignals ? (moodSignals.headDown ? 'Yes' : 'No') : '—'}
            </div>
            <div className="metric-hint">Debug signal for distracted detection</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Raw tired</div>
            <div className="metric-value small">
              {moodSignals ? (moodSignals.rawTired ? 'Yes' : 'No') : '—'}
            </div>
            <div className="metric-hint">Blocks distracted when true</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Distracted hold</div>
            <div className="metric-value small">
              {moodSignals ? `${Math.round(moodSignals.distractedHoldMs)} ms` : '—'}
            </div>
            <div className="metric-hint">Needs {MOOD_HOLD_MS} ms continuous match</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Forward / head tilt offset</div>
            <div className="metric-value small">
              {postureTrackable
                ? `${forwardRatio.toFixed(3)} / ${headOffsetRatio.toFixed(3)}`
                : '—'}
            </div>
            {postureBaseline && (
              <div className="metric-hint">
                Baseline {postureBaseline.forwardRatio.toFixed(3)} /{' '}
                {postureBaseline.headOffsetRatio.toFixed(3)}
              </div>
            )}
          </div>
          <div className="metric-card">
            <div className="metric-label">Neck angle / shoulder tilt</div>
            <div className="metric-value small">
              {postureTrackable
                ? `${neckAngleDeg.toFixed(1)}° / ${shoulderTiltDeg.toFixed(1)}°`
                : '—'}
            </div>
            {postureBaseline && (
              <div className="metric-hint">
                Baseline {postureBaseline.neckAngleDeg.toFixed(1)}° /{' '}
                {postureBaseline.shoulderTiltDeg.toFixed(1)}°
              </div>
            )}
          </div>

          <div className="metrics-section-title">Gaze proxy (window AOI)</div>
          <div className={`metric-card${!gazeLive ? ' metric-card-muted' : ''}`}>
            <div className="metric-label">Center dwell / below band</div>
            <div className="metric-value small">
              {gazeLive
                ? `${Math.round(proxyMetrics.centerDwellRatio * 100)}% / ${Math.round(proxyMetrics.belowBandRatio * 100)}%`
                : '—'}
            </div>
          </div>
          <div className={`metric-card${!gazeLive ? ' metric-card-muted' : ''}`}>
            <div className="metric-label">Off-screen</div>
            <div className="metric-value small">
              {gazeLive ? `${Math.round(proxyMetrics.offScreenRatio * 100)}%` : '—'}
            </div>
          </div>
          <div className={`metric-card${!gazeLive ? ' metric-card-muted' : ''}`}>
            <div className="metric-label">Dispersion / saccade rate</div>
            <div className="metric-value small">
              {gazeLive
                ? `${Math.round(proxyMetrics.gazeDispersion)}px / ${proxyMetrics.saccadeRatePerMin.toFixed(1)}/min`
                : '—'}
            </div>
            <div className="metric-hint">
              Dispersion — how spread out gaze points are in the last window (px); higher means
              wider roaming.
            </div>
            <div className="metric-hint">
              Saccade rate — fast eye jumps per minute; lower often pairs with mind wandering,
              higher with active scanning.
            </div>
          </div>
          <div className={`metric-card${!gazeLive ? ' metric-card-muted' : ''}`}>
            <div className="metric-label">Fixation rate / mean duration</div>
            <div className="metric-value small">
              {gazeLive
                ? `${proxyMetrics.fixationRatePerMin.toFixed(1)}/min / ${Math.round(proxyMetrics.meanFixationMs)}ms`
                : '—'}
            </div>
            <div className="metric-hint">
              Fixation rate — low-dispersion pauses detected per minute; mainly shows whether
              fixation tracking is working.
            </div>
            <div className="metric-hint">
              Mean duration — average length of those pauses; used for focused vs mind wandering
              in Gaze mood.
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}
