import { useEffect, useState, useCallback } from 'react'
import Header from './components/Header'
import ConnectionCard from './components/ConnectionCard'
import DisplaySelector from './components/DisplaySelector'
import DeviceList from './components/DeviceList'
import HowToConnect from './components/HowToConnect'
import { handleOffer, handleIceFromBrowser, removePeer, setActiveSource } from './webrtc'
import type { ServerInfo, ClientInfo, SourceInfo } from '../../preload'

export default function App() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const refreshClients = useCallback(async () => {
    const c = await window.electronAPI.getClients()
    setClients(c)
  }, [])

  // Load initial data
  useEffect(() => {
    window.electronAPI.getServerInfo().then(setServerInfo).catch((e: Error) => setError(e.message))
    window.electronAPI.getSources().then((srcs) => {
      setSources(srcs)
      const first = srcs.find((s) => s.name.toLowerCase().includes('screen')) ?? srcs[0]
      if (first) {
        setSelectedSourceId(first.id)
        setActiveSource(first.id)
      }
    })
    refreshClients()
  }, [refreshClients])

  // WebRTC signaling
  useEffect(() => {
    const removeOffer = window.electronAPI.onSignalingOffer(({ clientId, sdp }) => {
      handleOffer(clientId, sdp, selectedSourceId).catch(console.error)
    })
    const removeIce = window.electronAPI.onSignalingIce(({ clientId, candidate }) => {
      handleIceFromBrowser(clientId, candidate)
    })
    const removeConnect = window.electronAPI.onClientConnected(() => refreshClients())
    const removeDisconnect = window.electronAPI.onClientDisconnected(({ clientId }) => {
      removePeer(clientId)
      refreshClients()
    })

    return () => {
      removeOffer()
      removeIce()
      removeConnect()
      removeDisconnect()
    }
  }, [selectedSourceId, refreshClients])

  const handleSourceChange = (id: string) => {
    setSelectedSourceId(id)
    setActiveSource(id)
  }

  const handleDisconnect = async (clientId: string) => {
    await window.electronAPI.disconnectClient(clientId)
    removePeer(clientId)
    await refreshClients()
  }

  return (
    <div style={styles.root}>
      <Header serverInfo={serverInfo} clientCount={clients.length} />

      {error && (
        <div style={styles.errorBanner}>
          <span>⚠ {error}</span>
        </div>
      )}

      <div style={styles.content}>
        <div style={styles.left}>
          <ConnectionCard serverInfo={serverInfo} />
          <DisplaySelector
            sources={sources}
            selectedId={selectedSourceId}
            onChange={handleSourceChange}
          />
        </div>
        <div style={styles.right}>
          <DeviceList clients={clients} onDisconnect={handleDisconnect} />
          <HowToConnect serverInfo={serverInfo} />
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'var(--bg-base)',
    overflow: 'hidden'
  },
  errorBanner: {
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#fca5a5',
    padding: '8px 20px',
    fontSize: 13
  },
  content: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    padding: '16px 20px 20px',
    overflow: 'auto'
  },
  left: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  right: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  }
}
