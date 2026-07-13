declare module 'webgazer' {
  export interface WebGazerGazeData {
    x: number
    y: number
  }

  export interface WebGazerParams {
    videoContainerId: string
    videoElementId: string
    videoElementCanvasId: string
    faceOverlayId: string
    faceFeedbackBoxId: string
    gazeDotId: string
    videoViewerWidth: number
    videoViewerHeight: number
    showVideo: boolean
    showFaceOverlay: boolean
    showFaceFeedbackBox: boolean
    showGazeDot: boolean
    saveDataAcrossSessions: boolean
    camConstraints: MediaStreamConstraints
    [key: string]: unknown
  }

  export interface WebGazerInstance {
    params: WebGazerParams
    begin: (onFail?: () => void) => Promise<WebGazerInstance>
    isReady: () => boolean
    pause: () => WebGazerInstance
    resume: () => Promise<WebGazerInstance>
    recordScreenPosition: (x: number, y: number, eventType?: string) => WebGazerInstance
    end: () => WebGazerInstance
    isReady: () => boolean
    setRegression: (name: string) => WebGazerInstance
    getRegression: () => unknown[]
    setGazeListener: (
      listener: (data: WebGazerGazeData | null, elapsedTime: number) => void
    ) => WebGazerInstance
    clearGazeListener: () => WebGazerInstance
    clearData: () => Promise<void>
    addMouseEventListeners: () => WebGazerInstance
    removeMouseEventListeners: () => WebGazerInstance
    showVideo: (show: boolean) => WebGazerInstance
    showVideoPreview: (show: boolean) => WebGazerInstance
    showPredictionPoints: (show: boolean) => WebGazerInstance
    showFaceOverlay: (show: boolean) => WebGazerInstance
    showFaceFeedbackBox: (show: boolean) => WebGazerInstance
    applyKalmanFilter: (apply: boolean) => WebGazerInstance
    saveDataAcrossSessions: (save: boolean) => WebGazerInstance
    setVideoViewerSize: (width: number, height: number) => WebGazerInstance
    getStoredPoints: () => unknown[]
    getCurrentPrediction: (regIndex?: number) => WebGazerGazeData | null
  }

  const webgazer: WebGazerInstance
  export default webgazer
}
