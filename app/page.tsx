export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '16px',
      fontFamily: 'monospace'
    }}>
      <p style={{ color: '#ef4444', fontSize: '12px', letterSpacing: '0.2em' }}>
        FORREST LABS
      </p>
      <p style={{ color: '#4b5563', fontSize: '14px' }}>
        Building...
      </p>
    </main>
  )
}
