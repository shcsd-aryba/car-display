import type { ServerInfo } from '../../../preload'

interface Props {
  serverInfo: ServerInfo | null
}

const STEPS = [
  {
    n: '1',
    title: 'Connect to Same Network',
    desc: 'Ensure your display device (Tesla, tablet, etc.) is on the same Wi-Fi network as this computer. For Tesla, share your Mac/PC hotspot via Internet Sharing.'
  },
  {
    n: '2',
    title: 'Enable Internet Sharing (if using Tesla)',
    desc: 'On Mac: System Settings → General → Sharing → Internet Sharing. Share from your main connection, to Wi-Fi. Then connect Tesla to the new hotspot.'
  },
  {
    n: '3',
    title: 'Open the URL in the Browser',
    desc: 'On your display device, open the browser and navigate to the URL shown above. For Tesla: tap the web browser icon on the touchscreen.'
  },
  {
    n: '4',
    title: 'Allow Permissions',
    desc: 'The browser may ask for permissions. Allow any media/WebRTC requests. The screen will appear automatically once connected.'
  },
  {
    n: '5',
    title: 'Start Using Your Display',
    desc: 'Your screen is now mirrored on the display. Touch the screen to control your computer — clicks and scrolls are forwarded in real time.'
  }
]

export default function HowToConnect({ serverInfo }: Props) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.iconWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <h3 style={styles.title}>How to Connect</h3>
          <p style={styles.subtitle}>Get started in 5 simple steps</p>
        </div>
      </div>

      <div style={styles.body}>
        {STEPS.map((step, i) => (
          <div key={step.n} style={styles.step}>
            <div style={styles.stepLeft}>
              <div style={styles.numWrap}>
                <span style={styles.num}>{step.n}</span>
                {i < STEPS.length - 1 && <div style={styles.line} />}
              </div>
            </div>
            <div style={styles.stepContent}>
              <p style={styles.stepTitle}>{step.title}</p>
              <p style={styles.stepDesc}>
                {step.desc}
                {i === 2 && serverInfo && (
                  <code style={styles.code}> {serverInfo.url}</code>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    flex: 1
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
  body: { padding: '14px 20px' },
  step: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  stepLeft: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  numWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  num: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  line: {
    width: 1,
    height: 20,
    background: 'rgba(99,102,241,0.2)',
    margin: '3px 0'
  },
  stepContent: { paddingBottom: 12, flex: 1 },
  stepTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 },
  stepDesc: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 },
  code: {
    fontFamily: 'monospace',
    background: 'rgba(99,102,241,0.1)',
    color: '#a5b4fc',
    padding: '1px 5px',
    borderRadius: 4,
    fontSize: 12
  }
}
