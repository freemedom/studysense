import { useSessionStore } from '../store/sessionStore'

export default function FatigueOverlay(): React.JSX.Element {
  const fatigueLevel = useSessionStore((s) => s.fatigueLevel)
  const mood = useSessionStore((s) => s.mood)

  const hue =
    mood === 'tired'
      ? '45'
      : mood === 'restless'
        ? '280'
        : mood === 'distracted'
          ? '25'
          : fatigueLevel > 0.5
            ? '30'
            : '140'

  const opacity = 0.15 + fatigueLevel * 0.35

  return (
    <div
      className="fatigue-overlay"
      style={{
        boxShadow: `inset 0 0 80px 20px hsla(${hue}, 80%, 50%, ${opacity})`
      }}
      aria-hidden
    />
  )
}
