'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Public invite-accept page. Reads ?token=, lets the invitee set their name + credential
// once. The token is single-use + expiring (enforced server-side); on success they go to
// login. Field coordinators choose a 6-digit PIN; leaders/admins a password — but the
// page doesn't know the role until submit, so it offers both and the server validates.

function InviteInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [fullName, setFullName] = useState('')
  const [mode, setMode] = useState<'password' | 'pin'>('password')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => { if (!token) setError('This invite link is missing its token. Ask for a new one.') }, [token])

  const submit = async () => {
    setError(null)
    if (!fullName.trim()) { setError('Enter your name.'); return }
    setBusy(true)
    try {
      const payload: Record<string, string> = { token, full_name: fullName.trim() }
      if (mode === 'pin') payload.pin = pin.trim(); else payload.password = password
      const res = await fetch('/api/ngo/auth/invite/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setDone(true); setTimeout(() => router.push('/ngo/login'), 1500) }
      else setError(data.error ?? 'Could not set up your account.')
    } catch { setError('Could not set up your account. Please try again.') }
    finally { setBusy(false) }
  }

  if (done) return (
    <div style={card}>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#3fb950' }}>✓ You’re all set</div>
      <div style={{ fontSize: 13, color: '#8b949e', marginTop: 8 }}>Taking you to sign in…</div>
    </div>
  )

  return (
    <div style={card}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>NOUR <span style={{ color: '#3fb950' }}>for NGOs</span></div>
        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>Set up your account</div>
      </div>
      {error && <div style={errorBox}>{error}</div>}
      <div style={{ display: 'grid', gap: 14, textAlign: 'left' }}>
        <div>
          <label style={labelStyle}>Your name</label>
          <input style={field} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setMode('password')} style={toggle(mode === 'password')}>Password</button>
          <button type="button" onClick={() => setMode('pin')} style={toggle(mode === 'pin')}>6-digit PIN</button>
        </div>
        {mode === 'password' ? (
          <div>
            <label style={labelStyle}>Choose a password (min 8 characters)</label>
            <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        ) : (
          <div>
            <label style={labelStyle}>Choose a 6-digit PIN</label>
            <input style={{ ...field, letterSpacing: '0.3em', fontSize: 18 }} inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>Field staff use a PIN to sign in quickly.</div>
          </div>
        )}
      </div>
      <button type="button" onClick={submit} disabled={busy || !token} style={{ ...primaryBtn, opacity: busy || !token ? 0.6 : 1, marginTop: 18 }}>
        {busy ? 'Setting up…' : 'Join'}
      </button>
    </div>
  )
}

export default function NgoInvitePage() {
  return (
    <div style={wrap}>
      <Suspense fallback={<div style={{ color: '#8b949e' }}>Loading…</div>}>
        <InviteInner />
      </Suspense>
    </div>
  )
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }
const card: React.CSSProperties = { width: '100%', maxWidth: 380, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 28, textAlign: 'center' }
const field: React.CSSProperties = { width: '100%', height: 44, padding: '0 12px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 16, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14, textAlign: 'left' }
const primaryBtn: React.CSSProperties = { width: '100%', height: 44, background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
function toggle(active: boolean): React.CSSProperties {
  return { flex: 1, minHeight: 40, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(88,166,255,0.15)' : '#0d1117', border: active ? '1px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }
}
