// Placeholder landing for field_coordinator accounts. The mobile check-in flow
// (panic, proof-of-life check-in) lands here in a later session.
export default function NgoFieldPage() {
  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#e6edf3', margin: 0 }}>Field check-in</h1>
        <p style={{ fontSize: 14, color: '#8b949e', marginTop: 10 }}>
          Mobile check-in &amp; panic — coming soon.
        </p>
      </div>
    </div>
  )
}
