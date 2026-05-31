'use client'

import { useCallback, useEffect, useState } from 'react'

// Dedicated responder panic view: every active duress alert for the org, with the
// responder actions (acknowledge, call, locate). Send-team, group chat, and
// resolve-with-note are added in panic step 4. Leaders/admins only.

interface Panic {
  id: string; ngo_user_id: string; name: string; phone: string | null
  team_id: string | null; group_chat_url: string | null
  lat: number | null; lon: number | null; created_at: string
  silent: boolean; reason: string | null
  acknowledged_at: string | null; acknowledged_by_name: string | null
}

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

export default function NgoPanicPage() {
  const [panics, setPanics] = useState<Panic[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/safety/panic', { cache: 'no-store' })
      if (!r.ok) { setError(true); setLoaded(true); return }
      setPanics((await r.json()).panics ?? []); setError(false); setLoaded(true)
    } catch { setError(true); setLoaded(true) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 7000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', load)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', load) }
  }, [load])

  async function acknowledge(id: string) {
    setBusy(id)
    try { const r = await fetch(`/api/ngo/safety/panic/${id}/acknowledge`, { method: 'POST' }); if (r.ok) load() }
    finally { setBusy(null) }
  }
  async function resolve(id: string) {
    if (!window.confirm('Resolve this panic? Only do this once the person is confirmed safe.')) return
    setBusy(id)
    try { const r = await fetch(`/api/ngo/safety/panic/${id}/resolve`, { method: 'POST' }); if (r.ok) load() }
    finally { setBusy(null) }
  }
  const mapsLink = (p: Panic) => (p.lat != null && p.lon != null ? `https://www.google.com/maps?q=${p.lat},${p.lon}` : null)

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Active panics</h1>
        <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>
          Duress alerts from your field staff. A panic never auto-closes — a responder must resolve it.
        </div>
      </div>

      {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {loaded && error && (
        <div style={errBox}>Couldn’t load panics. <button type="button" onClick={load} style={retryBtn}>Retry</button></div>
      )}
      {loaded && !error && panics.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#3fb950', fontSize: 15 }}>✓ No active panics.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {panics.map((p) => {
          const link = mapsLink(p)
          return (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#f85149' }}>
                    🆘 {p.name}
                    {p.silent && <span style={tag('#8b949e')}>silent</span>}
                    {p.reason && <span style={tag('#d29922')}>{p.reason}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>
                    Triggered {ago(p.created_at)} · {p.lat != null && p.lon != null ? `last known ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : 'no location'}
                  </div>
                  {p.acknowledged_at
                    ? <div style={{ fontSize: 13, color: '#3fb950', marginTop: 4 }}>✓ Acknowledged by {p.acknowledged_by_name} · {ago(p.acknowledged_at)}</div>
                    : <div style={{ fontSize: 13, color: '#d29922', marginTop: 4 }}>● Not yet acknowledged</div>}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {!p.acknowledged_at && (
                  <button type="button" disabled={busy === p.id} onClick={() => acknowledge(p.id)} style={btn('#58a6ff')}>Acknowledge</button>
                )}
                {p.phone
                  ? <a href={`tel:${p.phone}`} style={btnLink('#3fb950')}>Call</a>
                  : <span style={{ ...btn('#484f58'), opacity: 0.6, cursor: 'default' }}>No phone</span>}
                {link && <a href={link} target="_blank" rel="noreferrer" style={btnLink('#a371f7')}>Locate ↗</a>}
                <button type="button" disabled={busy === p.id} onClick={() => resolve(p.id)} style={btn('#8b949e')}>Resolve</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 760, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const card: React.CSSProperties = { background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.4)', borderRadius: 12, padding: 16 }
function tag(c: string): React.CSSProperties { return { fontSize: 11, fontWeight: 600, color: c, border: `1px solid ${c}55`, borderRadius: 999, padding: '2px 8px', marginInlineStart: 8, verticalAlign: 'middle' } }
function btn(c: string): React.CSSProperties { return { height: 40, padding: '0 16px', background: `${c}22`, border: `1px solid ${c}66`, color: c, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' } }
function btnLink(c: string): React.CSSProperties { return { ...btn(c), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' } }
const errBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'none', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 4, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }
