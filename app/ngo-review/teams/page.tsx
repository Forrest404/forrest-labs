'use client'

import { useState, useEffect, useCallback } from 'react'

const TEAM_TYPES = ['medical', 'rescue', 'assessment', 'shelter', 'logistics']
const TEAM_STATUS_COLOUR: Record<string, string> = {
  standby: '#3fb950', deployed: '#d29922', unavailable: '#8b949e', offline: '#484f58',
}
const ORG_STATUS_COLOUR: Record<string, string> = { approved: '#3fb950', pending: '#d29922', suspended: '#f85149' }

interface Team {
  id: string; name: string; type: string; capacity: number | null; status: string
  org_id: string; org_name: string; org_status: string | null; member_count: number
}
interface Member { id: string; name: string; role: string | null; phone: string | null; emergency_contact: string | null; ngo_user_id: string | null }

export default function AdminAllTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loaded, setLoaded] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [edit, setEdit] = useState<null | { id: string; name: string; type: string; capacity: string }>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/ngo-review/teams', { cache: 'no-store' })
    if (res.ok) setTeams((await res.json()).teams ?? [])
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
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', padding: '32px 24px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 4 }}>
          NOUR — internal · <a href="/ngo-review" style={{ color: '#58a6ff', textDecoration: 'none' }}>Approvals</a> · <a href="/ngo-review/orgs" style={{ color: '#58a6ff', textDecoration: 'none' }}>Organisations</a>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>All NGO teams</h1>
        <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 24 }}>
          Every team across all organisations. Edit or remove a team, or manage its members.
        </p>

        {note && (
          <div style={{ background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{note}</div>
        )}

        {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
        {loaded && teams.length === 0 && <div style={{ color: '#484f58', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>No teams yet.</div>}

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
      </div>

      {edit && (
        <div onClick={() => setEdit(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Edit team</div>
            <label style={labelStyle}>Name</label>
            <input style={field} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <label style={{ ...labelStyle, marginTop: 12 }}>Type</label>
            <select style={field} value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
              {TEAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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

const miniBtn: React.CSSProperties = { height: 30, padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }
const modal: React.CSSProperties = { width: 360, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }
const field: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const primaryBtn: React.CSSProperties = { width: '100%', height: 40, background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
