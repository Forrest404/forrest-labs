// Shared "coming soon" empty state for scaffolded NGO sections. Design-system
// surface/colours; renders inside the NGO layout so it inherits the persistent
// nav. No API, no DB — this IS the empty state until the section is built.
export default function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div style={{ minHeight: '100%', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', padding: '32px 24px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>{title}</h1>
        <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 24px' }}>{blurb}</p>
        <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>Coming soon</div>
          <div style={{ fontSize: 13, color: '#8b949e', marginTop: 6 }}>This section is being built.</div>
          <a href="/ngo/board" style={{ display: 'inline-block', marginTop: 18, fontSize: 13, color: '#58a6ff', textDecoration: 'none' }}>← Back to the situation board</a>
        </div>
      </div>
    </div>
  )
}
