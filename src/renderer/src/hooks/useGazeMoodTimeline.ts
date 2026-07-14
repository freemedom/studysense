import { useEffect, useRef } from 'react'
import { useGazeStore } from '../store/gazeStore'
import { useSessionStore } from '../store/sessionStore'
import type { GazeMood } from '../types/gazeLab'

export function useGazeMoodTimeline(): void {
  const isRunning = useSessionStore((state) => state.isRunning)
  const sessionGazeEnabled = useGazeStore((state) => state.sessionGazeEnabled)
  const gazeMood = useGazeStore((state) => state.gazeMood)
  const prevGazeMood = useRef<GazeMood | null>(null)

  useEffect(() => {
    if (!isRunning || !sessionGazeEnabled) {
      prevGazeMood.current = null
      return
    }

    if (prevGazeMood.current === null) {
      prevGazeMood.current = gazeMood
      return
    }

    if (gazeMood !== prevGazeMood.current) {
      useSessionStore.getState().pushTimelineEvent('gazeMood', gazeMood)
      prevGazeMood.current = gazeMood
    }
  }, [gazeMood, isRunning, sessionGazeEnabled])
}
