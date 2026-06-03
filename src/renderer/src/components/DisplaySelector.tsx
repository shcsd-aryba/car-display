import type { SourceInfo } from '../../../preload'

interface Props {
  sources: SourceInfo[]
  selectedId: string
  onChange: (id: string) => void
}

export default function DisplaySelector({ sources, selectedId, onChange }: Props) {
  const screens = sources.filter((s) => s.id.startsWith('screen:'))
  const windows = sources.filter((s) => s.id.startsWith('window:'))

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.iconWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h3 style={styles.title}>Display Source</h3>
          <p style={styles.subtitle}>Choose what to stream</p>
        </div>
      </div>

      <div style={styles.body}>
        {sources.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading sources…</p>
        ) : (
          <>
            {screens.length > 0 && (
              <div style={styles.group}>
                <p style={styles.groupLabel}>Screens</p>
                <div style={styles.sourceGrid}>
                  {screens.map((s) => (
                    <SourceTile
                      key={s.id}
                      source={s}
                      selected={s.id === selectedId}
                      onClick={() => onChange(s.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {windows.length > 0 && (
              <div style={styles.group}>
                <p style={styles.groupLabel}>Windows</p>
                <div style={styles.sourceGrid}>
                  {windows.slice(0, 6).map((s) => (
                    <SourceTile
                      key={s.id}
                      source={s}
                      selected={s.id === selectedId}
                      onClick={() => onChange(s.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SourceTile({ source, selected, onClick }: { source: SourceInfo; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...tileSt.tile,
        ...(selected ? tileSt.tileSelected : {})
      }}
    >
      <img src={source.thumbnail} alt={source.name} style={tileSt.thumb} />
      <span style={tileSt.name}>{source.name}</span>
      {selected && <div style={tileSt.check}>✓</div>}
    </button>
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
  body: { padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  group: {},
  groupLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 },
  sourceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }
}

const tileSt: Record<string, React.CSSProperties> = {
  tile: {
    position: 'relative',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 6,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
    transition: 'border-color 0.15s, background 0.15s'
  },
  tileSelected: {
    borderColor: 'rgba(99,102,241,0.6)',
    background: 'rgba(99,102,241,0.1)'
  },
  thumb: {
    width: '100%',
    aspectRatio: '16/10',
    objectFit: 'cover',
    borderRadius: 4,
    background: '#000'
  },
  name: {
    fontSize: 10,
    color: 'var(--text-secondary)',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%'
  },
  check: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#6366f1',
    color: '#fff',
    fontSize: 9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700
  }
}
