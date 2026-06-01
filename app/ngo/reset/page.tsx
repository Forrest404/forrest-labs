'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Public reset page. No ?token → "request a link" form (always shows the same generic
// confirmation; never reveals whether the email exists). With ?token → "set a new
// password/PIN" form (single-use, expiring — enforced server-side).

function ResetInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [mode, setMode] = useState<'password' | 'pin'>('password')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [done, setDone] = useState(false)

  const requestLink = async () => {
    setError(null); setBusy(true)
    try {
      await fetch('/api/ngo/auth/reset/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
      })
      setSent(true) // always generic — we don't know (or reveal) if the account exists
    } catch { setError('Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }

  const confirm = async () => {
    setError(null); setBusy(true)
    try {
      const payload: Record<string, string> = { token }
      if (mode === 'pin') payload.pin = pin.trim(); else payload.password = password
      const res = await fetch('/api/ngo/auth/reset/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setDone(true); setTimeout(() => router.push('/ngo/login'), 1500) }
      else setError(data.error ?? 'Could not reset your password.')
    } catch { setError('Could not reset your password. Please try again.') }
    finally { setBusy(false) }
  }

  if (done) return (
    <div style={card}><div style={{ fontSize: 16, fontWeight: 600, color: '#3fb950' }}>✓ Password updated</div>
      <div style={{ fontSize: 13, color: '#8b949e', marginTop: 8 }}>Taking you to sign in…</div></div>
  )

  if (sent) return (
    <div style={card}><div style={{ fontSize: 15, fontWeight: 600 }}>Check your email</div>
      <div style={{ fontSize: 13, color: '#8b949e', marginTop: 8 }}>If that email has an account, a reset link is on its way. The link expires soon and can be used once.</div>
      <a href="/ngo/login" style={{ ...textBtn, display: 'block', textDecoration: 'none', marginTop: 16 }}>Back to sign in</a></div>
  )

  return (
    <div style={card}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>NOUR <span style={{ color: '#3fb950' }}>for NGOs</span></div>
        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{token ? 'Choose a new password' : 'Reset your password'}</div>
      </div>
      {error && <div style={errorBox}>{error}</div>}

      {!token ? (
        <div style={{ display: 'grid', gap: 14, textAlign: 'left' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="button" onClick={requestLink} disabled={busy || !email.includes('@')} style={{ ...primaryBtn, opacity: busy || !email.includes('@') ? 0.6 : 1 }}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <a href="/ngo/login" style={{ ...textBtn, display: 'block', textDecoration: 'none' }}>Back to sign in</a>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14, textAlign: 'left' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setMode('password')} style={toggle(mode === 'password')}>Password</button>
            <button type="button" onClick={() => setMode('pin')} style={toggle(mode === 'pin')}>6-digit PIN</button>
          </div>
          {mode === 'password' ? (
            <div>
              <label style={labelStyle}>New password (min 8 characters)</label>
              <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          ) : (
            <div>
              <label style={labelStyle}>New 6-digit PIN</label>
              <input style={{ ...field, letterSpacing: '0.3em', fontSize: 18 }} inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}
          <button type="button" onClick={confirm} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function NgoResetPage() {
  return (
    <div style={wrap}>
      <Suspense fallback={<div style={{ color: '#8b949e' }}>Loading…</div>}>
        <ResetInner />
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
const textBtn: React.CSSProperties = { width: '100%', background: 'none', border: 'none', color: '#58a6ff', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
function toggle(active: boolean): React.CSSProperties {
  return { flex: 1, minHeight: 40, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(88,166,255,0.15)' : '#0d1117', border: active ? '1px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }
}
