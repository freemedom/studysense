import AlertBanner from './components/AlertBanner'
import BreakOverlay from './components/BreakOverlay'
import CameraPreview from './components/CameraPreview'
import FatigueOverlay from './components/FatigueOverlay'
import GazeLiveDot from './components/GazeLiveDot'
import ModeBadge from './components/ModeBadge'
import PostureCalibrationOverlay from './components/PostureCalibrationOverlay'
import PostureHint from './components/PostureHint'
import SessionControls from './components/SessionControls'
import SidePanelTabs from './components/SidePanelTabs'
import { useContextDetector } from './hooks/useContextDetector'
import { useGazeLabBoot } from './hooks/useGazeLabBoot'
import { useGazeMetrics } from './hooks/useGazeMetrics'
import { useSessionDebugRecorder } from './hooks/useSessionDebugRecorder'

function App(): React.JSX.Element {
  useContextDetector()
  useGazeLabBoot()
  useGazeMetrics()
  useSessionDebugRecorder()

  return (
    <div className="app">
      <FatigueOverlay />
      <GazeLiveDot />
      <header className="app-header">
        <div>
          <h1>StudySense</h1>
          <p className="subtitle">
            Study assistant — mood · fatigue · distance · posture · gaze · context
            <ModeBadge />
          </p>
        </div>
        <SessionControls />
      </header>
      <AlertBanner />
      <main className="app-main">
        <CameraPreview />
        <div className="side-panels">
          <SidePanelTabs />
        </div>
      </main>
      <PostureHint />
      <BreakOverlay />
      <PostureCalibrationOverlay />
    </div>
  )
}

export default App
