import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  let reportsToday = 0
  let confirmedTotal = 0
  let activeWarnings = 0

  try {
    const supabase = await createClient()
    const [r1, r2, r3] = await Promise.all([
      supabase.from('reports').select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
      supabase.from('clusters').select('*', { count: 'exact', head: true })
        .in('status', ['confirmed', 'auto_confirmed']),
      supabase.from('warning_clusters').select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
    ])
    reportsToday = r1.count ?? 0
    confirmedTotal = r2.count ?? 0
    activeWarnings = r3.count ?? 0
  } catch {
    // Database errors must never crash the landing page
  }

  return (
    <div style={{ background: '#0a0a0f', color: '#ffffff', fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh' }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
        @keyframes bounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(8px) } }
        @media (max-width: 600px) {
          .stats-bar { flex-direction: column !important; }
          .stats-bar > div { border-right: none !important; border-bottom: 0.5px solid rgba(255,255,255,0.08) !important; }
          .stats-bar > div:last-child { border-bottom: none !important; }
          .cta-row { flex-direction: column !important; }
          .cta-row > a { width: 100% !important; }
          .steps-row { flex-direction: column !important; }
          .steps-divider { display: none !important; }
          .two-col { flex-direction: column !important; }
          .privacy-row { flex-direction: column !important; }
          .footer-inner { flex-direction: column !important; text-align: center !important; }
          .footer-center { display: none !important; }
        }
      `}</style>

      {/* Fixed nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.06)', padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, color: '#ef4444', letterSpacing: '0.2em', fontWeight: 500 }}>FORREST LABS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/map" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>Map</a>
          <a href="/report" style={{ fontSize: 13, fontWeight: 500, color: '#ffffff', background: '#ef4444', padding: '7px 16px', borderRadius: 6, textDecoration: 'none' }}>Report →</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 20px 60px', textAlign: 'center',
      }}>
        {/* Live status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, color: '#ef4444', letterSpacing: '0.15em', fontWeight: 500 }}>LIVE — Lebanon</span>
        </div>

        <h1 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 500, color: '#ffffff', lineHeight: 1.15, maxWidth: 700, margin: '0 0 20px 0' }}>
          <span style={{ display: 'block' }}>When bombs fall,</span>
          <span style={{ display: 'block' }}>every second counts.</span>
        </h1>

        <p style={{ fontSize: 'clamp(16px, 2.5vw, 20px)', color: '#9ca3af', lineHeight: 1.7, maxWidth: 500, margin: '0 0 36px 0' }}>
          Civilians report. AI verifies. Aid workers respond. In real time. No app required.
        </p>

        {/* Stats bar */}
        <div className="stats-bar" style={{
          display: 'flex', gap: 0, marginBottom: 40,
          background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          {[
            { n: reportsToday, label: 'reports today', color: '#ffffff' },
            { n: confirmedTotal, label: 'confirmed incidents', color: '#ffffff' },
            { n: activeWarnings, label: 'active warnings', color: activeWarnings > 0 ? '#f97316' : '#ffffff' },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: '14px 24px', borderRight: i < 2 ? '0.5px solid rgba(255,255,255,0.08)' : 'none',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 500, color: s.color }}>{s.n}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="cta-row" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="/report" style={{
            background: '#ef4444', color: '#ffffff', height: 52, padding: '0 32px', borderRadius: 8,
            fontSize: 15, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center',
          }}>Report an incident →</a>
          <a href="/map" style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)',
            height: 52, padding: '0 32px', borderRadius: 8, fontSize: 15, textDecoration: 'none',
            display: 'flex', alignItems: 'center',
          }}>View live map</a>
        </div>

        <p style={{ fontSize: 13, color: '#374151', textAlign: 'center' }}>Anonymous · No account required · Works on any phone</p>

        {/* Scroll chevron */}
        <div style={{ marginTop: 48 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ animation: 'bounce 2s ease-in-out infinite' }}>
            <path d="M4 7L10 13L16 7" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '100px 20px', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ fontSize: 11, color: '#374151', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 48, textAlign: 'center' }}>
          HOW IT WORKS
        </div>
        <div className="steps-row" style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
          {[
            { num: '01', title: 'You report in 15 seconds', desc: 'Tap four times to log what you heard, saw, or were warned about. No login. No app. Works on any phone anywhere.' },
            { num: '02', title: 'AI verifies instantly', desc: 'Reports from the same area are cross-referenced. Fake reports are filtered out. Verified incidents appear on the map within 90 seconds.' },
            { num: '03', title: 'Aid reaches people faster', desc: 'Aid organisations see confirmed incidents in real time and deploy to where help is actually needed — not where they guess it is.' },
          ].map((step, i) => (
            <div key={step.num} style={{ display: 'contents' }}>
              {i > 0 && <div className="steps-divider" style={{ width: 1, background: 'rgba(255,255,255,0.06)', height: 60, alignSelf: 'center', flexShrink: 0 }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 500, letterSpacing: '0.1em', marginBottom: 14 }}>{step.num}</div>
                <div style={{ fontSize: 18, color: '#ffffff', fontWeight: 500, marginBottom: 10 }}>{step.title}</div>
                <div style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.7 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* What you can report */}
      <section style={{
        padding: '80px 20px', background: 'rgba(255,255,255,0.015)',
        borderTop: '0.5px solid rgba(255,255,255,0.06)', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: '#374151', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 48, textAlign: 'center' }}>
            WHAT YOU CAN REPORT
          </div>
          <div className="two-col" style={{ display: 'flex', gap: 40 }}>
            {/* Strikes */}
            <div style={{ flex: 1 }}>
              <span style={{ display: 'inline-block', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 11, padding: '3px 10px', borderRadius: 20, marginBottom: 16 }}>Strikes</span>
              {['Large explosion heard', 'Shockwave or windows shaking', 'Smoke or fire visible', 'Aircraft or missiles overhead'].map((item) => (
                <div key={item} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: '#9ca3af' }}>{item}</span>
                </div>
              ))}
            </div>
            {/* Warnings */}
            <div style={{ flex: 1 }}>
              <span style={{ display: 'inline-block', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316', fontSize: 11, padding: '3px 10px', borderRadius: 20, marginBottom: 16 }}>Warnings</span>
              {['Official IDF evacuation order', 'Phone call warning to evacuate', 'Community warning from neighbours', 'Leaflet dropped from aircraft'].map((item) => (
                <div key={item} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: '#9ca3af' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section style={{ padding: '80px 20px', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ fontSize: 11, color: '#374151', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 48, textAlign: 'center' }}>
          YOUR PRIVACY
        </div>
        <div className="privacy-row" style={{ display: 'flex', gap: 32 }}>
          {[
            {
              icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="4" y="8" width="10" height="8" rx="2" stroke="#374151" strokeWidth="1.5" /><path d="M6 8V5C6 3.34 7.34 2 9 2C10.66 2 12 3.34 12 5V8" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" /></svg>,
              title: 'Anonymous by design',
              text: 'No name, phone number, or account required. Ever.',
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="3" stroke="#374151" strokeWidth="1.5" /><path d="M1 9C3 5 6 3 9 3C12 3 15 5 17 9C15 13 12 15 9 15C6 15 3 13 1 9Z" stroke="#374151" strokeWidth="1.5" /><line x1="2" y1="16" x2="16" y2="2" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" /></svg>,
              title: 'Location is approximate',
              text: 'We store a general area, not your exact position. Faces in photos are automatically blurred.',
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1L2 5V9C2 13.4 5 16.5 9 17.5C13 16.5 16 13.4 16 9V5L9 1Z" stroke="#374151" strokeWidth="1.5" strokeLinejoin="round" /></svg>,
              title: 'No surveillance',
              text: 'This tool protects civilians. It will never be used for military targeting.',
            },
          ].map((item) => (
            <div key={item.title} style={{ flex: 1 }}>
              {item.icon}
              <div style={{ fontSize: 15, color: '#ffffff', fontWeight: 500, marginTop: 12, marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{item.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '40px 20px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div className="footer-inner" style={{ maxWidth: 680, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#374151' }}>Forrest Labs · 2026</span>
          <span className="footer-center" style={{ fontSize: 13, color: '#374151' }}>Built to protect civilians</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <a href="/report" style={{ fontSize: 13, color: '#ef4444', textDecoration: 'none' }}>Report →</a>
            <a href="/map" style={{ fontSize: 13, color: '#374151', textDecoration: 'none' }}>Live map</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
