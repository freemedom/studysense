import { ElectronAPI } from '@electron-toolkit/preload'

export interface StudySenseAPI {
  getWifiSSID: () => Promise<string | null>
  getPlatform: () => Promise<NodeJS.Platform>
  isGeolocationConfigured: () => Promise<boolean>
  writeSessionDebugExport: (payload: { filename: string; content: string }) => Promise<string>
  showNotification: (payload: {
    title: string
    body: string
    tag: string
  }) => Promise<boolean>
  focusMainWindow: () => Promise<void>
  setBreakFullscreen: (enter: boolean) => Promise<void>
  setStrictCloseLock: (locked: boolean) => Promise<void>
  setStrictMinimizeLock: (locked: boolean) => Promise<void>
  setStrictAlwaysOnTopLock: (locked: boolean) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: StudySenseAPI
  }
}
