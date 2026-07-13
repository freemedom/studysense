import { useGazeStore } from '../store/gazeStore'

export default function GazeLiveDot(): React.JSX.Element | null {
  const labPhase = useGazeStore((s) => s.labPhase)
  const liveGaze = useGazeStore((s) => s.liveGaze)
  const gazeTrail = useGazeStore((s) => s.gazeTrail)
  const webgazerReady = useGazeStore((s) => s.webgazerReady)

  const showDot =
    webgazerReady &&
    liveGaze &&
    (labPhase === 'calibrating' ||
      labPhase === 'preview' ||
      labPhase === 'validating' ||
      labPhase === 'passivePreview')

  if (!showDot) {
    return null
  }

  const showTrail = labPhase === 'preview' || labPhase === 'passivePreview'

  return (
    <>
      {showTrail &&
        gazeTrail.slice(-12).map((p, i) => (
          <div
            key={`${p.t}-${i}`}
            className="gaze-live-trail-dot"
            style={{ left: p.x, top: p.y, opacity: 0.15 + (i / 12) * 0.5 }}
          />
        ))}
      <div
        className="gaze-live-dot"
        style={{ left: liveGaze.x, top: liveGaze.y }}
        aria-hidden
      />
    </>
  )
}
