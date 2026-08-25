import { useEffect, useState, useCallback } from 'react'
import Header from './components/Header'
import ConnectionCard from './components/ConnectionCard'
import DisplaySelector from './components/DisplaySelector'
import DeviceList from './components/DeviceList'
import HowToConnect from './components/HowToConnect'
import { handleOffer, handleIceFromBrowser, removePeer, replaceStream, setActiveSource } from './webrtc'
import type { ServerInfo, ClientInfo, SourceInfo } from '../../preload'

export default function App() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string>('')
  const [clientSources, setClientSources] = useState<Record<string, string>>({})
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [hasExtendCanvas, setHasExtendCanvas] = useState(false)

  const refreshClients = useCallback(async () => {
    const c = await window.electronAPI.getClients()
    setClients(c)
  }, [])

  const refreshSources = useCallback(async () => {
    const srcs = await window.electronAPI.getSources()
    setSources(srcs)
    return srcs
  }, [])

  useEffect(() => {
    window.electronAPI.getServerInfo().then(setServerInfo).catch((e: Error) => setError(e.message))
    refreshSources().then((srcs) => {
      const first = srcs.find((s) => s.name.toLowerCase().includes('screen')) ?? srcs[0]
      if (first) {
        setSelectedSourceId(first.id)
        setActiveSource(first.id)
        window.electronAPI.setStreamSource(first.id)
      }
    })
    refreshClients()
  }, [refreshClients, refreshSources])

  useEffect(() => {
    const removeOffer = window.electronAPI.onSignalingOffer(({ clientId, sdp }) => {
      setClientErrors((prev) => { const n = { ...prev }; delete n[clientId]; return n })
      handleOffer(clientId, sdp, selectedSourceId, (cid, reason) => {
        setClientErrors((prev) => ({ ...prev, [cid]: reason }))
      })
        .then(() => {
          if (selectedSourceId) {
            setClientSources((prev) => ({ ...prev, [clientId]: selectedSourceId }))
          }
        })
        .catch((err: Error) => {
          setClientErrors((prev) => ({ ...prev, [clientId]: err.message ?? 'Stream failed' }))
        })
    })
    const removeIce = window.electronAPI.onSignalingIce(({ clientId, candidate }) => {
      handleIceFromBrowser(clientId, candidate)
    })
    const removeConnect = window.electronAPI.onClientConnected(() => refreshClients())
    const removeDisconnect = window.electronAPI.onClientDisconnected(({ clientId }) => {
      removePeer(clientId)
      setClientSources((prev) => { const n = { ...prev }; delete n[clientId]; return n })
      setClientErrors((prev) => { const n = { ...prev }; delete n[clientId]; return n })
      refreshClients()
    })

    return () => { removeOffer(); removeIce(); removeConnect(); removeDisconnect() }
  }, [selectedSourceId, refreshClients])

  const handleSourceChange = (id: string) => {
    setSelectedSourceId(id)
    setActiveSource(id)
    window.electronAPI.setStreamSource(id)
  }

  const handleStreamToDevice = useCallback(async (clientId: string, sourceId: string) => {
    setSelectedSourceId(sourceId)
    setActiveSource(sourceId)
    setClientErrors((prev) => { const n = { ...prev }; delete n[clientId]; return n })

    try {
      await replaceStream(clientId, sourceId)
      setClientSources((prev) => ({ ...prev, [clientId]: sourceId }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'NO_PEER' || msg === 'NO_SENDER') {
        await window.electronAPI.disconnectClient(clientId)
        removePeer(clientId)
        setClientSources((prev) => { const n = { ...prev }; delete n[clientId]; return n })
        await refreshClients()
      } else {
        setClientErrors((prev) => ({ ...prev, [clientId]: msg }))
      }
    }
  }, [refreshClients])

  const handleDisconnect = async (clientId: string) => {
    await window.electronAPI.disconnectClient(clientId)
    removePeer(clientId)
    setClientSources((prev) => { const n = { ...prev }; delete n[clientId]; return n })
    setClientErrors((prev) => { const n = { ...prev }; delete n[clientId]; return n })
    await refreshClients()
  }

  const handleCreateExtendCanvas = useCallback(async () => {
    await window.electronAPI.createExtendCanvas()
    setHasExtendCanvas(true)
    // Give the new window a moment to appear before refreshing sources
    setTimeout(() => refreshSources(), 600)
  }, [refreshSources])

  const handleCloseExtendCanvas = useCallback(async () => {
    await window.electronAPI.closeExtendCanvas()
    setHasExtendCanvas(false)
    setTimeout(() => refreshSources(), 300)
  }, [refreshSources])

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
            hasExtendCanvas={hasExtendCanvas}
            onCreateExtendCanvas={handleCreateExtendCanvas}
            onCloseExtendCanvas={handleCloseExtendCanvas}
          />
        </div>
        <div style={styles.right}>
          <DeviceList
            clients={clients}
            sources={sources}
            clientSources={clientSources}
            clientErrors={clientErrors}
            onDisconnect={handleDisconnect}
            onStream={handleStreamToDevice}
          />
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
  left: { display: 'flex', flexDirection: 'column', gap: 16 },
  right: { display: 'flex', flexDirection: 'column', gap: 16 }
}
