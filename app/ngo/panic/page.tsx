'use client'

import { useCallback, useEffect, useState } from 'react'
import { useNewPanicAlert } from '@/lib/use-new-panic-alert'

// Dedicated responder panic view: every active duress alert for the org with the full
// responder toolkit — acknowledge, call, locate, open the team's group chat, send the
// nearest team, and resolve with a required outcome note. A panic never auto-closes.
// Leaders/admins only.

interface Panic {
  id: string; ngo_user_id: string; name: string; phone: string | null
  team_id: string | null; group_chat_url: string | null
  lat: number | null; lon: number | null; created_at: string
  silent: boolean; reason: string | null
  acknowledged_at: string | null; acknowledged_by_name: string | null
}
interface Team { id: string; name: string; type: string; status: string; last_lat: number | null; last_lon: number | null }

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}
function distanceKm(a: { lat: number; lon: number }, lat: number, lon: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat - a.lat), dLon = toRad(lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

export default function NgoPanicPage() {
  const [panics, setPanics] = useState<Panic[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [sendFor, setSendFor] = useState<Panic | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [resolveFor, setResolveFor] = useState<Panic | null>(null)
  const [note, setNote] = useState('')

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
  async function openSend(p: Panic) {
    setSendFor(p); setTeams([])
    try { const r = await fetch('/api/ngo/teams'); if (r.ok) setTeams((await r.json()).teams ?? []) } catch { /* empty */ }
  }
  async function sendTeam(teamId: string) {
    if (!sendFor) return
    setBusy(sendFor.id)
    try { const r = await fetch(`/api/ngo/safety/panic/${sendFor.id}/dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId }) }); if (r.ok) { setSendFor(null); load() } }
    finally { setBusy(null) }
  }
  async function doResolve() {
    if (!resolveFor || note.trim().length < 3) return
    setBusy(resolveFor.id)
    try {
      const r = await fetch(`/api/ngo/safety/panic/${resolveFor.id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution_note: note.trim() }) })
      if (r.ok) { setResolveFor(null); setNote(''); load() }
    } finally { setBusy(null) }
  }
  const mapsLink = (p: Panic) => (p.lat != null && p.lon != null ? `https://www.google.com/maps?q=${p.lat},${p.lon}` : null)
  // Audible + visual alert when a NEW panic arrives while this page is open (sound default on).
  const { muted, toggleMute, newNames, dismiss } = useNewPanicAlert(panics)

  // Rank teams nearest-first when the panic has a location.
  const rankedTeams = (p: Panic | null): (Team & { km: number | null })[] => {
    const list = teams.map((t) => ({ ...t, km: p?.lat != null && p?.lon != null && t.last_lat != null && t.last_lon != null ? distanceKm({ lat: p.lat, lon: p.lon }, t.last_lat, t.last_lon) : null }))
    return list.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
  }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Active panics</h1>
          <button type="button" onClick={toggleMute} title={muted ? 'New-panic sound is off' : 'New-panic sound is on'} style={muteBtn}>{muted ? '🔇 Muted' : '🔔 Sound on'}</button>
        </div>
        <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>
          Duress alerts from your field staff. A panic never auto-closes — a responder must resolve it with an outcome note.
        </div>
      </div>

      {/* New-panic alert banner — fires (with a chime unless muted) when a panic arrives while
          this page is open, so it can't scroll in unnoticed. */}
      {newNames.length > 0 && (
        <div style={alertBanner} onClick={dismiss} role="alert">
          🆘 New panic{newNames.length > 1 ? 's' : ''}: {newNames.join(', ')} <span style={{ fontWeight: 400, opacity: 0.85 }}>· tap to dismiss</span>
        </div>
      )}

      {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {loaded && error && <div style={errBox}>Couldn’t load panics. <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}
      {loaded && !error && panics.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#3fb950', fontSize: 15 }}>✓ No active panics.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {panics.map((p) => {
          const link = mapsLink(p)
          return (
            <div key={p.id} style={card}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#f85149' }}>
                🆘 {p.name}
                {p.silent && <span style={tag('#8b949e')}>silent</span>}
                {p.reason && <span style={tag('#d29922')}>{p.reason.replace('_', ' ')}</span>}
              </div>
              <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>
                Triggered {ago(p.created_at)} · {p.lat != null && p.lon != null ? `last known ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : 'no location'}
              </div>
              {p.acknowledged_at
                ? <div style={{ fontSize: 13, color: '#3fb950', marginTop: 4 }}>✓ Acknowledged by {p.acknowledged_by_name} · {ago(p.acknowledged_at)}</div>
                : <div style={{ fontSize: 13, color: '#d29922', marginTop: 4 }}>● Not yet acknowledged</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {!p.acknowledged_at && <button type="button" disabled={busy === p.id} onClick={() => acknowledge(p.id)} style={btn('#58a6ff')}>Acknowledge</button>}
                {p.phone
                  ? <a href={`tel:${p.phone}`} style={btnLink('#3fb950')}>Call</a>
                  : <span style={{ ...btn('#484f58'), opacity: 0.6, cursor: 'default' }}>No phone</span>}
                {link && <a href={link} target="_blank" rel="noreferrer" style={btnLink('#a371f7')}>Locate ↗</a>}
                {p.group_chat_url && <a href={p.group_chat_url} target="_blank" rel="noreferrer" style={btnLink('#3fb950')}>Group chat ↗</a>}
                <button type="button" disabled={busy === p.id} onClick={() => openSend(p)} style={btn('#58a6ff')}>Send team</button>
                <button type="button" disabled={busy === p.id} onClick={() => { setResolveFor(p); setNote('') }} style={btn('#8b949e')}>Resolve</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Send-nearest-team picker */}
      {sendFor && (
        <div onClick={() => setSendFor(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Send a team to {sendFor.name}</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>Nearest first · the team is alerted by push with a map link.</div>
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rankedTeams(sendFor).length === 0 && <div style={{ fontSize: 13, color: '#8b949e' }}>No teams.</div>}
              {rankedTeams(sendFor).map((t) => (
                <button key={t.id} type="button" disabled={busy === sendFor.id} onClick={() => sendTeam(t.id)} style={teamRow}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span style={{ fontSize: 12, color: '#8b949e', marginLeft: 8 }}>{t.type} · {t.status}{t.km != null ? ` · ${t.km.toFixed(1)} km` : ''}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setSendFor(null)} style={{ ...btn('#8b949e'), marginTop: 12, width: '100%' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Resolve with a required outcome note */}
      {resolveFor && (
        <div onClick={() => setResolveFor(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Resolve {resolveFor.name}’s panic</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>Only resolve once the person is confirmed safe. An outcome note is required.</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened / outcome…" style={{ width: '100%', minHeight: 90, boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, color: '#e6edf3', fontSize: 14, padding: 10, fontFamily: 'system-ui', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" disabled={note.trim().length < 3 || busy === resolveFor.id} onClick={doResolve} style={{ ...btn('#3fb950'), flex: 1, opacity: note.trim().length < 3 ? 0.5 : 1 }}>Resolve</button>
              <button type="button" onClick={() => setResolveFor(null)} style={{ ...btn('#8b949e'), flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
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
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }
const modal: React.CSSProperties = { width: 380, maxWidth: '100%', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 20, fontFamily: 'system-ui', color: '#e6edf3' }
const teamRow: React.CSSProperties = { textAlign: 'left', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: '10px 12px', color: '#e6edf3', fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui' }
const muteBtn: React.CSSProperties = { flexShrink: 0, height: 30, padding: '0 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const alertBanner: React.CSSProperties = { background: '#da3633', color: '#fff', borderRadius: 10, padding: '12px 14px', fontSize: 15, fontWeight: 700, marginBottom: 14, cursor: 'pointer', boxShadow: '0 0 0 1px #f85149, 0 4px 14px rgba(248,81,73,0.4)' }
