import { useCallback, useEffect } from 'react'
import { useGazeStore } from '../store/gazeStore'
import {
  ensureWebGazerRunning,
  getTrainingPointCount,
  getWebGazerInstance,
  isValidGazePoint
} from '../vision/webgazerLab'

export function isLabGazeSessionActive(phase: string): boolean {
  return (
    phase === 'calibrating' ||
    phase === 'validating' ||
    phase === 'preview' ||
    phase === 'passivePreview'
  )
}

/** Keeps WebGazer booted while Gaze Lab or passive preview is active (App-level). */
export function useGazeLabBoot(): void {
  const labPhase = useGazeStore((s) => s.labPhase)
  const regression = useGazeStore((s) => s.regression)
  const setWebGazerReady = useGazeStore((s) => s.setWebGazerReady)
  const setLiveGaze = useGazeStore((s) => s.setLiveGaze)
  const pushGazeTrail = useGazeStore((s) => s.pushGazeTrail)
  const appendValidationSample = useGazeStore((s) => s.appendValidationSample)
  const setTrainingPointCount = useGazeStore((s) => s.setTrainingPointCount)

  const attachGazeListener = useCallback(() => {
    const wg = getWebGazerInstance()
    if (!wg) return
    wg.setGazeListener((data, elapsedTime) => {
      if (!data || !isValidGazePoint(data)) return
      const point = { x: data.x, y: data.y, t: elapsedTime || Date.now() }
      setLiveGaze(point)
      pushGazeTrail(point)
      const phase = useGazeStore.getState().labPhase
      if (phase === 'validating') {
        appendValidationSample(point)
      }
    })
  }, [appendValidationSample, pushGazeTrail, setLiveGaze])

  const labSessionActive = isLabGazeSessionActive(labPhase)

  useEffect(() => {
    if (!labSessionActive) {
      return
    }

    let cancelled = false

    async function boot(): Promise<void> {
      try {
        await ensureWebGazerRunning({ regression })
        if (cancelled) return
        setWebGazerReady(true, null)
        attachGazeListener()
        setTrainingPointCount(getTrainingPointCount())
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setWebGazerReady(false, message)
      }
    }

    void boot()

    return () => {
      cancelled = true
      getWebGazerInstance()?.clearGazeListener()
    }
  }, [
    labSessionActive,
    regression,
    attachGazeListener,
    setWebGazerReady,
    setTrainingPointCount
  ])
}
