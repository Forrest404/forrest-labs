'use client'

import { useState, useEffect, useCallback } from 'react'

// NGO Review — moved into the admin panel (was the standalone /ngo-review tool).
// Renders inside app/admin/layout.tsx (sidebar + admin auth-on-mount). Uses the
// same /api/ngo-review/* endpoints (admin-gated via fl_admin_session) as before.
// Two tabs: Organisations (approve/deny/revoke/restore/delete) and All teams.

// ── Organisations ────────────────────────────────────────────────────────────
interface Org {
  id: string; name: string; type: string; country: string | null; status: string; created_at: string
  user_count: number; team_count: number
  admin: { full_name: string | null; email: string; phone: string | null } | null
}
const ORG_STATUS_COLOUR: Record<string, string> = { approved: '#3fb950', pending: '#d29922', suspended: '#f85149' }
const STATUS_ORDER: Record<string, number> = { pending: 0, approved: 1, suspended: 2 }

// ── Teams ────────────────────────────────────────────────────────────────────
const TEAM_TYPES = ['medical', 'rescue', 'assessment', 'shelter', 'logistics']
const TEAM_STATUS_COLOUR: Record<string, string> = { standby: '#3fb950', deployed: '#d29922', unavailable: '#8b949e', offline: '#484f58' }
interface Team {
  id: string; name: string; type: string; capacity: number | null; status: string
  org_id: string; org_name: string; org_status: string | null; member_count: number
}
interface Member { id: string; name: string; role: string | null; phone: string | null; emergency_contact: string | null; ngo_user_id: string | null }

type Tab = 'orgs' | 'teams'

export default function AdminNgoReviewPage() {
  // Honour ?tab=teams (used by the redirect from the old /ngo-review/teams page).
  const [tab, setTab] = useState<Tab>('orgs')
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'teams') setTab('teams')
  }, [])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>NGO review</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 16px' }}>
        Approve or deny organisation applications, revoke or restore access, and manage teams across all NGOs.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #21262d' }}>
        <TabBtn active={tab === 'orgs'} onClick={() => setTab('orgs')}>Organisations</TabBtn>
        <TabBtn active={tab === 'teams'} onClick={() => setTab('teams')}>All teams</TabBtn>
      </div>

      {tab === 'orgs' ? <OrgsTab /> : <TeamsTab />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 36, padding: '0 14px', background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid #f85149' : '2px solid transparent',
        color: active ? '#e6edf3' : '#8b949e', fontSize: 13, fontWeight: active ? 600 : 400,
        cursor: 'pointer', fontFamily: 'system-ui', marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}

