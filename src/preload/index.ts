/**
 * Preload script — runs in the renderer process *before* the React app loads.
 *
 * For security, the web UI cannot call Node.js or main-process APIs directly.
 * This file is the controlled bridge: we expose only whitelisted methods on `window`
 * via `contextBridge`, so the renderer can request main-process work (e.g. WiFi SSID)
 * without full system access.
 *
 * Flow: renderer `window.api.getWifiSSID()` → ipcRenderer.invoke → main ipcMain.handle
 * Types for `window.api` are declared in `index.d.ts`.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/** StudySense-specific APIs safe to call from the React renderer. */
const api = {
  getWifiSSID: (): Promise<string | null> => ipcRenderer.invoke('context:getWifiSSID'),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('context:getPlatform'),
  isGeolocationConfigured: (): Promise<boolean> =>
    ipcRenderer.invoke('context:isGeolocationConfigured'),
  writeSessionDebugExport: (payload: {
    filename: string
    content: string
  }): Promise<string> => ipcRenderer.invoke('debug:writeSessionExport', payload),
  showNotification: (payload: {
    title: string
    body: string
    tag: string
  }): Promise<boolean> => ipcRenderer.invoke('notification:show', payload),
  focusMainWindow: (): Promise<void> => ipcRenderer.invoke('window:focusMain'),
  setBreakFullscreen: (enter: boolean): Promise<void> =>
    ipcRenderer.invoke('window:setBreakFullscreen', enter),
  setStrictCloseLock: (locked: boolean): Promise<void> =>
    ipcRenderer.invoke('window:setStrictCloseLock', locked),
  setStrictMinimizeLock: (locked: boolean): Promise<void> =>
    ipcRenderer.invoke('window:setStrictMinimizeLock', locked),
  setStrictAlwaysOnTopLock: (locked: boolean): Promise<void> =>
    ipcRenderer.invoke('window:setStrictAlwaysOnTopLock', locked)
}

// With context isolation (recommended), only explicitly exposed globals reach the page.
// Without it, fall back to attaching APIs directly to `window` (dev / legacy setups).
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
