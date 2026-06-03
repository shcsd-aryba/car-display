import { app, BrowserWindow, ipcMain, desktopCapturer, session, screen } from 'electron'
import { join } from 'path'
import QRCode from 'qrcode'
import * as ipLib from 'ip'
import { startServer, sendToClient, getClients, disconnectClient } from './server'

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

app.whenReady().then(async () => {
  await createWindow()

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
