'use client'

import { useState, useEffect, useCallback } from 'react'
import { useConfirm } from '@/lib/ngo-ui'

// Facilities & contacts — "where do we take people" and "who do we call".
// Glanceable + tappable under stress. Managers (org_admin/team_leader) get full CRUD
// and one-tap status; field_coordinator views + taps-to-call only (API-enforced).

interface Facility {
  id: string; name: string; type: string; lat: number | null; lon: number | null
  status: 'open' | 'closed' | 'full' | 'unknown'
  capacity_note: string | null; phone: string | null; address: string | null; notes: string | null
  source: 'user' | 'seed'; status_updated_at: string | null
}
interface Contact { id: string; name: string; organisation: string | null; role: string | null; phone: string | null; notes: string | null }

type FacEdit = { id?: string; name: string; type: string; status: string; lat: string; lon: string; capacity_note: string; phone: string; address: string; notes: string }
type ConEdit = { id?: string; name: string; organisation: string; role: string; phone: string; notes: string }

const FAC_TYPES = [
  { value: 'hospital', label: 'Hospital' }, { value: 'clinic', label: 'Clinic' },
  { value: 'field_hospital', label: 'Field hospital' }, { value: 'shelter', label: 'Shelter' },
  { value: 'distribution', label: 'Distribution' }, { value: 'safe_area', label: 'Safe area' },
  { value: 'fuel', label: 'Fuel' }, { value: 'water', label: 'Water' }, { value: 'other', label: 'Other' },
]
const STATUSES = [
  { value: 'open', label: 'Open', colour: '#3fb950' },
  { value: 'full', label: 'Full', colour: '#d29922' },
  { value: 'closed', label: 'Closed', colour: '#f85149' },
  { value: 'unknown', label: 'Unknown', colour: '#8b949e' },
]
function typeLabel(t: string) { return FAC_TYPES.find((x) => x.value === t)?.label ?? 'Other' }
function statusMeta(s: string) { return STATUSES.find((x) => x.value === s) ?? STATUSES[3] }
function telHref(phone: string) { const d = phone.replace(/[^\d+]/g, ''); return `tel:${d}` }

// Staleness of a status update: fresh < 2h, ageing < 4h, stale ≥ 4h, or never set.
function staleness(iso: string | null): { label: string; tier: 'never' | 'fresh' | 'ageing' | 'stale' } {
  if (!iso) return { label: 'status not set', tier: 'never' }
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(ms / 60000))
  let label: string
  if (mins < 1) label = 'just now'
  else if (mins < 60) label = `${mins}m ago`
  else if (mins < 1440) label = `${Math.round(mins / 60)}h ago`
  else label = `${Math.round(mins / 1440)}d ago`
  const tier = mins < 120 ? 'fresh' : mins < 240 ? 'ageing' : 'stale'
  return { label: `updated ${label}`, tier }
}

