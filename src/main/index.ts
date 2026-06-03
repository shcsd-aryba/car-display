import { app, BrowserWindow, ipcMain, desktopCapturer, session, screen, dialog, shell, systemPreferences } from 'electron'
import { join } from 'path'
import QRCode from 'qrcode'
import * as ipLib from 'ip'
import { startServer, sendToClient, getClients, disconnectClient } from './server'

// WGC (Windows Graphics Capture) fails with E_INVALIDARG on some hardware/drivers.
// Fall back to the older DXGI/GDI capturer which is universally compatible.
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'WebRtcUseWgcDesktopCapture')
}

let mainWindow: BrowserWindow | null = null
const SERVER_PORT = 8080

function getLocalIp(): string {
  try {
    return ipLib.address()
  } catch {
    return '127.0.0.1'
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#0d0d0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  })

  // Auto-allow all media permissions for screen capture
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true)
  })

  session.defaultSession.setPermissionCheckHandler(() => true)

  // Start the HTTP/WS signaling server
  startServer(SERVER_PORT, mainWindow.webContents)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function checkMacPermissions(): Promise<void> {
  if (process.platform !== 'darwin') return

  // Screen Recording permission — must be granted for desktopCapturer to return sources.
  // There is no programmatic API to request it; we detect and guide the user.
  const status = systemPreferences.getMediaAccessStatus('screen')
  if (status !== 'granted') {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Screen Recording Permission Required',
      message: 'CarDisplay needs Screen Recording access to stream your screen.',
      detail:
        'Go to System Settings → Privacy & Security → Screen Recording, ' +
        'enable CarDisplay, then restart the app.',
      buttons: ['Open System Settings', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0) {
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      )
    }
  }

  // Accessibility permission — needed for touch-to-mouse injection.
  const axGranted = systemPreferences.isTrustedAccessibilityClient(false)
  if (!axGranted) {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Accessibility Permission (Optional)',
      message: 'Enable touch-to-mouse control?',
      detail:
        'To forward touch events from the browser to your Mac\'s cursor, ' +
        'go to System Settings → Privacy & Security → Accessibility and enable CarDisplay.',
      buttons: ['Open System Settings', 'Skip'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0) {
      systemPreferences.isTrustedAccessibilityClient(true) // triggers the system prompt
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
      )
    }
  }
}

app.whenReady().then(async () => {
  await createWindow()
  await checkMacPermissions()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 200 }
  })
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL()
  }))
})

ipcMain.handle('get-server-info', async () => {
  const ip = getLocalIp()
  const url = `http://${ip}:${SERVER_PORT}`
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 200,
    margin: 1,
    color: { dark: '#ffffff', light: '#00000000' }
  })
  const { width, height } = screen.getPrimaryDisplay().size
  return { port: SERVER_PORT, ip, url, qrDataUrl, screenWidth: width, screenHeight: height }
})

ipcMain.handle('get-clients', () => {
  return getClients()
})

ipcMain.handle('disconnect-client', (_event, clientId: string) => {
  disconnectClient(clientId)
})

// Relay signaling answer from renderer → WebSocket client
ipcMain.on('signaling-answer', (_event, { clientId, sdp }: { clientId: string; sdp: RTCSessionDescriptionInit }) => {
  sendToClient(clientId, { type: 'answer', sdp })
})

// Relay ICE candidates from renderer → WebSocket client
ipcMain.on('signaling-ice-from-renderer', (_event, { clientId, candidate }: { clientId: string; candidate: RTCIceCandidateInit }) => {
  sendToClient(clientId, { type: 'ice-candidate', candidate })
})
