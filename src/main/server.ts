import { createServer, IncomingMessage, Server as HttpServer } from 'http'
import { readFileSync } from 'fs'
import { join } from 'path'
import { WebSocketServer, WebSocket } from 'ws'
import { screen, type WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { handleInput, type InputMessage } from './input'

export interface ClientInfo {
  clientId: string
  connectedAt: number
  userAgent: string
}

interface SignalingMessage {
  type: string
  [key: string]: unknown
}

const MAX_CLIENTS = 3
const clientSockets = new Map<string, WebSocket>()
const clientInfo = new Map<string, ClientInfo>()

let wc: WebContents | null = null

function getClientDir(): string {
  // In dev: resources/client, in production: resources/client (packaged)
  return join(__dirname, '../../resources/client')
}

function serveFile(res: Parameters<Parameters<typeof createServer>[0]>[1], filePath: string, contentType: string): void {
  try {
    const content = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}

export function startServer(
  port: number,
  webContents: WebContents
): HttpServer {
  wc = webContents
  const clientDir = getClientDir()

  const httpServer = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const url = req.url?.split('?')[0] ?? '/'

    if (url === '/' || url === '/index.html') {
      serveFile(res, join(clientDir, 'index.html'), 'text/html; charset=utf-8')
    } else if (url === '/client.js') {
      serveFile(res, join(clientDir, 'client.js'), 'application/javascript; charset=utf-8')
    } else if (url === '/styles.css') {
      serveFile(res, join(clientDir, 'styles.css'), 'text/css; charset=utf-8')
    } else if (url === '/api/status') {
      const clients = getClients()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, clients: clients.length }))
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  })

  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    if (clientSockets.size >= MAX_CLIENTS) {
      ws.close(1013, 'Max displays reached')
      return
    }

    const clientId = uuidv4()
    clientSockets.set(clientId, ws)
    clientInfo.set(clientId, {
      clientId,
      connectedAt: Date.now(),
      userAgent: req.headers['user-agent'] ?? 'Unknown'
    })

    console.log(`[server] client connected: ${clientId}`)
    wc?.send('client-connected', { clientId, userAgent: req.headers['user-agent'] })

    // Send initial config to browser
    const { width, height } = screen.getPrimaryDisplay().size
    sendToClient(clientId, { type: 'config', clientId, screenWidth: width, screenHeight: height })

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as SignalingMessage
        handleMessage(clientId, msg)
      } catch (e) {
        console.warn('[server] invalid message:', e)
      }
    })

    ws.on('close', () => {
      clientSockets.delete(clientId)
      clientInfo.delete(clientId)
      console.log(`[server] client disconnected: ${clientId}`)
      wc?.send('client-disconnected', { clientId })
    })

    ws.on('error', (err) => {
      console.error(`[server] ws error for ${clientId}:`, err.message)
    })
  })

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[server] listening on port ${port}`)
  })

  return httpServer
}

function handleMessage(clientId: string, msg: SignalingMessage): void {
  switch (msg.type) {
    case 'offer':
      wc?.send('signaling-offer', { clientId, sdp: msg.sdp })
      break
    case 'ice-candidate':
      wc?.send('signaling-ice-from-browser', { clientId, candidate: msg.candidate })
      break
    case 'input':
      handleInput(msg as unknown as InputMessage)
      break
    default:
      console.warn('[server] unknown message type:', msg.type)
  }
}

export function sendToClient(clientId: string, msg: SignalingMessage): void {
  const ws = clientSockets.get(clientId)
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

export function getClients(): ClientInfo[] {
  return Array.from(clientInfo.values())
}

export function disconnectClient(clientId: string): void {
  clientSockets.get(clientId)?.close()
}
