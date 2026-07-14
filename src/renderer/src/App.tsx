import { useState } from 'react'
import AlertBanner from './components/AlertBanner'
import BreakOverlay from './components/BreakOverlay'
import CameraPreview from './components/CameraPreview'
import FatigueOverlay from './components/FatigueOverlay'
import GazeLiveDot from './components/GazeLiveDot'
import ModeBadge from './components/ModeBadge'
import PostureCalibrationOverlay from './components/PostureCalibrationOverlay'
import SessionControls from './components/SessionControls'
import SidePanelTabs, { type SidePanelTab } from './components/SidePanelTabs'
import { useContextDetector } from './hooks/useContextDetector'
import { useGazeLabBoot } from './hooks/useGazeLabBoot'
import { useGazeMetrics } from './hooks/useGazeMetrics'
import { useGazeMoodTimeline } from './hooks/useGazeMoodTimeline'
import { useMirrorNotifications } from './hooks/useMirrorNotifications'
import { useSessionDebugRecorder } from './hooks/useSessionDebugRecorder'
import { useStrictSessionEnforcer } from './hooks/useStrictSessionEnforcer'

function App(): React.JSX.Element {
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('live')
  const isHistoryFullWidth = sidePanelTab === 'history'

  useContextDetector()
  useGazeLabBoot()
  useGazeMetrics()
  useGazeMoodTimeline()
  useSessionDebugRecorder()
  useMirrorNotifications()
  useStrictSessionEnforcer()

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
      <main className={`app-main${isHistoryFullWidth ? ' app-main--history-full' : ''}`}>
        <CameraPreview />
        <div className="side-panels">
          <SidePanelTabs activeTab={sidePanelTab} onTabChange={setSidePanelTab} />
        </div>
      </main>
      <BreakOverlay />
      <PostureCalibrationOverlay />
    </div>
  )
}

export default App
