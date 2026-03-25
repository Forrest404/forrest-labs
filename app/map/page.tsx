export default function MapPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#0a0a0a',
        color: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <span
        style={{
          color: '#ef4444',
          fontSize: 16,
          letterSpacing: '0.2em',
          fontWeight: 500,
          textTransform: 'uppercase',
          marginBottom: 24,
        }}
      >
        Forrest Labs
      </span>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        Live Map
      </h1>
      <p
        style={{
          color: '#9ca3af',
          fontSize: 16,
          textAlign: 'center',
          maxWidth: 320,
          lineHeight: 1.6,
          marginBottom: 32,
        }}
      >
        The live map is coming soon. Confirmed alerts will appear here in real time.
      </p>
      <a
        href="/report"
        style={{
          display: 'inline-block',
          background: '#ef4444',
          color: '#fff',
          fontSize: 16,
          fontWeight: 600,
          padding: '14px 28px',
          borderRadius: 12,
          textDecoration: 'none',
          minHeight: 48,
          lineHeight: '20px',
        }}
      >
        Submit a report
      </a>
    </main>
  )
}
