import { useEffect } from 'react'
import {
  BREAK_NOTIFICATION_BODY,
  BREAK_NOTIFICATION_TITLE
} from '../constants/alertCopy'
import { useSessionStore } from '../store/sessionStore'

export default function BreakOverlay(): React.JSX.Element | null {
  const showBreak = useSessionStore((s) => s.showBreak)
  const breakSecondsLeft = useSessionStore((s) => s.breakSecondsLeft)

  // Re-run this effect when `showBreak` changes (React dependency array).
  // - false → true: register the Space key listener to dismiss the overlay early.
  // - true → false: cleanup runs first (removeEventListener), then the effect returns early.
  // - unchanged: effect does not re-run, avoiding duplicate listeners.
  // Including `showBreak` keeps the listener in sync with overlay visibility and satisfies the Rules of Hooks.
  useEffect(() => {
    if (!showBreak) return
    void window.api.setBreakFullscreen(true)
    return () => {
      void window.api.setBreakFullscreen(false)
    }
  }, [showBreak])

  useEffect(() => {
    if (!showBreak) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        useSessionStore.getState().dismissBreak()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showBreak])

  if (!showBreak) return null

  return (
    <div className="break-overlay">
      <div className="break-card">
        <h2>{BREAK_NOTIFICATION_TITLE}</h2>
        <p>{BREAK_NOTIFICATION_BODY}</p>
        <div className="break-timer">{breakSecondsLeft}</div>
        <p className="break-hint">Press Space to dismiss early</p>
      </div>
    </div>
  )
}
