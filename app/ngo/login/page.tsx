'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const field: React.CSSProperties = {
  width: '100%', height: 42, padding: '0 12px', boxSizing: 'border-box',
  background: '#0d1117', border: '1px solid #21262d', borderRadius: 6,
  color: '#e6edf3', fontSize: 14, fontFamily: 'system-ui', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }

export default function NgoLoginPage() {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [mode, setMode] = useState<'password' | 'pin'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 600)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const submit = async () => {
    setError(null)
    if (!email || (mode === 'password' ? !password : !pin)) {
      setError('Please enter your email and credentials.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/ngo/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'pin' ? { email, pin } : { email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push(data.role === 'field_coordinator' ? '/ngo/field' : '/ngo/board')
      } else {
        setError(data.error ?? 'Sign-in failed.')
      }
    } catch {
      setError('Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e: { key: string }) => { if (e.key === 'Enter') submit() }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>NOUR <span style={{ color: '#3fb950' }}>for NGOs</span></div>
          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>Sign in to your organisation</div>
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: 'grid', gap: 14, textAlign: 'left' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey} />
          </div>
          {mode === 'password' ? (
            <div>
              <label style={labelStyle}>Password</label>
              <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKey} />
            </div>
          ) : (
            <div>
              <label style={labelStyle}>PIN</label>
              <input style={field} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={onKey} placeholder="Field coordinator PIN" />
            </div>
          )}
        </div>

        <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, marginTop: 18 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {/* PIN sign-in is offered on small screens for field coordinators. */}
        {isMobile && (
          <button
            type="button"
            onClick={() => { setMode((m) => (m === 'password' ? 'pin' : 'password')); setError(null) }}
            style={textBtn}
          >
            {mode === 'password' ? 'Use a PIN instead' : 'Use a password instead'}
          </button>
        )}

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#8b949e' }}>
          New organisation? <a href="/ngo/signup" style={{ color: '#58a6ff', textDecoration: 'none' }}>Register</a>
        </div>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }
const card: React.CSSProperties = { width: '100%', maxWidth: 380, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 28, textAlign: 'center' }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14, textAlign: 'left' }
const primaryBtn: React.CSSProperties = { width: '100%', height: 42, background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const textBtn: React.CSSProperties = { width: '100%', marginTop: 12, background: 'none', border: 'none', color: '#58a6ff', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
