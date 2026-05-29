// Placeholder home for the NGO platform. No features yet — just confirms
// the route group renders inside its shell.
export default function NgoHome() {
  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#e6edf3', margin: 0, letterSpacing: '-0.03em' }}>
          Nour for NGOs
        </h1>
        <p style={{ fontSize: 14, color: '#8b949e', marginTop: 10 }}>
          NGO operations dashboard — coming soon.
        </p>
      </div>
    </div>
  )
}
