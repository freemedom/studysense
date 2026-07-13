import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getWifiSSID } from './context/wifiReader'

/** Chromium on Windows uses Google's network geolocation — requires an API key or requests return 403. */
const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.STUDYSENSE_GOOGLE_API_KEY // restart powershell
// console.log('googleApiKey', googleApiKey)
if (googleApiKey) {
  app.commandLine.appendSwitch('google-api-key', googleApiKey)
}

function isGeolocationConfigured(): boolean {
  return Boolean(googleApiKey) || process.platform === 'darwin'
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.studysense.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Scaffold IPC smoke test: renderer can send 'ping' and main logs 'pong' (one-way, no reply).
  ipcMain.on('ping', () => console.log('pong'))

  // Context mode: renderer calls window.api.getWifiSSID() → preload invoke → this handler.
  // Main process reads the OS WiFi SSID (netsh / networksetup / nmcli) and returns string | null.
  ipcMain.handle('context:getWifiSSID', async () => getWifiSSID())
  ipcMain.handle('context:getPlatform', () => process.platform)
  ipcMain.handle('context:isGeolocationConfigured', () => isGeolocationConfigured())

  if (is.dev) {
    ipcMain.handle(
      'debug:writeSessionExport',
      async (_event, payload: { filename: string; content: string }) => {
        const dir = join(app.getPath('userData'), 'debug-exports')
        await mkdir(dir, { recursive: true })
        const filePath = join(dir, payload.filename)
        await writeFile(filePath, payload.content, 'utf8')
        return filePath
      }
    )
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
