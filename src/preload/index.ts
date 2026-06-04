import { contextBridge, ipcRenderer } from 'electron'

export interface SourceInfo {
  id: string
  name: string
  thumbnail: string
}

export interface ServerInfo {
  port: number
  ip: string
  url: string
  qrDataUrl: string
  screenWidth: number
  screenHeight: number
}

export interface ClientInfo {
  clientId: string
  connectedAt: number
  userAgent: string
}

const electronAPI = {
  getSources: (): Promise<SourceInfo[]> =>
    ipcRenderer.invoke('get-sources'),

  getServerInfo: (): Promise<ServerInfo> =>
    ipcRenderer.invoke('get-server-info'),

  getClients: (): Promise<ClientInfo[]> =>
    ipcRenderer.invoke('get-clients'),

  disconnectClient: (clientId: string): Promise<void> =>
    ipcRenderer.invoke('disconnect-client', clientId),

  sendAnswer: (clientId: string, sdp: RTCSessionDescriptionInit): void =>
    ipcRenderer.send('signaling-answer', { clientId, sdp }),

  sendIce: (clientId: string, candidate: RTCIceCandidateInit | null): void =>
    ipcRenderer.send('signaling-ice-from-renderer', { clientId, candidate }),

  onSignalingOffer: (cb: (data: { clientId: string; sdp: RTCSessionDescriptionInit }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { clientId: string; sdp: RTCSessionDescriptionInit }) => cb(data)
    ipcRenderer.on('signaling-offer', handler)
    return () => ipcRenderer.removeListener('signaling-offer', handler)
  },

  onSignalingIce: (cb: (data: { clientId: string; candidate: RTCIceCandidateInit }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { clientId: string; candidate: RTCIceCandidateInit }) => cb(data)
    ipcRenderer.on('signaling-ice-from-browser', handler)
    return () => ipcRenderer.removeListener('signaling-ice-from-browser', handler)
  },

  onClientConnected: (cb: (data: { clientId: string; userAgent: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { clientId: string; userAgent: string }) => cb(data)
    ipcRenderer.on('client-connected', handler)
    return () => ipcRenderer.removeListener('client-connected', handler)
  },

  onClientDisconnected: (cb: (data: { clientId: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { clientId: string }) => cb(data)
    ipcRenderer.on('client-disconnected', handler)
    return () => ipcRenderer.removeListener('client-disconnected', handler)
  },

  createExtendCanvas: (): Promise<void> =>
    ipcRenderer.invoke('create-extend-canvas'),

  closeExtendCanvas: (): Promise<void> =>
    ipcRenderer.invoke('close-extend-canvas')
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