export default function NgoFacilitiesPage() {
  const confirm = useConfirm()
  const [tab, setTab] = useState<'facilities' | 'contacts'>('facilities')
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [facEdit, setFacEdit] = useState<FacEdit | null>(null)
  const [conEdit, setConEdit] = useState<ConEdit | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Role first (so manage controls show even if a list fails to load).
  useEffect(() => {
    fetch('/api/ngo/auth/check', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.role === 'org_admin' || d?.role === 'team_leader') setCanManage(true) })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setError(false)
    try {
      const [fr, cr] = await Promise.all([
        fetch('/api/ngo/facilities', { cache: 'no-store' }),
        fetch('/api/ngo/contacts', { cache: 'no-store' }),
      ])
      if (fr.ok) { const d = await fr.json(); setFacilities(d.facilities ?? []); setCanManage((m) => m || !!d.can_manage) }
      else setError(true)
      if (cr.ok) { const d = await cr.json(); setContacts(d.contacts ?? []) }
      else setError(true)
    } catch { setError(true) }
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  // ── Facility CRUD ──
  const openNewFac = () => { setFormErr(null); setFacEdit({ name: '', type: 'hospital', status: 'unknown', lat: '', lon: '', capacity_note: '', phone: '', address: '', notes: '' }) }
  const openEditFac = (f: Facility) => {
    setFormErr(null)
    setFacEdit({ id: f.id, name: f.name, type: f.type, status: f.status, lat: f.lat?.toString() ?? '', lon: f.lon?.toString() ?? '', capacity_note: f.capacity_note ?? '', phone: f.phone ?? '', address: f.address ?? '', notes: f.notes ?? '' })
  }
  const saveFac = useCallback(async () => {
    if (!facEdit) return
    setFormErr(null)
    if (!facEdit.name.trim()) { setFormErr('A name is required.'); return }
    setBusy(true)
    try {
      const payload = {
        name: facEdit.name.trim(), type: facEdit.type, status: facEdit.status,
        lat: facEdit.lat.trim() || null, lon: facEdit.lon.trim() || null,
        capacity_note: facEdit.capacity_note.trim() || null, phone: facEdit.phone.trim() || null,
        address: facEdit.address.trim() || null, notes: facEdit.notes.trim() || null,
      }
      const r = facEdit.id
        ? await fetch(`/api/ngo/facilities/${facEdit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/ngo/facilities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setFormErr(d?.error ?? 'Could not save.'); return }
      setFacEdit(null); setNote(facEdit.id ? 'Facility updated.' : 'Facility added.'); await load()
    } catch { setFormErr('Could not save — check your connection.') }
    finally { setBusy(false) }
  }, [facEdit, load])
  const delFac = useCallback(async (f: Facility) => {
    if (!(await confirm({ title: `Delete “${f.name}”?`, body: 'This removes it for your whole organisation.', danger: true, confirmLabel: 'Delete' }))) return
    setBusy(true); setNote(null)
    try {
      const r = await fetch(`/api/ngo/facilities/${f.id}`, { method: 'DELETE' })
      if (r.ok) { setFacilities((p) => p.filter((x) => x.id !== f.id)); setNote('Facility deleted.') } else setNote('Delete failed.')
    } catch { setNote('Delete failed.') } finally { setBusy(false) }
  }, [])
  // One-tap status change — optimistic; stamps a fresh "updated just now".
  const setStatus = useCallback(async (f: Facility, status: Facility['status']) => {
    if (f.status === status) return
    const prev = facilities
    setFacilities((p) => p.map((x) => x.id === f.id ? { ...x, status, status_updated_at: new Date().toISOString() } : x))
    try {
      const r = await fetch(`/api/ngo/facilities/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      if (!r.ok) { setFacilities(prev); setNote('Could not update status.') }
    } catch { setFacilities(prev); setNote('Could not update status — offline?') }
  }, [facilities])

  // ── Contact CRUD ──
  const openNewCon = () => { setFormErr(null); setConEdit({ name: '', organisation: '', role: '', phone: '', notes: '' }) }
  const openEditCon = (c: Contact) => { setFormErr(null); setConEdit({ id: c.id, name: c.name, organisation: c.organisation ?? '', role: c.role ?? '', phone: c.phone ?? '', notes: c.notes ?? '' }) }
  const saveCon = useCallback(async () => {
    if (!conEdit) return
    setFormErr(null)
    if (!conEdit.name.trim()) { setFormErr('A name is required.'); return }
    setBusy(true)
    try {
      const payload = { name: conEdit.name.trim(), organisation: conEdit.organisation.trim() || null, role: conEdit.role.trim() || null, phone: conEdit.phone.trim() || null, notes: conEdit.notes.trim() || null }
      const r = conEdit.id
        ? await fetch(`/api/ngo/contacts/${conEdit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/ngo/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setFormErr(d?.error ?? 'Could not save.'); return }
      setConEdit(null); setNote(conEdit.id ? 'Contact updated.' : 'Contact added.'); await load()
    } catch { setFormErr('Could not save — check your connection.') }
    finally { setBusy(false) }
  }, [conEdit, load])
  const delCon = useCallback(async (c: Contact) => {
    if (!(await confirm({ title: `Delete “${c.name}”?`, danger: true, confirmLabel: 'Delete' }))) return
    setBusy(true); setNote(null)
    try {
      const r = await fetch(`/api/ngo/contacts/${c.id}`, { method: 'DELETE' })
      if (r.ok) { setContacts((p) => p.filter((x) => x.id !== c.id)); setNote('Contact deleted.') } else setNote('Delete failed.')
    } catch { setNote('Delete failed.') } finally { setBusy(false) }
  }, [])

  const shownFacilities = facilities.filter((f) => (typeFilter === 'all' || f.type === typeFilter) && (statusFilter === 'all' || f.status === statusFilter))

  return (
    <div className="fac-page" style={wrap}>
      <style>{`
        @media (max-width: 600px) {
          .fac-page .fac-add { width: 100%; }
          .fac-page .fac-actions > a, .fac-page .fac-actions > button { flex: 1 1 40%; margin-inline-start: 0 !important; }
        }
      `}</style>
      <h1 style={h1}>Facilities & contacts</h1>
      <p style={sub}>Where to take people, and who to call.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setTab('facilities')} style={tabBtn(tab === 'facilities')}>Facilities{facilities.length ? ` (${facilities.length})` : ''}</button>
        <button type="button" onClick={() => setTab('contacts')} style={tabBtn(tab === 'contacts')}>Contacts{contacts.length ? ` (${contacts.length})` : ''}</button>
      </div>

      {note && <div style={infoBox}>{note}</div>}
      {error && <div style={errBox}>Couldn’t load everything. This feature may not be set up yet (the facilities/contacts tables may be missing). <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}
      {!loaded && <div style={muted}>Loading…</div>}

      {/* ───── FACILITIES ───── */}
      {tab === 'facilities' && (
        <>
          {/* Jump to the situation board with the facilities layer switched on. */}
          <a href="/ngo/board?layer=facilities" className="fac-add" style={{ ...mapLinkBtn, marginBottom: 10 }}>🗺 Show on map</a>
          {canManage && <button type="button" onClick={openNewFac} className="fac-add" style={{ ...primaryBtn, marginBottom: 14 }}>+ Add facility</button>}

          {/* Filters */}
          {facilities.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <div style={chipRow}>
                <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All types</Chip>
                {FAC_TYPES.filter((t) => facilities.some((f) => f.type === t.value)).map((t) => (
                  <Chip key={t.value} active={typeFilter === t.value} onClick={() => setTypeFilter(t.value)}>{t.label}</Chip>
                ))}
              </div>
              <div style={chipRow}>
                <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All status</Chip>
                {STATUSES.map((s) => (
                  <Chip key={s.value} active={statusFilter === s.value} onClick={() => setStatusFilter(s.value)} dot={s.colour}>{s.label}</Chip>
                ))}
              </div>
            </div>
          )}

          {loaded && !error && facilities.length === 0 && <div style={emptyBox}>No facilities yet — add one to start.</div>}
          {loaded && facilities.length > 0 && shownFacilities.length === 0 && <div style={emptyBox}>No facilities match these filters.</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shownFacilities.map((f) => {
              const sm = statusMeta(f.status); const st = staleness(f.status_updated_at)
              return (
                <div key={f.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3' }}>{f.name}</div>
                      <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{typeLabel(f.type)}{f.address ? ` · ${f.address}` : ''}</div>
                      {f.capacity_note && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{f.capacity_note}</div>}
                      {f.source === 'seed' && f.notes?.includes('approx') && <div style={{ fontSize: 11, color: '#d29922', marginTop: 3 }}>📍 approx location — verify</div>}
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <span style={{ ...statusBadge, background: sm.colour + '22', color: sm.colour, borderColor: sm.colour + '66' }}>{sm.label}</span>
                      <div style={{ fontSize: 10.5, marginTop: 4, color: st.tier === 'stale' || st.tier === 'never' ? '#f85149' : st.tier === 'ageing' ? '#d29922' : '#6e7681' }}>{st.label}</div>
                    </div>
                  </div>

                  {/* One-tap status (managers) */}
                  {canManage && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {STATUSES.map((s) => (
                        <button key={s.value} type="button" onClick={() => setStatus(f, s.value as Facility['status'])}
                          style={{ flex: 1, minHeight: 36, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui',
                            background: f.status === s.value ? s.colour + '22' : 'transparent',
                            border: `1px solid ${f.status === s.value ? s.colour + '88' : '#21262d'}`,
                            color: f.status === s.value ? s.colour : '#8b949e' }}>{s.label}</button>
                      ))}
                    </div>
                  )}

                  <div className="fac-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                    {f.phone && <a href={telHref(f.phone)} style={callBtn}>📞 {f.phone}</a>}
                    {f.lat != null && f.lon != null && <a href={`https://www.google.com/maps?q=${f.lat},${f.lon}`} target="_blank" rel="noreferrer noopener" style={miniBtn}>Map ↗</a>}
                    {canManage && <button type="button" disabled={busy} onClick={() => openEditFac(f)} style={{ ...miniBtn, marginInlineStart: 'auto' }}>Edit</button>}
                    {canManage && <button type="button" disabled={busy} onClick={() => delFac(f)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>Delete</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ───── CONTACTS ───── */}
      {tab === 'contacts' && (
        <>
          {canManage && <button type="button" onClick={openNewCon} className="fac-add" style={{ ...primaryBtn, marginBottom: 14 }}>+ Add contact</button>}
          {loaded && !error && contacts.length === 0 && <div style={emptyBox}>No contacts yet — add one.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {contacts.map((c) => (
              <div key={c.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{[c.role, c.organisation].filter(Boolean).join(' · ') || '—'}</div>
                    {c.notes && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{c.notes}</div>}
                  </div>
                </div>
                <div className="fac-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                  {c.phone && <a href={telHref(c.phone)} style={callBtn}>📞 {c.phone}</a>}
                  {canManage && <button type="button" disabled={busy} onClick={() => openEditCon(c)} style={{ ...miniBtn, marginInlineStart: 'auto' }}>Edit</button>}
                  {canManage && <button type="button" disabled={busy} onClick={() => delCon(c)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Facility modal */}
      {facEdit && (
        <div onClick={() => setFacEdit(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={modalTitle}>{facEdit.id ? 'Edit facility' : 'Add facility'}</div>
            <label style={lbl}>Name</label>
            <input style={input} value={facEdit.name} onChange={(e) => setFacEdit({ ...facEdit, name: e.target.value })} placeholder="e.g. Hammoud Hospital" />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...lbl, marginTop: 12 }}>Type</label>
                <select style={input} value={facEdit.type} onChange={(e) => setFacEdit({ ...facEdit, type: e.target.value })}>{FAC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...lbl, marginTop: 12 }}>Status</label>
                <select style={input} value={facEdit.status} onChange={(e) => setFacEdit({ ...facEdit, status: e.target.value })}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              </div>
            </div>
            <label style={{ ...lbl, marginTop: 12 }}>Phone</label>
            <input style={input} value={facEdit.phone} onChange={(e) => setFacEdit({ ...facEdit, phone: e.target.value })} placeholder="07/000000" inputMode="tel" />
            <label style={{ ...lbl, marginTop: 12 }}>Address</label>
            <input style={input} value={facEdit.address} onChange={(e) => setFacEdit({ ...facEdit, address: e.target.value })} placeholder="Town, street" />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><label style={{ ...lbl, marginTop: 12 }}>Latitude</label><input style={input} value={facEdit.lat} onChange={(e) => setFacEdit({ ...facEdit, lat: e.target.value })} placeholder="33.27" inputMode="decimal" /></div>
              <div style={{ flex: 1 }}><label style={{ ...lbl, marginTop: 12 }}>Longitude</label><input style={input} value={facEdit.lon} onChange={(e) => setFacEdit({ ...facEdit, lon: e.target.value })} placeholder="35.20" inputMode="decimal" /></div>
            </div>
            <label style={{ ...lbl, marginTop: 12 }}>Capacity note</label>
            <input style={input} value={facEdit.capacity_note} onChange={(e) => setFacEdit({ ...facEdit, capacity_note: e.target.value })} placeholder="e.g. ER full, trauma only" />
            <label style={{ ...lbl, marginTop: 12 }}>Notes</label>
            <input style={input} value={facEdit.notes} onChange={(e) => setFacEdit({ ...facEdit, notes: e.target.value })} placeholder="Anything useful" />
            {formErr && <div style={{ ...errBox, marginTop: 12, marginBottom: 0 }}>{formErr}</div>}
            <div style={modalActions}>
              <button type="button" onClick={() => setFacEdit(null)} style={{ ...ghostBtn, flex: 1 }}>Cancel</button>
              <button type="button" onClick={saveFac} disabled={busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Contact modal */}
      {conEdit && (
        <div onClick={() => setConEdit(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={modalTitle}>{conEdit.id ? 'Edit contact' : 'Add contact'}</div>
            <label style={lbl}>Name</label>
            <input style={input} value={conEdit.name} onChange={(e) => setConEdit({ ...conEdit, name: e.target.value })} placeholder="e.g. Dr. Sami" />
            <label style={{ ...lbl, marginTop: 12 }}>Organisation</label>
            <input style={input} value={conEdit.organisation} onChange={(e) => setConEdit({ ...conEdit, organisation: e.target.value })} placeholder="e.g. Lebanese Red Cross" />
            <label style={{ ...lbl, marginTop: 12 }}>Role</label>
            <input style={input} value={conEdit.role} onChange={(e) => setConEdit({ ...conEdit, role: e.target.value })} placeholder="e.g. Dispatch coordinator" />
            <label style={{ ...lbl, marginTop: 12 }}>Phone</label>
            <input style={input} value={conEdit.phone} onChange={(e) => setConEdit({ ...conEdit, phone: e.target.value })} placeholder="03/000000" inputMode="tel" />
            <label style={{ ...lbl, marginTop: 12 }}>Notes</label>
            <input style={input} value={conEdit.notes} onChange={(e) => setConEdit({ ...conEdit, notes: e.target.value })} placeholder="When to call, etc." />
            {formErr && <div style={{ ...errBox, marginTop: 12, marginBottom: 0 }}>{formErr}</div>}
            <div style={modalActions}>
              <button type="button" onClick={() => setConEdit(null)} style={{ ...ghostBtn, flex: 1 }}>Cancel</button>
              <button type="button" onClick={saveCon} disabled={busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, children, dot }: { active: boolean; onClick: () => void; children: React.ReactNode; dot?: string }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', whiteSpace: 'nowrap', background: active ? 'rgba(88,166,255,0.15)' : '#161b22', border: active ? '1px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: 999, background: dot }} />}{children}
    </button>
  )
}

// ── styles (design system; mobile-first) ──
const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }
const h1: React.CSSProperties = { fontSize: 20, fontWeight: 600, margin: '0 0 4px', color: '#e6edf3' }
const sub: React.CSSProperties = { fontSize: 13, color: '#8b949e', margin: '0 0 16px' }
const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 14 }
const chipRow: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' }
const statusBadge: React.CSSProperties = { display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: '1px solid' }
const callBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: '0 14px', background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.45)', color: '#3fb950', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }
const miniBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: '0 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#c9d1d9', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', textDecoration: 'none' }
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const mapLinkBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 18px', background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.45)', color: '#58a6ff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', textDecoration: 'none' }
const ghostBtn: React.CSSProperties = { minHeight: 44, padding: '0 14px', background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui' }
const muted: React.CSSProperties = { fontSize: 13, color: '#8b949e' }
const emptyBox: React.CSSProperties = { fontSize: 13, color: '#484f58', padding: '24px 0', textAlign: 'center' }
const infoBox: React.CSSProperties = { background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const errBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'transparent', border: '1px solid #f85149', color: '#f85149', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }
const modal: React.CSSProperties = { width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }
const modalTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#e6edf3' }
const modalActions: React.CSSProperties = { display: 'flex', gap: 8, marginTop: 16 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6 }
const input: React.CSSProperties = { width: '100%', height: 44, boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 16, padding: '0 12px', fontFamily: 'system-ui', outline: 'none' }
function tabBtn(active: boolean): React.CSSProperties {
  return { flex: 1, minHeight: 42, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? '#161b22' : 'transparent', border: active ? '1px solid #30363d' : '1px solid #21262d', color: active ? '#e6edf3' : '#8b949e' }
}
