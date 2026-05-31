'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface PendingOrg {
  id: string; name: string; type: string; country: string | null
  operational_area: { description?: string } | null
  created_at: string
  admin: { full_name: string | null; email: string; phone: string | null } | null
}

export default function PlatformReview() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<PendingOrg[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [rejectFor, setRejectFor] = useState<PendingOrg | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setError(false)
    try {
      const r = await fetch('/api/ngo-review', { cache: 'no-store' })
      if (r.status === 401) { router.push('/admin/login'); return }
      if (r.ok) setOrgs((await r.json()).organisations ?? [])
      else setError(true)
    } catch { setError(true) }
    setLoaded(true)
  }, [router])
  useEffect(() => { load() }, [load])

  const approve = useCallback(async (o: PendingOrg) => {
    setBusy(o.id); setNote(null)
    try {
      const r = await fetch(`/api/ngo-review/${o.id}/approve`, { method: 'POST' })
      if (r.ok) { setOrgs((prev) => prev.filter((x) => x.id !== o.id)); setNote(`Approved "${o.name}".`) }
      else setNote((await r.json().catch(() => ({})))?.error ?? 'Approval failed.')
    } catch { setNote('Approval failed.') }
    finally { setBusy(null) }
  }, [])

  const submitReject = useCallback(async () => {
    if (!rejectFor || !reason.trim()) return
    setBusy(rejectFor.id); setNote(null)
    try {
      const r = await fetch(`/api/ngo-review/${rejectFor.id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (r.ok) { setOrgs((prev) => prev.filter((x) => x.id !== rejectFor.id)); setNote(`Rejected "${rejectFor.name}".`); setRejectFor(null); setReason('') }
      else setNote((await r.json().catch(() => ({})))?.error ?? 'Rejection failed.')
    } catch { setNote('Rejection failed.') }
    finally { setBusy(null) }
  }, [rejectFor, reason])

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>NGO review</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 20px' }}>Organisations awaiting review. Approve to let their admin sign in, or reject with a reason.</p>

      {note && <div style={infoBox}>{note}</div>}
      {error && <div style={errBox}>Couldn’t load pending organisations. <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}
      {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {loaded && !error && orgs.length === 0 && <div style={{ color: '#484f58', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>No organisations pending approval.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orgs.map((o) => (
          <div key={o.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{o.name}</div>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>
                <span style={lbl}>Type</span> {o.type}{o.country ? <>  ·  <span style={lbl}>Country</span> {o.country}</> : null}
              </div>
              {o.operational_area?.description && (
                <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}><span style={lbl}>Area</span> {o.operational_area.description}</div>
              )}
              {o.admin && (
                <div style={{ fontSize: 12, color: '#e6edf3' }}><span style={lbl}>Admin</span> {o.admin.full_name ?? '—'} · {o.admin.email}{o.admin.phone ? ` · ${o.admin.phone}` : ''}</div>
              )}
            </div>
            <div style={{ flexShrink: 0, display: 'flex', gap: 8 }}>
              <button type="button" disabled={busy === o.id} onClick={() => approve(o)} style={btn('#3fb950')}>{busy === o.id ? '…' : 'Approve'}</button>
              <button type="button" disabled={busy === o.id} onClick={() => { setRejectFor(o); setReason('') }} style={btn('#f85149')}>Reject</button>
            </div>
          </div>
        ))}
      </div>

      {rejectFor && (
        <div onClick={() => setRejectFor(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Reject “{rejectFor.name}”</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 14 }}>A reason is required and recorded in the audit log.</div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this organisation being rejected?"
              rows={4}
              style={{ width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', padding: 10, outline: 'none', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setRejectFor(null)} style={{ ...btn('#8b949e'), flex: 1 }}>Cancel</button>
              <button type="button" disabled={!reason.trim() || busy === rejectFor.id} onClick={submitReject} style={{ ...btn('#f85149'), flex: 1, opacity: !reason.trim() ? 0.5 : 1 }}>
                {busy === rejectFor.id ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em' }
const infoBox: React.CSSProperties = { background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const errBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'transparent', border: '1px solid #f85149', color: '#f85149', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
function btn(colour: string): React.CSSProperties {
  return { height: 34, padding: '0 16px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${colour}66`, color: colour, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
}
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }
const modal: React.CSSProperties = { width: 420, maxWidth: '90%', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }
