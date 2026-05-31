'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface OrgDetail {
  id: string; name: string; type: string; country: string | null; status: string; created_at: string
  area_description: string | null
  share_team_presence: boolean; share_operational_area: boolean
  team_count: number
}
interface User { id: string; full_name: string | null; email: string; role: string; status: string; created_at: string }

const STATUS_COLOUR: Record<string, string> = { approved: '#3fb950', pending: '#d29922', suspended: '#f85149', active: '#3fb950' }

export default function NgoDetail() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(false)
    try {
      const r = await fetch(`/api/platform/orgs/${id}`, { cache: 'no-store' })
      if (r.status === 401) { router.push('/admin/login'); return }
      if (r.ok) { const d = await r.json(); setOrg(d.org); setUsers(d.users ?? []) }
      else setError(true)
    } catch { setError(true) }
    setLoaded(true)
  }, [id, router])
  useEffect(() => { load() }, [load])

  // Org suspend/reactivate reuse the existing revoke/restore endpoints (which also
  // cascade to all users), then reload to reflect new statuses.
  const orgAction = useCallback(async (path: 'revoke' | 'restore', confirmMsg: string) => {
    if (!org || !window.confirm(confirmMsg)) return
    setBusy('org'); setNote(null)
    try {
      const r = await fetch(`/api/ngo-review/${org.id}/${path}`, { method: 'POST' })
      if (r.ok) { setNote(path === 'revoke' ? 'Organisation suspended.' : 'Organisation reactivated.'); await load() }
      else setNote((await r.json().catch(() => ({})))?.error ?? 'Action failed.')
    } catch { setNote('Action failed.') }
    finally { setBusy(null) }
  }, [org, load])

  const userAction = useCallback(async (u: User, kind: 'suspend' | 'reactivate' | 'remove') => {
    if (kind === 'remove' && !window.confirm(`Remove ${u.email}? This deletes their account.`)) return
    setBusy(u.id); setNote(null)
    try {
      const r = kind === 'remove'
        ? await fetch(`/api/platform/users/${u.id}`, { method: 'DELETE' })
        : await fetch(`/api/platform/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: kind }) })
      if (r.ok) {
        if (kind === 'remove') setUsers((prev) => prev.filter((x) => x.id !== u.id))
        else setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, status: kind === 'suspend' ? 'suspended' : 'active' } : x))
        setNote(`User ${kind === 'remove' ? 'removed' : kind + 'd'}.`)
      } else setNote((await r.json().catch(() => ({})))?.error ?? 'Action failed.')
    } catch { setNote('Action failed.') }
    finally { setBusy(null) }
  }, [])

  if (!loaded) return <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>
  if (error || !org) return (
    <div>
      <button type="button" onClick={() => router.push('/platform/ngos')} style={backLink}>← Manage NGOs</button>
      <div style={errBox}>Couldn’t load this organisation. <button type="button" onClick={load} style={retryBtn}>Retry</button></div>
    </div>
  )

  return (
    <div style={{ maxWidth: 820 }}>
      <button type="button" onClick={() => router.push('/platform/ngos')} style={backLink}>← Manage NGOs</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, margin: '8px 0 16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{org.name}</h1>
            <span style={{ fontSize: 12, color: STATUS_COLOUR[org.status] ?? '#8b949e' }}>● {org.status}</span>
          </div>
          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>
            {org.type}{org.country ? ` · ${org.country}` : ''} · {org.team_count} team{org.team_count === 1 ? '' : 's'} · created {new Date(org.created_at).toLocaleDateString()}
          </div>
          {org.area_description && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}><span style={lbl}>Operational area</span> {org.area_description}</div>}
        </div>
        <div style={{ flexShrink: 0 }}>
          {org.status === 'suspended'
            ? <button type="button" disabled={busy === 'org'} onClick={() => orgAction('restore', `Reactivate "${org.name}"? Its users will be able to sign in again.`)} style={btn('#3fb950')}>Reactivate org</button>
            : <button type="button" disabled={busy === 'org'} onClick={() => orgAction('revoke', `Suspend "${org.name}"? This blocks all its users from signing in.`)} style={btn('#d29922')}>Suspend org</button>}
        </div>
      </div>

      {note && <div style={infoBox}>{note}</div>}

      <div style={{ fontSize: 13, fontWeight: 600, margin: '8px 0 10px' }}>Users ({users.length})</div>
      {users.length === 0 && <div style={{ color: '#484f58', fontSize: 13 }}>No users.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map((u) => (
          <div key={u.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{u.full_name ?? u.email} <span style={{ fontSize: 11, color: STATUS_COLOUR[u.status] ?? '#8b949e', marginLeft: 6 }}>● {u.status}</span></div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{u.email} · {u.role}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {u.status === 'suspended'
                ? <button type="button" disabled={busy === u.id} onClick={() => userAction(u, 'reactivate')} style={miniBtn('#3fb950')}>Reactivate</button>
                : <button type="button" disabled={busy === u.id} onClick={() => userAction(u, 'suspend')} style={miniBtn('#d29922')}>Suspend</button>}
              <button type="button" disabled={busy === u.id} onClick={() => userAction(u, 'remove')} style={miniBtn('#f85149')}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em' }
const backLink: React.CSSProperties = { background: 'transparent', border: 'none', color: '#58a6ff', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui', padding: 0 }
const infoBox: React.CSSProperties = { background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const errBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'transparent', border: '1px solid #f85149', color: '#f85149', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
function btn(colour: string): React.CSSProperties {
  return { height: 34, padding: '0 16px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${colour}66`, color: colour, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
}
function miniBtn(colour: string): React.CSSProperties {
  return { height: 30, padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${colour}66`, color: colour, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
}