// ── Organisations tab ────────────────────────────────────────────────────────
function OrgsTab() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(false)
    try {
      const res = await fetch('/api/ngo-review/orgs', { cache: 'no-store' })
      if (res.ok) {
        const list: Org[] = (await res.json()).organisations ?? []
        list.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
        setOrgs(list)
      } else setError(true)
    } catch { setError(true) }
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
    <div>
      {note && <div style={noteBox('#58a6ff')}>{note}</div>}
      {error && <div style={noteBox('#f85149')}>Couldn’t load organisations. <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}
      {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {loaded && !error && orgs.length === 0 && <div style={emptyBox}>No organisations.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orgs.map((o) => (
          <div key={o.id} style={card}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{o.name}</span>
                <span style={{ fontSize: 11, color: ORG_STATUS_COLOUR[o.status] ?? '#8b949e' }}>● {o.status}</span>
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
  )
}

// ── Teams tab ────────────────────────────────────────────────────────────────
function TeamsTab() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [edit, setEdit] = useState<null | { id: string; name: string; type: string; capacity: string }>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const res = await fetch('/api/ngo-review/teams', { cache: 'no-store' })
      if (res.ok) setTeams((await res.json()).teams ?? [])
      else setError(true)
    } catch { setError(true) }
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  const openMembers = useCallback(async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id); setMembers([])
    const res = await fetch(`/api/ngo-review/teams/${id}/members`, { cache: 'no-store' })
    if (res.ok) setMembers((await res.json()).members ?? [])
  }, [expanded])

  async function saveEdit() {
    if (!edit) return
    setBusy(true); setNote(null)
    try {
      const res = await fetch(`/api/ngo-review/teams/${edit.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: edit.name, type: edit.type, capacity: edit.capacity || null }),
      })
      if (res.ok) { setEdit(null); await load(); setNote('Team updated.') }
      else setNote((await res.json()).error ?? 'Update failed.')
    } finally { setBusy(false) }
  }

  async function removeTeam(t: Team) {
    if (!window.confirm(`Delete team "${t.name}" (${t.org_name})? This removes its members too.`)) return
    setNote(null)
    const res = await fetch(`/api/ngo-review/teams/${t.id}`, { method: 'DELETE' })
    if (res.ok) { setTeams((prev) => prev.filter((x) => x.id !== t.id)); setNote(`Deleted "${t.name}".`) }
    else setNote('Delete failed.')
  }

  async function removeMember(teamId: string, memberId: string) {
    if (!window.confirm('Remove this member?')) return
    const res = await fetch(`/api/ngo-review/teams/${teamId}/members/${memberId}`, { method: 'DELETE' })
    if (res.ok) { setMembers((prev) => prev.filter((m) => m.id !== memberId)); load() }
  }

  // Group teams by org (server already sorts by org name).
  const groups: { org_name: string; org_status: string | null; teams: Team[] }[] = []
  for (const t of teams) {
    const last = groups[groups.length - 1]
    if (last && last.org_name === t.org_name) last.teams.push(t)
    else groups.push({ org_name: t.org_name, org_status: t.org_status, teams: [t] })
  }

  return (
    <div>
      {note && <div style={noteBox('#58a6ff')}>{note}</div>}
      {error && <div style={noteBox('#f85149')}>Couldn’t load teams. <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}
      {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {loaded && !error && teams.length === 0 && <div style={emptyBox}>No teams yet.</div>}

      {groups.map((g) => (
        <div key={g.org_name} style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{g.org_name}</span>
            {g.org_status && <span style={{ fontSize: 11, color: ORG_STATUS_COLOUR[g.org_status] ?? '#8b949e' }}>● {g.org_status}</span>}
            <span style={{ fontSize: 12, color: '#484f58' }}>{g.teams.length} team{g.teams.length === 1 ? '' : 's'}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.teams.map((t) => (
              <div key={t.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                      {t.type}{t.capacity != null ? ` · capacity ${t.capacity}` : ''} ·{' '}
                      <span style={{ color: TEAM_STATUS_COLOUR[t.status] ?? '#484f58' }}>● {t.status}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button type="button" onClick={() => openMembers(t.id)} style={miniBtn}>{expanded === t.id ? 'Hide' : `Members (${t.member_count})`}</button>
                    <button type="button" onClick={() => setEdit({ id: t.id, name: t.name, type: t.type, capacity: t.capacity?.toString() ?? '' })} style={miniBtn}>Edit</button>
                    <button type="button" onClick={() => removeTeam(t)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>Delete</button>
                  </div>
                </div>

                {expanded === t.id && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #21262d' }}>
                    {members.length === 0 && <div style={{ fontSize: 12, color: '#8b949e' }}>No members.</div>}
                    {members.map((m) => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                        <div style={{ fontSize: 13 }}>
                          {m.name}{m.ngo_user_id && <span style={{ fontSize: 11, color: '#3fb950', marginLeft: 8 }}>App access ✓</span>}
                          <div style={{ fontSize: 12, color: '#8b949e' }}>
                            {[m.role, m.phone].filter(Boolean).join(' · ') || '—'}{m.emergency_contact ? ` · ICE: ${m.emergency_contact}` : ''}
                          </div>
                        </div>
                        <button type="button" onClick={() => removeMember(t.id, m.id)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {edit && (
        <div onClick={() => setEdit(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Edit team</div>
            <label style={labelStyle}>Name</label>
            <input style={field} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <label style={{ ...labelStyle, marginTop: 12 }}>Type</label>
            <select style={field} value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
              {TEAM_TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
            </select>
            <label style={{ ...labelStyle, marginTop: 12 }}>Capacity (optional)</label>
            <input style={field} type="number" min={0} value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} />
            <button type="button" onClick={saveEdit} disabled={busy || !edit.name.trim()} style={{ ...primaryBtn, marginTop: 16, opacity: busy || !edit.name.trim() ? 0.6 : 1 }}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared styles ────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }
const lbl: React.CSSProperties = { fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em' }
const emptyBox: React.CSSProperties = { color: '#484f58', fontSize: 14, padding: '40px 0', textAlign: 'center' }
function noteBox(colour: string): React.CSSProperties {
  return { background: `${colour}1a`, border: `1px solid ${colour}4d`, color: colour, borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
}
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'transparent', border: '1px solid #f85149', color: '#f85149', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
function btn(colour: string): React.CSSProperties {
  return { height: 32, padding: '0 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${colour}66`, color: colour, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
}
const miniBtn: React.CSSProperties = { height: 30, padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }
const modal: React.CSSProperties = { width: 360, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }
const field: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const primaryBtn: React.CSSProperties = { width: '100%', height: 40, background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
