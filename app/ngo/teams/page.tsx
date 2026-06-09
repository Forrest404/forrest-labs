'use client'

import { useEffect, useState, useCallback } from 'react'
import { useConfirm, useToast } from '@/lib/ngo-ui'

// Team roster: org_admin and team_leader manage teams and their members.
// Only org_admin may delete a team or invite a member as a field coordinator.

const TEAM_TYPES = ['medical', 'rescue', 'assessment', 'shelter', 'logistics'] as const

interface Team { id: string; name: string; type: string; capacity: number | null; status: string; all_off_duty?: boolean; group_chat_url?: string | null }
interface Member { id: string; name: string; role: string | null; phone: string | null; emergency_contact: string | null; ngo_user_id: string | null }

const STATUS_COLOUR: Record<string, string> = {
  standby: '#3fb950', deployed: '#d29922', unavailable: '#8b949e', offline: '#484f58', off_duty: '#a371f7',
}

export default function NgoTeamsPage() {
  const confirm = useConfirm()
  const toast = useToast()
  const [role, setRole] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // modal state
  const [teamModal, setTeamModal] = useState<null | { id?: string; name: string; type: string; capacity: string; chat: string }>(null)
  const [memberForm, setMemberForm] = useState({ name: '', role: '', phone: '', emergency_contact: '' })
  const [memberEdit, setMemberEdit] = useState<null | { id: string; name: string; role: string; phone: string; emergency_contact: string }>(null)
  const [inviteModal, setInviteModal] = useState<null | { memberId: string; name: string; email: string }>(null)
  const [transferModal, setTransferModal] = useState<null | { memberId: string; name: string; targetTeamId: string }>(null)
  const [inviteResult, setInviteResult] = useState<null | { name: string; code: string }>(null)
  const [busy, setBusy] = useState(false)

  const isAdmin = role === 'org_admin'

  useEffect(() => {
    fetch('/api/ngo/auth/check').then((r) => (r.ok ? r.json() : null)).then((d) => setRole(d?.role ?? null)).catch(() => {})
  }, [])

  const loadTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/ngo/teams')
      if (res.ok) { setTeams((await res.json()).teams ?? []); setErr(null) }
      else setErr('Could not load teams.')
    } catch { setErr('Could not load teams.') }
    finally { setLoaded(true) }
  }, [])
  useEffect(() => { loadTeams() }, [loadTeams])

  const loadMembers = useCallback(async (teamId: string) => {
    const res = await fetch(`/api/ngo/teams/${teamId}/members`)
    if (res.ok) setMembers((await res.json()).members ?? [])
  }, [])
  useEffect(() => { if (selected) loadMembers(selected); else setMembers([]) }, [selected, loadMembers])

  // ── Team CRUD ──────────────────────────────────────────────────────────
  async function saveTeam() {
    if (!teamModal) return
    setErr(null); setBusy(true)
    const editing = !!teamModal.id
    try {
      const res = await fetch(editing ? `/api/ngo/teams/${teamModal.id}` : '/api/ngo/teams', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamModal.name, type: teamModal.type, capacity: teamModal.capacity || null, group_chat_url: teamModal.chat.trim() }),
      })
      const data = await res.json()
      if (res.ok) { setTeamModal(null); await loadTeams() }
      else setErr(data.error ?? 'Could not save team.')
    } finally { setBusy(false) }
  }

  async function deleteTeam(id: string) {
    if (!(await confirm({ title: 'Delete this team?', body: 'The team and all its members will be removed.', danger: true, confirmLabel: 'Delete' }))) return
    setErr(null)
    const res = await fetch(`/api/ngo/teams/${id}`, { method: 'DELETE' })
    if (res.ok) { if (selected === id) setSelected(null); toast('Team deleted'); await loadTeams() }
    else setErr((await res.json()).error ?? 'Could not delete team.')
  }

  // ── Members ──────────────────────────────────────────────────────────────
  async function addMember() {
    if (!selected || !memberForm.name.trim()) { setErr('Member name is required.'); return }
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/ngo/teams/${selected}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberForm),
      })
      if (res.ok) { setMemberForm({ name: '', role: '', phone: '', emergency_contact: '' }); await loadMembers(selected) }
      else setErr((await res.json()).error ?? 'Could not add member.')
    } finally { setBusy(false) }
  }

  async function saveMemberEdit() {
    if (!memberEdit || !selected || !memberEdit.name.trim()) { setErr('Member name is required.'); return }
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/ngo/teams/${selected}/members/${memberEdit.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: memberEdit.name, role: memberEdit.role, phone: memberEdit.phone, emergency_contact: memberEdit.emergency_contact }),
      })
      if (res.ok) { setMemberEdit(null); await loadMembers(selected) }
      else setErr((await res.json()).error ?? 'Could not update member.')
    } finally { setBusy(false) }
  }

  async function removeMember(memberId: string) {
    if (!selected) return
    if (!(await confirm({ title: 'Remove this member from the team?', danger: true, confirmLabel: 'Remove' }))) return
    const res = await fetch(`/api/ngo/teams/${selected}/members/${memberId}`, { method: 'DELETE' })
    if (res.ok) { toast('Member removed'); await loadMembers(selected) }
    else setErr((await res.json()).error ?? 'Could not remove member.')
  }

  async function transferMember() {
    if (!transferModal || !selected || !transferModal.targetTeamId) { setErr('Choose a team to move them to.'); return }
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/ngo/teams/${selected}/members/${transferModal.memberId}/transfer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_team_id: transferModal.targetTeamId }),
      })
      const data = await res.json()
      if (res.ok) { setTransferModal(null); await loadMembers(selected) } // they leave this team's roster
      else setErr(data.error ?? 'Could not move member.')
    } finally { setBusy(false) }
  }

  async function sendInvite() {
    if (!inviteModal || !selected) return
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/ngo/teams/${selected}/members/${inviteModal.memberId}/invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteModal.email }),
      })
      const data = await res.json()
      if (res.ok) { const name = inviteModal.name; setInviteModal(null); await loadMembers(selected); if (data.login_code) setInviteResult({ name, code: data.login_code }) }
      else setErr(data.error ?? 'Could not send invite.')
    } finally { setBusy(false) }
  }

  const selectedTeam = teams.find((t) => t.id === selected)

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Teams</h1>
          <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>Build your teams and the people in them.</div>
        </div>
        <button type="button" onClick={() => setTeamModal({ name: '', type: 'medical', capacity: '', chat: '' })} style={primaryBtn}>+ New team</button>
      </div>

      {err && <div style={errorBox}>{err}</div>}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Teams list */}
        <div style={{ flex: '0 0 340px' }}>
          {!loaded && <div style={{ ...card, color: '#8b949e', fontSize: 13 }}>Loading…</div>}
          {loaded && teams.length === 0 && <div style={{ ...card, color: '#8b949e', fontSize: 13 }}>No teams yet — add one with “New team”.</div>}
          {teams.map((t) => (
            <div key={t.id} onClick={() => setSelected(t.id)} style={{ ...card, cursor: 'pointer', borderColor: selected === t.id ? '#58a6ff' : '#21262d', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <span style={{ fontSize: 11, color: STATUS_COLOUR[t.all_off_duty ? 'off_duty' : t.status] ?? '#484f58' }}>● {t.all_off_duty ? '🌙 off duty' : t.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                {t.type}{t.capacity != null ? ` · capacity ${t.capacity}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); setTeamModal({ id: t.id, name: t.name, type: t.type, capacity: t.capacity?.toString() ?? '', chat: t.group_chat_url ?? '' }) }} style={miniBtn}>Edit</button>
                {isAdmin && <button type="button" onClick={(e) => { e.stopPropagation(); deleteTeam(t.id) }} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>Delete</button>}
              </div>
            </div>
          ))}
        </div>

        {/* Members panel */}
        <div style={{ flex: 1 }}>
          {!selectedTeam ? (
            <div style={{ ...card, color: '#8b949e', fontSize: 13 }}>Select a team to manage its members.</div>
          ) : (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>{selectedTeam.name} — members</div>

              {members.some((m) => !m.ngo_user_id) && (
                <div style={{ background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.4)', color: '#d29922', borderRadius: 6, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>
                  {members.filter((m) => !m.ngo_user_id).length} member(s) aren’t linked to a login account, so they won’t receive dispatches, broadcasts or safety alerts. {isAdmin ? 'Use Invite to give them app access.' : 'Ask an org admin to invite them.'}
                </div>
              )}

              {members.length === 0 && <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 12 }}>No members yet.</div>}
              {members.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #21262d' }}>
                  <div>
                    <div style={{ fontSize: 14 }}>
                      {m.name}
                      {m.ngo_user_id
                        ? <span style={{ fontSize: 11, color: '#3fb950', marginLeft: 8 }}>App access ✓</span>
                        : <span style={{ fontSize: 11, color: '#d29922', marginLeft: 8 }}>⚠ No app access — won’t get alerts</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>
                      {[m.role, m.phone].filter(Boolean).join(' · ') || '—'}
                      {m.emergency_contact ? ` · ICE: ${m.emergency_contact}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setMemberEdit({ id: m.id, name: m.name, role: m.role ?? '', phone: m.phone ?? '', emergency_contact: m.emergency_contact ?? '' })} style={miniBtn}>Edit</button>
                    {isAdmin && !m.ngo_user_id && (
                      <button type="button" onClick={() => setInviteModal({ memberId: m.id, name: m.name, email: '' })} style={miniBtn}>Invite</button>
                    )}
                    {teams.length > 1 && (
                      <button type="button" onClick={() => setTransferModal({ memberId: m.id, name: m.name, targetTeamId: '' })} style={miniBtn}>Move</button>
                    )}
                    <button type="button" onClick={() => removeMember(m.id)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>Remove</button>
                  </div>
                </div>
              ))}

              {/* Add member */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #21262d' }}>
                <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 8 }}>Add a member</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input style={field} placeholder="Name" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
                  <input style={field} placeholder="Role (e.g. medic)" value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} />
                  <input style={field} placeholder="Phone" value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} />
                  <input style={field} placeholder="Emergency contact" value={memberForm.emergency_contact} onChange={(e) => setMemberForm({ ...memberForm, emergency_contact: e.target.value })} />
                </div>
                <button type="button" onClick={addMember} disabled={busy} style={{ ...primaryBtn, marginTop: 8 }}>Add member</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Team modal */}
      {teamModal && (
        <Modal title={teamModal.id ? 'Edit team' : 'New team'} onClose={() => setTeamModal(null)}>
          <label style={labelStyle}>Name</label>
          <input style={field} value={teamModal.name} onChange={(e) => setTeamModal({ ...teamModal, name: e.target.value })} />
          <label style={{ ...labelStyle, marginTop: 12 }}>Type</label>
          <select style={field} value={teamModal.type} onChange={(e) => setTeamModal({ ...teamModal, type: e.target.value })}>
            {TEAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={{ ...labelStyle, marginTop: 12 }}>Capacity (optional)</label>
          <input style={field} type="number" min={0} value={teamModal.capacity} onChange={(e) => setTeamModal({ ...teamModal, capacity: e.target.value })} />
          {teamModal.id ? (
            <>
              <label style={{ ...labelStyle, marginTop: 12 }}>Group chat link (optional)</label>
              <input style={field} value={teamModal.chat} onChange={(e) => setTeamModal({ ...teamModal, chat: e.target.value })} placeholder="https://chat.whatsapp.com/… or signal:…" />
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>Field staff open this in one tap. Signal / WhatsApp / Telegram invite link.</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 8 }}>You can add a group-chat link after creating the team.</div>
          )}
          <button type="button" onClick={saveTeam} disabled={busy || !teamModal.name.trim()} style={{ ...primaryBtn, marginTop: 16, opacity: busy || !teamModal.name.trim() ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Save team'}
          </button>
        </Modal>
      )}

      {/* Member edit modal */}
      {memberEdit && (
        <Modal title="Edit member" onClose={() => setMemberEdit(null)}>
          <label style={labelStyle}>Name</label>
          <input style={field} value={memberEdit.name} onChange={(e) => setMemberEdit({ ...memberEdit, name: e.target.value })} />
          <label style={{ ...labelStyle, marginTop: 12 }}>Role</label>
          <input style={field} value={memberEdit.role} onChange={(e) => setMemberEdit({ ...memberEdit, role: e.target.value })} />
          <label style={{ ...labelStyle, marginTop: 12 }}>Phone</label>
          <input style={field} value={memberEdit.phone} onChange={(e) => setMemberEdit({ ...memberEdit, phone: e.target.value })} />
          <label style={{ ...labelStyle, marginTop: 12 }}>Emergency contact</label>
          <input style={field} value={memberEdit.emergency_contact} onChange={(e) => setMemberEdit({ ...memberEdit, emergency_contact: e.target.value })} />
          <button type="button" onClick={saveMemberEdit} disabled={busy || !memberEdit.name.trim()} style={{ ...primaryBtn, marginTop: 16, opacity: busy || !memberEdit.name.trim() ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Save member'}
          </button>
        </Modal>
      )}

      {/* Transfer / move member modal */}
      {transferModal && (
        <Modal title={`Move ${transferModal.name}`} onClose={() => setTransferModal(null)}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            Moves {transferModal.name} to another team in your organisation. Their app access, role
            and contacts move with them, and if they have a login they’re notified of the change.
          </div>
          <label style={labelStyle}>Move to team</label>
          <select style={field} value={transferModal.targetTeamId} onChange={(e) => setTransferModal({ ...transferModal, targetTeamId: e.target.value })}>
            <option value="">Select a team…</option>
            {teams.filter((t) => t.id !== selected).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.type})</option>)}
          </select>
          <button type="button" onClick={transferMember} disabled={busy || !transferModal.targetTeamId} style={{ ...primaryBtn, marginTop: 16, opacity: busy || !transferModal.targetTeamId ? 0.6 : 1 }}>
            {busy ? 'Moving…' : 'Move member'}
          </button>
        </Modal>
      )}

      {/* Invite modal */}
      {inviteModal && (
        <Modal title={`Invite ${inviteModal.name}`} onClose={() => setInviteModal(null)}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            Creates a field-coordinator login. We generate a one-tap access code — they sign in
            by typing it or scanning a QR. No password needed.
          </div>
          <label style={labelStyle}>Email</label>
          <input style={field} type="email" value={inviteModal.email} onChange={(e) => setInviteModal({ ...inviteModal, email: e.target.value })} />
          <button type="button" onClick={sendInvite} disabled={busy} style={{ ...primaryBtn, marginTop: 16, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Inviting…' : 'Create access code'}
          </button>
        </Modal>
      )}

      {/* Invite result — show the access code once */}
      {inviteResult && (
        <Modal title={`${inviteResult.name} can sign in`} onClose={() => setInviteResult(null)}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            Share this access code with {inviteResult.name}. They enter it on the NOUR login screen,
            or open the link below. Manage the QR and regenerate it any time from <a href="/ngo/users" style={{ color: '#58a6ff', textDecoration: 'none' }}>Users</a>.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '12px 14px' }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.18em' }}>{inviteResult.code}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(inviteResult.code)} style={miniBtn}>Copy code</button>
          </div>
          <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/ngo/login?code=${inviteResult.code}`)} style={{ ...miniBtn, marginTop: 10 }}>Copy login link</button>
          <button type="button" onClick={() => setInviteResult(null)} style={{ ...primaryBtn, marginTop: 16 }}>Done</button>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 360, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14 }
const field: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const primaryBtn: React.CSSProperties = { height: 38, padding: '0 16px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const miniBtn: React.CSSProperties = { height: 28, padding: '0 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
