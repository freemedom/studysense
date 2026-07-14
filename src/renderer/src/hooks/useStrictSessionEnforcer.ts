import { useEffect, useRef } from 'react'
import { useContextStore } from '../store/contextStore'
import { useSessionStore } from '../store/sessionStore'

export function useStrictSessionEnforcer(): void {
  const activeMode = useContextStore((s) => s.activeMode)
  const isReady = useSessionStore((s) => s.isReady)
  const isRunning = useSessionStore((s) => s.isRunning)
  const calibrationPhase = useSessionStore((s) => s.calibrationPhase)
  const startCalibration = useSessionStore((s) => s.startCalibration)

  const wasStrict = useRef(false)
  const lastMinimizeLock = useRef<boolean | null>(null)
  const lastAlwaysOnTopLock = useRef<boolean | null>(null)

  useEffect(() => {
    const isStrict = activeMode === 'strict'
    const inPreparing = calibrationPhase === 'preparing' || calibrationPhase === 'running'
    const minimizeLocked = isStrict && inPreparing
    const alwaysOnTopLocked = isStrict && inPreparing

    if (lastMinimizeLock.current !== minimizeLocked) {
      lastMinimizeLock.current = minimizeLocked
      void window.api.setStrictMinimizeLock(minimizeLocked)
    }

    if (lastAlwaysOnTopLock.current !== alwaysOnTopLocked) {
      lastAlwaysOnTopLock.current = alwaysOnTopLocked
      void window.api.setStrictAlwaysOnTopLock(alwaysOnTopLocked)
    }

    if (isStrict && !wasStrict.current) {
      void window.api.focusMainWindow()
      void window.api.setStrictCloseLock(true)
    }

    if (!isStrict && wasStrict.current) {
      void window.api.setStrictCloseLock(false)
    }

    wasStrict.current = isStrict

    if (!isStrict) return
    if (!isReady) return
    if (isRunning) return
    if (calibrationPhase !== 'idle') return

    void window.api.focusMainWindow()
    startCalibration()
  }, [activeMode, isReady, isRunning, calibrationPhase, startCalibration])
}

