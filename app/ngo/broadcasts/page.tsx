'use client'

import { useState, useEffect, useCallback } from 'react'

// Broadcast composer + history for leaders/admins. One-way: send urgent operational notices
// to field staff / a team / leaders. Push only for now (SMS deferred server-side). Field
// coordinators read + acknowledge in their field view, not here.

const MAX = 280

interface Audiences { field_count: number; leader_count: number; teams: { id: string; name: string; count: number }[] }
interface Broadcast {
  id: string; body: string; target_type: string; team_id: string | null; urgency: string
  created_at: string; sender_name: string; target_label: string
  recipient_count: number; delivered_count: number; acknowledged_count: number
}

export default function BroadcastsPage() {
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState<'all' | 'team' | 'leaders'>('all')
  const [teamId, setTeamId] = useState('')
  const [urgency, setUrgency] = useState<'routine' | 'urgent'>('routine')
  const [aud, setAud] = useState<Audiences | null>(null)
  const [list, setList] = useState<Broadcast[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [token, setToken] = useState(() => crypto.randomUUID())
  const [roster, setRoster] = useState<{ id: string; recipients: { name: string; delivered: boolean; acknowledged: boolean }[] } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/broadcasts', { cache: 'no-store' })
      if (!r.ok) { setError('Could not load broadcasts.'); setLoaded(true); return }
      const d = await r.json()
      setList(d.broadcasts ?? [])
      setAud(d.audiences ?? null)
    } catch { setError('Could not load broadcasts.') }
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  // Audience size for the current target (drives the confirmation wording).
  const audienceCount = (): number => {
    if (!aud) return 0
    if (target === 'leaders') return aud.leader_count
    if (target === 'team') return aud.teams.find((t) => t.id === teamId)?.count ?? 0
    return aud.field_count
  }
  const audienceName = (): string => {
    if (target === 'leaders') return `all ${audienceCount()} leaders`
    if (target === 'team') { const t = aud?.teams.find((x) => x.id === teamId); return t ? `team ${t.name} (${t.count})` : 'this team' }
    return `all ${audienceCount()} field staff`
  }

  const canCompose = message.trim().length > 0 && (target !== 'team' || teamId)

  const askConfirm = () => {
    setError(null); setMsg(null)
    if (!message.trim()) { setError('Enter a message.'); return }
    if (target === 'team' && !teamId) { setError('Choose a team.'); return }
    setConfirming(true)
  }

  const send = async () => {
    if (sending) return
    setSending(true); setError(null); setMsg(null)
    try {
      const r = await fetch('/api/ngo/broadcasts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), target_type: target, team_id: target === 'team' ? teamId : undefined, urgency, client_token: token }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        setMsg(d.duplicate ? 'Already sent.' : `Sent to ${d.sent_count} recipient${d.sent_count === 1 ? '' : 's'}.`)
        setMessage(''); setConfirming(false); setToken(crypto.randomUUID()) // fresh token for next send
        await load()
      } else {
        setError(d.error ?? 'Could not send.'); setConfirming(false)
      }
    } catch { setError('Could not send. Please try again.'); setConfirming(false) }
    finally { setSending(false) }
  }

  const openRoster = async (id: string) => {
    if (roster?.id === id) { setRoster(null); return }
    setRoster({ id, recipients: [] })
    try {
      const r = await fetch(`/api/ngo/broadcasts/${id}`, { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setRoster({ id, recipients: d.recipients ?? [] }) }
    } catch { /* keep empty */ }
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Broadcast</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 18px' }}>One-way urgent notices to your field staff. Reaches them by push (and, for urgent, by SMS once that’s enabled). For back-and-forth, use your linked Signal/WhatsApp group.</p>

      {msg && <div style={ok}>{msg}</div>}
      {error && <div style={err}>{error}</div>}

      {/* Compose */}
      <div style={card}>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MAX} rows={3} placeholder="Short operational message…" style={ta} />
        <div style={{ fontSize: 11, color: message.length > MAX - 20 ? '#d29922' : '#484f58', textAlign: 'right' }}>{message.length}/{MAX}</div>

        <div style={fieldLabel}>Send to</div>
        <div style={{ display: 'grid', gap: 6 }}>
          <Radio checked={target === 'all'} onChange={() => setTarget('all')} label={`All field staff${aud ? ` (${aud.field_count})` : ''}`} />
          <Radio checked={target === 'team'} onChange={() => setTarget('team')} label="A specific team" />
          {target === 'team' && (
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ ...input, marginLeft: 26 }}>
              <option value="">Choose a team…</option>
              {(aud?.teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.count})</option>)}
            </select>
          )}
          <Radio checked={target === 'leaders'} onChange={() => setTarget('leaders')} label={`All leaders${aud ? ` (${aud.leader_count})` : ''}`} />
        </div>

        <div style={fieldLabel}>Urgency</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Pill active={urgency === 'routine'} onClick={() => setUrgency('routine')} label="Routine" color="#3fb950" />
          <Pill active={urgency === 'urgent'} onClick={() => setUrgency('urgent')} label="Urgent (asks for acknowledgement)" color="#f85149" />
        </div>

        <button type="button" onClick={askConfirm} disabled={!canCompose} style={{ ...primaryBtn, marginTop: 14, opacity: canCompose ? 1 : 0.5 }}>Send broadcast</button>
        <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>A broadcast can’t be unsent. Coordinates are stripped automatically.</div>
      </div>

      {/* Confirmation */}
      {confirming && (
        <div style={overlay} onClick={() => !sending && setConfirming(false)}>
          <div style={dialog} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Send {urgency === 'urgent' ? 'an urgent ' : ''}broadcast?</div>
            <div style={{ fontSize: 14, color: '#c9d1d9', marginBottom: 4 }}>This will be sent to <b style={{ color: '#e6edf3' }}>{audienceName()}</b>. It can’t be unsent.</div>
            <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 10, fontSize: 13, color: '#c9d1d9', margin: '10px 0', whiteSpace: 'pre-wrap' }}>{message.trim()}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirming(false)} disabled={sending} style={ghostBtn}>Cancel</button>
              <button type="button" onClick={send} disabled={sending} style={{ ...primaryBtn, opacity: sending ? 0.6 : 1 }}>{sending ? 'Sending…' : `Send to ${audienceCount()}`}</button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#8b949e', margin: '26px 0 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>History</div>
      {!loaded && <div style={{ fontSize: 13, color: '#8b949e' }}>Loading…</div>}
      {loaded && list.length === 0 && <div style={{ fontSize: 13, color: '#484f58' }}>No broadcasts yet.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {list.map((b) => (
          <div key={b.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 14, color: '#e6edf3', whiteSpace: 'pre-wrap', flex: 1 }}>{b.body}</div>
              {b.urgency === 'urgent' && <span style={badge('#f85149')}>URGENT</span>}
            </div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6 }}>
              {b.sender_name} · {b.target_label} · {new Date(b.created_at).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
              Delivered {b.delivered_count}/{b.recipient_count}
              {b.urgency === 'urgent' && <> · Acknowledged {b.acknowledged_count}/{b.recipient_count}
                {' · '}<button type="button" onClick={() => openRoster(b.id)} style={linkBtn}>{roster?.id === b.id ? 'Hide' : 'Who?'}</button></>}
            </div>
            {b.urgency === 'urgent' && roster?.id === b.id && (
              <div style={{ marginTop: 8, borderTop: '1px solid #21262d', paddingTop: 8, display: 'grid', gap: 3 }}>
                {roster.recipients.length === 0 && <div style={{ fontSize: 12, color: '#484f58' }}>Loading…</div>}
                {roster.recipients.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: r.acknowledged ? '#3fb950' : '#484f58', flexShrink: 0 }} />
                    <span style={{ color: '#c9d1d9' }}>{r.name}</span>
                    <span style={{ color: r.acknowledged ? '#3fb950' : '#8b949e', marginLeft: 'auto', fontSize: 11 }}>{r.acknowledged ? 'acknowledged' : r.delivered ? 'seen' : 'not seen'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#e6edf3', cursor: 'pointer' }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ width: 16, height: 16 }} />{label}
    </label>
  )
}
function Pill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button type="button" onClick={onClick} style={{ flex: 1, minHeight: 38, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? `${color}22` : '#0d1117', border: `1px solid ${active ? color : '#21262d'}`, color: active ? color : '#8b949e' }}>{label}</button>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 640, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14 }
const ta: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, color: '#e6edf3', fontSize: 15, fontFamily: 'system-ui', padding: 12, outline: 'none', resize: 'vertical' }
const input: React.CSSProperties = { height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 14, fontFamily: 'system-ui', width: 'calc(100% - 26px)' }
const fieldLabel: React.CSSProperties = { fontSize: 12, color: '#8b949e', margin: '14px 0 6px' }
const primaryBtn: React.CSSProperties = { minHeight: 42, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', width: '100%' }
const ghostBtn: React.CSSProperties = { minHeight: 38, padding: '0 16px', background: 'transparent', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'system-ui' }
const ok: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const err: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }
const dialog: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 18, maxWidth: 420, width: '100%' }
function badge(c: string): React.CSSProperties { return { fontSize: 10, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 } }
