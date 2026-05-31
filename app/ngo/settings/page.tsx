'use client'

import { useEffect, useState, useCallback } from 'react'

const ORG_TYPES = [
  { value: 'ingo', label: 'International NGO' },
  { value: 'lngo', label: 'Local NGO' },
  { value: 'un_agency', label: 'UN agency' },
  { value: 'crescent_cross', label: 'Red Cross / Red Crescent' },
  { value: 'community', label: 'Community group' },
  { value: 'other', label: 'Other' },
]

interface Org {
  name: string; type: string; country: string | null; status: string
  checkin_window_minutes: number; share_team_presence: boolean; share_operational_area: boolean
  has_operational_area: boolean
  panic_ack_visible_default: boolean; panic_escalation_minutes: number
}

export default function NgoSettingsPage() {
  const [role, setRole] = useState<string | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const canEdit = role === 'org_admin'

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [cr, or] = await Promise.all([fetch('/api/ngo/auth/check'), fetch('/api/ngo/org')])
      if (cr.ok) setRole((await cr.json()).role ?? null)
      if (!or.ok) { setError('Could not load settings.'); return }
      setOrg((await or.json()).org)
    } catch { setError('Could not load settings.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  function set<K extends keyof Org>(k: K, v: Org[K]) { setOrg((o) => (o ? { ...o, [k]: v } : o)) }

  async function save() {
    if (!org) return
    setSaving(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/org', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: org.name, type: org.type, country: org.country,
          checkin_window_minutes: org.checkin_window_minutes,
          panic_ack_visible_default: org.panic_ack_visible_default,
          panic_escalation_minutes: org.panic_escalation_minutes,
          share_team_presence: org.share_team_presence,
          share_operational_area: org.share_operational_area,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMsg('Settings saved.')
      else setError(data.error ?? 'Could not save.')
    } catch { setError('Could not save. Please try again.') }
    finally { setSaving(false) }
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Organisation settings</h1>
      <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2, marginBottom: 20 }}>
        {canEdit ? 'Manage your organisation profile and preferences.' : 'View only — settings are managed by an org admin.'}
      </div>

      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {error && !loading && (
        <div style={errorBox}>{error} <button type="button" onClick={load} style={retryBtn}>Retry</button></div>
      )}
      {msg && <div style={okBox}>{msg}</div>}

      {org && !loading && (
        <div style={{ display: 'grid', gap: 16, maxWidth: 460 }}>
          <Field label="Organisation name">
            <input style={field} value={org.name} disabled={!canEdit} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Type">
            <select style={field} value={org.type} disabled={!canEdit} onChange={(e) => set('type', e.target.value)}>
              {ORG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Country">
            <input style={field} value={org.country ?? ''} disabled={!canEdit} onChange={(e) => set('country', e.target.value)} />
          </Field>
          <Field label="Check-in window (minutes)" hint="Field staff are escalated if they miss this proof-of-life window.">
            <input style={field} type="number" min={15} max={10080} value={org.checkin_window_minutes} disabled={!canEdit} onChange={(e) => set('checkin_window_minutes', Number(e.target.value))} />
          </Field>

          <div style={{ height: 1, background: '#21262d' }} />
          <div style={{ fontSize: 12, color: '#8b949e' }}>Panic / duress</div>
          <Field label="Escalation window (minutes)" hint="If no responder acknowledges a panic within this time, it re-alerts up the chain (and again at 2× the window).">
            <input style={field} type="number" min={1} max={1440} value={org.panic_escalation_minutes} disabled={!canEdit} onChange={(e) => set('panic_escalation_minutes', Number(e.target.value))} />
          </Field>
          <Toggle label="Show field staff when a panic is acknowledged" checked={org.panic_ack_visible_default} disabled={!canEdit} onChange={(v) => set('panic_ack_visible_default', v)} />
          <div style={{ fontSize: 11, color: '#484f58', marginTop: -8 }}>Silent-mode alerts always suppress this, regardless of the setting.</div>

          <div style={{ height: 1, background: '#21262d' }} />
          <div style={{ fontSize: 12, color: '#8b949e' }}>Data sharing (off by default — team locations are sensitive)</div>
          <Toggle label="Share team presence with other orgs" checked={org.share_team_presence} disabled={!canEdit} onChange={(v) => set('share_team_presence', v)} />
          <Toggle label="Share operational area with other orgs" checked={org.share_operational_area} disabled={!canEdit} onChange={(v) => set('share_operational_area', v)} />

          <div style={{ height: 1, background: '#21262d' }} />
          <div style={{ fontSize: 13 }}>
            Operational area: {org.has_operational_area ? <span style={{ color: '#3fb950' }}>defined</span> : <span style={{ color: '#8b949e' }}>not set</span>}
            {' · '}<a href="/ngo/setup" style={{ color: '#58a6ff', textDecoration: 'none' }}>Edit on map →</a>
          </div>

          {canEdit && (
            <button type="button" onClick={save} disabled={saving || !org.name.trim()} style={{ ...primaryBtn, opacity: saving || !org.name.trim() ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#484f58', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#e6edf3', cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 720, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const field: React.CSSProperties = { width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 14, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const primaryBtn: React.CSSProperties = { height: 42, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', justifySelf: 'start' }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const okBox: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'none', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 4, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }
