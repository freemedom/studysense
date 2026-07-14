import ContextModePanel from './ContextModePanel'
import GazeLabPanel from './GazeLabPanel'
import MetricsPanel from './MetricsPanel'
import SessionHistoryPanel from './SessionHistoryPanel'

export type SidePanelTab = 'live' | 'context' | 'gaze' | 'history'

interface SidePanelTabsProps {
  activeTab: SidePanelTab
  onTabChange: (tab: SidePanelTab) => void
}

const TABS: { id: SidePanelTab; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'context', label: 'Context' },
  { id: 'gaze', label: 'Gaze' },
  { id: 'history', label: 'History' }
]

export default function SidePanelTabs({
  activeTab,
  onTabChange
}: SidePanelTabsProps): React.JSX.Element {
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
            onClick={() => onTabChange(tab.id)}
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
