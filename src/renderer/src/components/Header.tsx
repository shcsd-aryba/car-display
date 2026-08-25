import type { ServerInfo } from '../../../preload'

interface Props {
  serverInfo: ServerInfo | null
  clientCount: number
}

export default function Header({ serverInfo, clientCount }: Props) {
  const isRunning = serverInfo !== null

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <div style={styles.logo}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke="url(#grad)" strokeWidth="2"/>
            <path d="M8 21h8M12 17v4" stroke="url(#grad)" strokeWidth="2" strokeLinecap="round"/>
            <rect x="5" y="6" width="14" height="8" rx="1" fill="url(#grad)" opacity="0.3"/>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1"/>
                <stop offset="1" stopColor="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span style={styles.logoText}>SideDisplay</span>
        </div>
      </div>

      <div style={styles.center}>
        {serverInfo && (
          <span style={styles.url}>{serverInfo.url}</span>
        )}
      </div>

      <div style={styles.right}>
        <div style={{ ...styles.badge, ...(isRunning ? styles.badgeGreen : styles.badgeAmber) }}>
          <span style={{ ...styles.dot, background: isRunning ? 'var(--green)' : 'var(--amber)' }} />
          {isRunning ? 'Running' : 'Starting…'}
        </div>

        {clientCount > 0 && (
          <div style={styles.clientBadge}>
            <span style={styles.dot2} />
            {clientCount} display{clientCount !== 1 ? 's' : ''} connected
          </div>
        )}
      </div>
    </header>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: 52,
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    WebkitAppRegion: 'drag' as never
  },
  left: { display: 'flex', alignItems: 'center', gap: 8 },
  logo: { display: 'flex', alignItems: 'center', gap: 8 },
  logoText: { fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' },
  center: { flex: 1, display: 'flex', justifyContent: 'center' },
  url: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    background: 'rgba(99,102,241,0.1)',
    border: '1px solid rgba(99,102,241,0.2)',
    padding: '3px 10px',
    borderRadius: 6,
    fontFamily: 'monospace'
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    WebkitAppRegion: 'no-drag' as never
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500
  },
  badgeGreen: {
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)',
    color: '#86efac'
  },
  badgeAmber: {
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.2)',
    color: '#fcd34d'
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    display: 'inline-block'
  },
  clientBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
    background: 'rgba(99,102,241,0.12)',
    border: '1px solid rgba(99,102,241,0.2)',
    color: '#a5b4fc'
  },
  dot2: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#6366f1',
    display: 'inline-block'
  }
}
