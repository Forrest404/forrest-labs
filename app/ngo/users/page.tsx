'use client'

import { useEffect, useState, useCallback } from 'react'

const ROLES = [
  { value: 'org_admin', label: 'Org admin' },
  { value: 'team_leader', label: 'Team leader' },
  { value: 'field_coordinator', label: 'Field coordinator' },
]
const ROLE_LABEL: Record<string, string> = { org_admin: 'Org admin', team_leader: 'Team leader', field_coordinator: 'Field coordinator' }

interface User { id: string; full_name: string | null; email: string; phone: string | null; role: string; status: string; login_code: string | null }
type AddForm = { full_name: string; email: string; phone: string; role: string; password: string }
type EditForm = { id: string; full_name: string; phone: string; role: string; status: string; password: string; regenerate: boolean }

export default function NgoUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [add, setAdd] = useState<AddForm | null>(null)
  const [edit, setEdit] = useState<EditForm | null>(null)
  const [share, setShare] = useState<{ name: string; code: string } | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  const linkFor = (code: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/ngo/login?code=${code}`

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/ngo/users', { cache: 'no-store' })
      if (res.status === 403) { setError('Only an org admin can manage users.'); return }
      if (!res.ok) { setError('Could not load users.'); return }
      const data = await res.json()
      setUsers(data.users ?? []); setMe(data.me ?? null)
    } catch { setError('Could not load users.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Render a QR for the share modal locally (no network — code never leaves the app).
  useEffect(() => {
    setQr(null)
    if (!share) return
    let cancelled = false
    import('qrcode').then((QR) => QR.toDataURL(linkFor(share.code), { width: 220, margin: 1 }))
      .then((url) => { if (!cancelled) setQr(url) }).catch(() => {})
    return () => { cancelled = true }
  }, [share])

  async function createUser() {
    if (!add) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(add) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setAdd(null); await load(); if (data.login_code) setShare({ name: add.full_name, code: data.login_code }); else setMsg('User added.') }
      else setError(data.error ?? 'Could not add user.')
    } finally { setBusy(false) }
  }

  async function saveEdit() {
    if (!edit) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const payload: Record<string, unknown> = { full_name: edit.full_name, phone: edit.phone, role: edit.role, status: edit.status }
      if (edit.password) payload.password = edit.password
      if (edit.regenerate) payload.regenerate_code = true
      const res = await fetch(`/api/ngo/users/${edit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { const name = edit.full_name; setEdit(null); await load(); if (data.login_code) setShare({ name, code: data.login_code }); else setMsg('User updated.') }
      else setError(data.error ?? 'Could not update user.')
    } finally { setBusy(false) }
  }

  async function toggleStatus(u: User) {
    const next = u.status === 'active' ? 'suspended' : 'active'
    setMsg(null); setError(null)
    const res = await fetch(`/api/ngo/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setMsg(next === 'suspended' ? 'User suspended.' : 'User reactivated.'); await load() }
    else setError(data.error ?? 'Could not change status.')
  }

  async function signOutDevices(u: User) {
    if (!window.confirm(`Sign ${u.full_name || u.email} out of all devices now? Any phone or browser they’re logged in on stops working immediately. Use this for a lost or seized device.`)) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch(`/api/ngo/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revoke_sessions: true }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMsg('Signed out of all devices.')
      else setError(data.error ?? 'Could not sign the user out.')
    } catch { setError('Could not sign the user out.') }
    finally { setBusy(false) }
  }

  async function resetCode(u: User) {
    if (!window.confirm(`Reset ${u.full_name || u.email}’s access code? Their current code and QR stop working immediately — you’ll need to share the new one.`)) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch(`/api/ngo/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regenerate_code: true }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.login_code) { await load(); setShare({ name: u.full_name ?? 'Worker', code: data.login_code }) }
      else setError(data.error ?? 'Could not reset access code.')
    } finally { setBusy(false) }
  }

  async function removeUser(u: User) {
    if (!window.confirm(`Remove ${u.full_name || u.email}? This deletes their login and their personal check-in/panic history. This cannot be undone.`)) return
    setMsg(null); setError(null)
    const res = await fetch(`/api/ngo/users/${u.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setMsg('User removed.'); await load() }
    else setError(data.error ?? 'Could not remove user.')
  }

  function copy(text: string) { navigator.clipboard?.writeText(text).then(() => setMsg('Copied.')).catch(() => {}) }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Users</h1>
          <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>People who can sign in to your organisation.</div>
        </div>
        <button type="button" onClick={() => setAdd({ full_name: '', email: '', phone: '', role: 'team_leader', password: '' })} style={primaryBtn}>+ Add user</button>
      </div>

      {msg && <div style={okBox}>{msg}</div>}
      {error && <div style={errorBox}>{error} <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}
      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {!loading && users.length === 0 && !error && <div style={{ color: '#484f58', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>No users yet — add one.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map((u) => (
          <div key={u.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {u.full_name || '—'}{u.id === me && <span style={{ fontSize: 11, color: '#58a6ff', marginLeft: 8 }}>you</span>}
                  {u.status === 'suspended' && <span style={{ fontSize: 11, color: '#f85149', marginLeft: 8 }}>suspended</span>}
                </div>
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                  {ROLE_LABEL[u.role] ?? u.role} · {u.email}{u.phone ? ` · ${u.phone}` : ''}
                </div>
                {u.role === 'field_coordinator' && (
                  <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>
                    Access code: {u.login_code
                      ? <><code style={codeChip}>{u.login_code}</code> <button type="button" onClick={() => setShare({ name: u.full_name ?? 'Worker', code: u.login_code! })} style={linkBtn}>Show QR / link</button> <button type="button" onClick={() => resetCode(u)} disabled={busy} style={linkBtn}>Reset code</button></>
                      : <><span style={{ color: '#d29922' }}>none</span> <button type="button" onClick={() => resetCode(u)} disabled={busy} style={linkBtn}>Generate code</button></>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={() => setEdit({ id: u.id, full_name: u.full_name ?? '', phone: u.phone ?? '', role: u.role, status: u.status, password: '', regenerate: false })} style={miniBtn}>Edit</button>
                <button type="button" onClick={() => toggleStatus(u)} style={miniBtn}>{u.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
                <button type="button" onClick={() => signOutDevices(u)} style={miniBtn}>Sign out devices</button>
                <button type="button" onClick={() => removeUser(u)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {add && (
        <Modal title="Add user" onClose={() => setAdd(null)}>
          <L label="Full name"><input style={field} value={add.full_name} onChange={(e) => setAdd({ ...add, full_name: e.target.value })} /></L>
          <L label="Email"><input style={field} type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></L>
          <L label="Phone (optional)"><input style={field} value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} /></L>
          <L label="Role">
            <select style={field} value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </L>
          {add.role === 'field_coordinator'
            ? <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>A unique access code is generated automatically — you’ll get a code + QR to share after adding.</div>
            : <L label="Password (min 8 chars)"><input style={field} type="password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} /></L>}
          <button type="button" onClick={createUser} disabled={busy} style={{ ...primaryBtn, marginTop: 4, opacity: busy ? 0.6 : 1 }}>{busy ? 'Adding…' : 'Add user'}</button>
        </Modal>
      )}

      {edit && (
        <Modal title="Edit user" onClose={() => setEdit(null)}>
          <L label="Full name"><input style={field} value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></L>
          <L label="Phone"><input style={field} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></L>
          <L label="Role">
            <select style={field} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </L>
          <L label="Status">
            <select style={field} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </L>
          {edit.role === 'field_coordinator'
            ? <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e6edf3', marginBottom: 10 }}>
                <input type="checkbox" checked={edit.regenerate} onChange={(e) => setEdit({ ...edit, regenerate: e.target.checked })} />
                Regenerate access code (old code stops working)
              </label>
            : <L label="Reset password (optional, min 8 chars)"><input style={field} type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></L>}
          <button type="button" onClick={saveEdit} disabled={busy} style={{ ...primaryBtn, marginTop: 4, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
        </Modal>
      )}

      {share && (
        <Modal title={`Access code — ${share.name}`} onClose={() => setShare(null)}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>Share this with the field worker. They type the code, or scan the QR to sign in.</div>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <code style={{ ...codeChip, fontSize: 22, padding: '8px 14px', letterSpacing: '0.15em' }}>{share.code}</code>
          </div>
          {qr
            ? <div style={{ textAlign: 'center', marginBottom: 12 }}><img src={qr} alt="login QR" width={200} height={200} style={{ borderRadius: 8 }} /></div>
            : <div style={{ textAlign: 'center', color: '#8b949e', fontSize: 12, marginBottom: 12 }}>Generating QR…</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => copy(share.code)} style={{ ...miniBtn, flex: 1 }}>Copy code</button>
            <button type="button" onClick={() => copy(linkFor(share.code))} style={{ ...miniBtn, flex: 1 }}>Copy login link</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={labelStyle}>{label}</label>{children}</div>
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={modal}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 760, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14 }
const field: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const primaryBtn: React.CSSProperties = { height: 38, padding: '0 16px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const miniBtn: React.CSSProperties = { height: 30, padding: '0 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'system-ui' }
const codeChip: React.CSSProperties = { background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '2px 8px', color: '#e6edf3', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }
const modal: React.CSSProperties = { width: 360, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const okBox: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'none', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 4, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }
