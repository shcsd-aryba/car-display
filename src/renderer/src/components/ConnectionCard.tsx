import type { ServerInfo } from '../../../preload'

interface Props {
  serverInfo: ServerInfo | null
}

export default function ConnectionCard({ serverInfo }: Props) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.iconWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M1.5 8.5C5.5 4.5 10.5 2.5 12 2.5s6.5 2 10.5 6M5 12a10 10 0 0 1 7-4.5A10 10 0 0 1 19 12M9 15.5A5 5 0 0 1 12 14a5 5 0 0 1 3 1.5M12 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h3 style={styles.title}>Connect Your Display</h3>
          <p style={styles.subtitle}>Open this URL in any WebRTC browser</p>
        </div>
      </div>

      {serverInfo ? (
        <div style={styles.body}>
          <div style={styles.urlBox}>
            <span style={styles.urlText}>{serverInfo.url}</span>
          </div>

          <div style={styles.qrRow}>
            <img
              src={serverInfo.qrDataUrl}
              alt="QR Code"
              style={styles.qr}
            />
            <div style={styles.qrHint}>
              <p style={styles.hintTitle}>Scan with any device</p>
              <p style={styles.hintText}>
                Or type the URL above into your Tesla's browser, tablet, or any
                WebRTC-compatible browser on the same network.
              </p>
              <div style={styles.chips}>
                <span style={styles.chip}>Tesla Browser</span>
                <span style={styles.chip}>iPad</span>
                <span style={styles.chip}>Any tablet</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Starting server…</span>
        </div>
      )}
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
  body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 },
  urlBox: {
    background: 'rgba(99,102,241,0.08)',
    border: '1px solid rgba(99,102,241,0.18)',
    borderRadius: 8,
    padding: '10px 14px',
    textAlign: 'center'
  },
  urlText: {
    fontSize: 16,
    fontWeight: 600,
    color: '#a5b4fc',
    fontFamily: 'monospace',
    letterSpacing: '0.01em'
  },
  qrRow: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start'
  },
  qr: {
    width: 110,
    height: 110,
    borderRadius: 8,
    flexShrink: 0,
    background: 'transparent'
  },
  qrHint: { flex: 1 },
  hintTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 },
  hintText: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)'
  },
  loading: {
    padding: '24px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  spinner: {
    width: 16,
    height: 16,
    border: '2px solid rgba(99,102,241,0.3)',
    borderTop: '2px solid #6366f1',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
}
