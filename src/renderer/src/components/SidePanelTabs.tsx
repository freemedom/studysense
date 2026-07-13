import { useState } from 'react'
import ContextModePanel from './ContextModePanel'
import GazeLabPanel from './GazeLabPanel'
import MetricsPanel from './MetricsPanel'
import SessionHistoryPanel from './SessionHistoryPanel'

type SidePanelTab = 'live' | 'context' | 'gaze' | 'history'

const TABS: { id: SidePanelTab; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'context', label: 'Context' },
  { id: 'gaze', label: 'Gaze' },
  { id: 'history', label: 'History' }
]

export default function SidePanelTabs(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SidePanelTab>('live')

  return (
    <div className="side-panel-tabs">
      <div className="side-panel-tab-bar" role="tablist" aria-label="Side panel">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`side-panel-tab${activeTab === tab.id ? ' active' : ''}`}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="side-panel-content" role="tabpanel">
        {activeTab === 'live' && <MetricsPanel />}
        {activeTab === 'context' && <ContextModePanel />}
        {activeTab === 'gaze' && <GazeLabPanel />}
        {activeTab === 'history' && <SessionHistoryPanel />}
      </div>
    </div>
  )
}
