'use client'

import { useState } from 'react'

const ORG_TYPES = [
  { value: 'ingo', label: 'International NGO' },
  { value: 'lngo', label: 'Local NGO' },
  { value: 'un_agency', label: 'UN agency' },
  { value: 'crescent_cross', label: 'Red Cross / Red Crescent' },
  { value: 'community', label: 'Community group' },
  { value: 'other', label: 'Other' },
]

const field: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box',
  background: '#0d1117', border: '1px solid #21262d', borderRadius: 6,
  color: '#e6edf3', fontSize: 14, fontFamily: 'system-ui', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }

export default function NgoSignupPage() {
  const [form, setForm] = useState({
    org_name: '', org_type: 'ingo', country: '', operational_area: '',
    full_name: '', email: '', phone: '', password: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    setError(null)
    if (!form.org_name || !form.full_name || !form.email || !form.password) {
      setError('Please fill in the required fields.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/ngo/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) setDone(true)
      else setError(data.error ?? 'Sign-up failed.')
    } catch {
      setError('Sign-up failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#d29922', margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>Pending approval</h1>
          <p style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.6, margin: 0 }}>
            Your organisation is pending approval. NOUR staff will review it and notify your admin email.
            Once approved, you can sign in.
          </p>
          <a href="/ngo/login" style={linkBtn}>Go to sign in</a>
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={{ ...card, textAlign: 'left' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>NOUR <span style={{ color: '#3fb950' }}>for NGOs</span></div>
          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>Register your organisation</div>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle}>Organisation name *</label>
            <input style={field} value={form.org_name} onChange={set('org_name')} />
          </div>
          <div>
            <label style={labelStyle}>Type *</label>
            <select style={{ ...field, padding: '0 8px' }} value={form.org_type} onChange={set('org_type')}>
              {ORG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Country</label>
            <input style={field} value={form.country} onChange={set('country')} placeholder="Lebanon" />
          </div>
          <div>
            <label style={labelStyle}>Operational area</label>
            <textarea
              style={{ ...field, height: 64, padding: 10, resize: 'vertical' }}
              value={form.operational_area}
              onChange={set('operational_area')}
              placeholder="e.g. South Lebanon — Tyre & Nabatieh districts (map editor coming soon)"
            />
          </div>
          <div style={{ height: 1, background: '#21262d', margin: '2px 0' }} />
          <div>
            <label style={labelStyle}>Your full name *</label>
            <input style={field} value={form.full_name} onChange={set('full_name')} />
          </div>
          <div>
            <label style={labelStyle}>Admin email *</label>
            <input style={field} type="email" value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={field} value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label style={labelStyle}>Password * (min 8 chars)</label>
            <input style={field} type="password" value={form.password} onChange={set('password')} />
          </div>
        </div>

        <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, marginTop: 18 }}>
          {busy ? 'Submitting…' : 'Register organisation'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: '#8b949e' }}>
          Already approved? <a href="/ngo/login" style={{ color: '#58a6ff', textDecoration: 'none' }}>Sign in</a>
        </div>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }
const card: React.CSSProperties = { width: '100%', maxWidth: 440, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 28, textAlign: 'center' }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const primaryBtn: React.CSSProperties = { width: '100%', height: 42, background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const linkBtn: React.CSSProperties = { display: 'inline-block', marginTop: 18, color: '#58a6ff', textDecoration: 'none', fontSize: 14 }
