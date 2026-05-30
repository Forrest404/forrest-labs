'use client'

import { useState, useEffect, useCallback } from 'react'

interface Org {
  id: string; name: string; type: string; country: string | null; status: string; created_at: string
  user_count: number; team_count: number
  admin: { full_name: string | null; email: string; phone: string | null } | null
}

const STATUS_COLOUR: Record<string, string> = { approved: '#3fb950', pending: '#d29922', suspended: '#f85149' }
const STATUS_ORDER: Record<string, number> = { pending: 0, approved: 1, suspended: 2 }

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loaded, setLoaded] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/ngo-review/orgs', { cache: 'no-store' })
    if (res.ok) {
      const list: Org[] = (await res.json()).organisations ?? []
      list.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
      setOrgs(list)
    }
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  const act = useCallback(async (org: Org, path: string, method: 'POST' | 'DELETE', confirmMsg: string | null, okMsg: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(org.id); setNote(null)
    try {
      const res = await fetch(`/api/ngo-review/${org.id}${path}`, { method })
      if (res.ok) { setNote(okMsg); await load() }
      else setNote((await res.json().catch(() => ({})))?.error ?? 'Action failed.')
    } catch { setNote('Action failed.') }
    finally { setBusy(null) }
  }, [load])

  const approve = (o: Org) => act(o, '/approve', 'POST', null, `Approved "${o.name}".`)
  const deny = (o: Org) => act(o, '/reject', 'POST', `Deny "${o.name}"? Its admin won't be able to sign in.`, `Denied "${o.name}".`)
  const revoke = (o: Org) => act(o, '/revoke', 'POST', `Revoke "${o.name}"? This logs out and blocks all ${o.user_count} user(s) immediately.`, `Revoked "${o.name}".`)
  const restore = (o: Org) => act(o, '/restore', 'POST', null, `Restored "${o.name}".`)
  const del = (o: Org) => act(o, '', 'DELETE', `PERMANENTLY DELETE "${o.name}" and ALL its data (users, teams, dispatches)? This cannot be undone.`, `Deleted "${o.name}".`)

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', padding: '32px 24px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 4 }}>
          NOUR — internal · <a href="/ngo-review" style={link}>Approvals</a> · <a href="/ngo-review/teams" style={link}>All teams</a>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Organisations</h1>
        <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 24 }}>
          Every NGO. Approve or deny applications; revoke access (logs out & blocks all users), restore, or delete.
        </p>

        {note && <div style={{ background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{note}</div>}
        {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
        {loaded && orgs.length === 0 && <div style={{ color: '#484f58', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>No organisations.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orgs.map((o) => (
            <div key={o.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{o.name}</span>
                  <span style={{ fontSize: 11, color: STATUS_COLOUR[o.status] ?? '#8b949e' }}>● {o.status}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>
                  {o.type}{o.country ? ` · ${o.country}` : ''} · {o.user_count} user{o.user_count === 1 ? '' : 's'} · {o.team_count} team{o.team_count === 1 ? '' : 's'}
                </div>
                {o.admin && (
                  <div style={{ fontSize: 12, color: '#e6edf3' }}>
                    <span style={lbl}>Admin</span> {o.admin.full_name ?? '—'} · {o.admin.email}{o.admin.phone ? ` · ${o.admin.phone}` : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {o.status === 'pending' && <button type="button" disabled={busy === o.id} onClick={() => approve(o)} style={btn('#3fb950')}>Approve</button>}
                {o.status === 'pending' && <button type="button" disabled={busy === o.id} onClick={() => deny(o)} style={btn('#f85149')}>Deny</button>}
                {o.status === 'approved' && <button type="button" disabled={busy === o.id} onClick={() => revoke(o)} style={btn('#d29922')}>Revoke</button>}
                {o.status === 'suspended' && <button type="button" disabled={busy === o.id} onClick={() => restore(o)} style={btn('#3fb950')}>Restore</button>}
                {o.status !== 'pending' && <button type="button" disabled={busy === o.id} onClick={() => del(o)} style={btn('#f85149')}>Delete</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const link: React.CSSProperties = { color: '#58a6ff', textDecoration: 'none' }
const lbl: React.CSSProperties = { fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em' }
function btn(colour: string): React.CSSProperties {
  return { height: 32, padding: '0 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${colour}66`, color: colour, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
}
