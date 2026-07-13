import { ElectronAPI } from '@electron-toolkit/preload'

export interface StudySenseAPI {
  getWifiSSID: () => Promise<string | null>
  getPlatform: () => Promise<NodeJS.Platform>
  isGeolocationConfigured: () => Promise<boolean>
  writeSessionDebugExport: (payload: { filename: string; content: string }) => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: StudySenseAPI
  }
}
