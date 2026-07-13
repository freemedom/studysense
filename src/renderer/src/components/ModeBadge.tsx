import { useContextStore } from '../store/contextStore'
import { getModeLabel } from '../context/modeProfiles'

export default function ModeBadge(): React.JSX.Element {
  const activeMode = useContextStore((s) => s.activeMode)
  const contextSource = useContextStore((s) => s.contextSource)

  const sourceLabel =
    contextSource === 'wifi'
      ? 'WiFi'
      : contextSource === 'location'
        ? 'Location'
        : contextSource === 'manual'
          ? 'Manual'
          : 'Default'

  return (
    <span className={`mode-badge mode-badge-${activeMode}`}>
      {getModeLabel(activeMode)} · {sourceLabel}
    </span>
  )
}
