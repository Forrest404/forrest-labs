'use client'

import { useState, useEffect, useCallback } from 'react'

// Broadcast to all field staff (NORMAL urgency — respects each worker's prefs, quiet hours
// and off-duty; flood-protected). org_admin / team_leader only.

interface Broadcast { id: string; body: string; created_at: string }

export default function NgoBroadcastsPage() {
  const [message, setMessage] = useState('')
  const [list, setList] = useState<Broadcast[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/broadcasts', { cache: 'no-store' })
      if (r.ok) setList((await r.json()).broadcasts ?? [])
      else setError('Could not load broadcasts.')
    } catch { setError('Could not load broadcasts.') }
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  const send = async () => {
    if (!message.trim()) return
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await fetch('/api/ngo/broadcasts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.trim() }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setMessage(''); setMsg('Broadcast sent to field staff.'); await load() }
      else setError(d.error ?? 'Could not send.')
    } catch { setError('Could not send. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Broadcast</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 18px' }}>Send a message to all field staff. Reaches them by push and SMS, respecting their notification preferences and quiet hours. Off-duty staff and urgent safety alerts are handled separately.</p>

      {msg && <div style={ok}>{msg}</div>}
      {error && <div style={err}>{error}</div>}

      <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={600} rows={4} placeholder="Message to all field staff…" style={ta} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#484f58' }}>{message.length}/600 · don’t include exact coordinates (they’re stripped automatically)</span>
          <button type="button" onClick={send} disabled={busy || !message.trim()} style={{ ...primaryBtn, opacity: busy || !message.trim() ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send broadcast'}</button>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: '#8b949e', margin: '24px 0 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent</div>
      {!loaded && <div style={{ fontSize: 13, color: '#8b949e' }}>Loading…</div>}
      {loaded && list.length === 0 && <div style={{ fontSize: 13, color: '#484f58' }}>No broadcasts yet.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {list.map((b) => (
          <div key={b.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 14, color: '#e6edf3', whiteSpace: 'pre-wrap' }}>{b.body}</div>
            <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>{new Date(b.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 720, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const ta: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, color: '#e6edf3', fontSize: 15, fontFamily: 'system-ui', padding: 12, outline: 'none', resize: 'vertical' }
const primaryBtn: React.CSSProperties = { minHeight: 40, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const ok: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const err: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
