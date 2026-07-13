import { useEffect, useRef } from 'react'
import { DEBUG_EXPORT_SAMPLE_MS } from '../constants/debugExport'
import { useSessionStore } from '../store/sessionStore'
import {
  captureSessionDebugSample,
  clearSessionDebugBuffer,
  isSessionDebugExportEnabled
} from '../utils/sessionDebugExport'

/** Dev-only: 1Hz ring buffer of face / distance / posture / gaze / attention samples. */
export function useSessionDebugRecorder(): void {
  const isRunning = useSessionStore((s) => s.isRunning)
  const wasRunning = useRef(false)

  useEffect(() => {
    if (!isSessionDebugExportEnabled()) {
      return
    }

    if (isRunning && !wasRunning.current) {
      clearSessionDebugBuffer()
    }
    wasRunning.current = isRunning

    if (!isRunning) {
      return
    }

    captureSessionDebugSample()
    const timer = window.setInterval(captureSessionDebugSample, DEBUG_EXPORT_SAMPLE_MS)
    return () => window.clearInterval(timer)
  }, [isRunning])
}
