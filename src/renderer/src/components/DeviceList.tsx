import { useState } from 'react'
import type { ClientInfo, SourceInfo } from '../../../preload'

interface Props {
  clients: ClientInfo[]
  sources: SourceInfo[]
  clientSources: Record<string, string>
  onDisconnect: (clientId: string) => void
  onStream: (clientId: string, sourceId: string) => Promise<void>
}

function elapsed(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function deviceName(ua: string): string {
  if (ua.includes('Tesla')) return 'Tesla Browser'
  if (ua.includes('iPad')) return 'iPad'
  if (ua.includes('iPhone')) return 'iPhone'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  return 'Browser'
}

function DeviceRow({ client, sources, currentSourceId, onDisconnect, onStream }: {
  client: ClientInfo
  sources: SourceInfo[]
  currentSourceId: string
  onDisconnect: () => void
  onStream: (sourceId: string) => Promise<void>
}) {
  const [pickedSourceId, setPickedSourceId] = useState(currentSourceId || sources[0]?.id || '')
  const [streaming, setStreaming] = useState(false)

  const currentName = sources.find(s => s.id === currentSourceId)?.name ?? '—'

  async function handleStream() {
    if (!pickedSourceId || streaming) return
    setStreaming(true)
    try {
      await onStream(pickedSourceId)
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div style={styles.item}>
      <div style={styles.itemIcon}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      <div style={styles.itemInfo}>
        <div style={styles.itemRow}>
          <span style={styles.itemName}>{deviceName(client.userAgent)}</span>
          <span style={styles.liveTag}>
            <span style={styles.liveDot} /> LIVE
          </span>
        </div>
        <span style={styles.itemMeta}>
          Connected {elapsed(client.connectedAt)} · {client.clientId.slice(0, 8)}
        </span>
        {currentSourceId && (
          <span style={styles.nowStreaming}>Streaming: {currentName}</span>
        )}
      </div>

      {/* Source picker + stream button */}
      <div style={styles.controls}>
        <select
          value={pickedSourceId}
          onChange={(e) => setPickedSourceId(e.target.value)}
          style={styles.select}
          title="Select source to stream to this display"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          style={{
            ...styles.streamBtn,
            ...(streaming ? styles.streamBtnBusy : {})
          }}
          onClick={handleStream}
          disabled={!pickedSourceId || streaming}
          title="Send selected source to this display"
        >
          {streaming ? '…' : '▶ Stream'}
        </button>
      </div>

      <button
        style={styles.disconnectBtn}
        onClick={onDisconnect}
        title="Disconnect"
      >
        ✕
      </button>
    </div>
  )
}

export default function DeviceList({ clients, sources, clientSources, onDisconnect, onStream }: Props) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.iconWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={styles.title}>Connected Displays</h3>
          <p style={styles.subtitle}>{clients.length} / 3 active</p>
        </div>
        <div style={styles.countBadge}>{clients.length}/3</div>
      </div>

      <div style={styles.body}>
        {clients.length === 0 ? (
          <div style={styles.empty}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
              <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p style={styles.emptyText}>No displays connected</p>
            <p style={styles.emptyHint}>Waiting for connections…</p>
          </div>
        ) : (
          <div style={styles.list}>
            {clients.map((c) => (
              <DeviceRow
                key={c.clientId}
                client={c}
                sources={sources}
                currentSourceId={clientSources[c.clientId] ?? ''}
                onDisconnect={() => onDisconnect(c.clientId)}
                onStream={(sourceId) => onStream(c.clientId, sourceId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)'
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
    border: '1px solid rgba(99,102,241,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#a5b4fc',
    flexShrink: 0
  },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 },
  subtitle: { fontSize: 12, color: 'var(--text-secondary)' },
  countBadge: {
    fontSize: 12,
    fontWeight: 700,
    color: '#a5b4fc',
    background: 'rgba(99,102,241,0.12)',
    border: '1px solid rgba(99,102,241,0.2)',
    padding: '3px 9px',
    borderRadius: 20
  },
  body: { padding: '12px 16px' },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '24px 0',
    color: 'var(--text-secondary)'
  },
  emptyText: { fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' },
  emptyHint: { fontSize: 12, color: 'var(--text-muted)' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border)',
    borderRadius: 8
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: 'rgba(99,102,241,0.1)',
    border: '1px solid rgba(99,102,241,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#a5b4fc',
    flexShrink: 0,
    marginTop: 2
  },
  itemInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  itemRow: { display: 'flex', alignItems: 'center', gap: 8 },
  itemName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  itemMeta: { fontSize: 11, color: 'var(--text-muted)' },
  nowStreaming: { fontSize: 11, color: '#a5b4fc', fontStyle: 'italic' },
  liveTag: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 700,
    color: '#86efac',
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)',
    padding: '2px 7px',
    borderRadius: 20,
    letterSpacing: '0.05em'
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#22c55e',
    display: 'inline-block'
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    flexShrink: 0
  },
  select: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 11,
    padding: '4px 6px',
    cursor: 'pointer',
    maxWidth: 130,
    outline: 'none'
  },
  streamBtn: {
    background: 'rgba(99,102,241,0.15)',
    border: '1px solid rgba(99,102,241,0.35)',
    borderRadius: 6,
    color: '#a5b4fc',
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    cursor: 'pointer',
    transition: 'background 0.15s'
  },
  streamBtnBusy: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  disconnectBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    color: '#fca5a5',
    fontSize: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0
  }
}
