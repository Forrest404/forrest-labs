'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const field: React.CSSProperties = {
  width: '100%', height: 42, padding: '0 12px', boxSizing: 'border-box',
  background: '#0d1117', border: '1px solid #21262d', borderRadius: 6,
  color: '#e6edf3', fontSize: 14, fontFamily: 'system-ui', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }

export default function NgoLoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'code' | 'password'>('code')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const doLogin = useCallback(async (payload: Record<string, string>, isCode: boolean) => {
    setError(null); setBusy(true)
    try {
      const res = await fetch('/api/ngo/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) router.push(data.role === 'field_coordinator' ? '/ngo/field' : '/ngo/board')
      else setError(data.error ?? 'Sign-in failed.')
    } catch {
      setError('Sign-in failed. Please try again.')
    } finally { setBusy(false) }
  }, [router])

  // Desktop defaults to email+password; mobile to the access code. A QR/link with
  // ?code=XXXX signs the operative straight in.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const urlCode = new URLSearchParams(window.location.search).get('code')
    if (urlCode) { setMode('code'); setCode(urlCode.toUpperCase()); doLogin({ code: urlCode }, true); return }
    if (window.innerWidth >= 600) setMode('password')
  }, [doLogin])

  const submit = () => {
    if (mode === 'code') {
      if (!code.trim()) { setError('Enter your access code.'); return }
      doLogin({ code: code.trim() }, true)
    } else {
      if (!email || !password) { setError('Enter your email and password.'); return }
      doLogin({ email, password }, false)
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
          {mode === 'code' ? (
            <div>
              <label style={labelStyle}>Access code</label>
              <input
                style={{ ...field, letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: 18, fontWeight: 600 }}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={onKey}
                placeholder="e.g. K7P29QXM"
                autoCapitalize="characters" autoCorrect="off" autoComplete="off"
              />
              <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>Field staff: enter the code from your team leader, or scan their QR.</div>
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey} />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKey} />
              </div>
            </>
          )}
        </div>

        <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, marginTop: 18 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={() => { setMode((m) => (m === 'code' ? 'password' : 'code')); setError(null) }}
          style={textBtn}
        >
          {mode === 'code' ? 'Admin / team leader sign-in' : 'Use an access code instead'}
        </button>

        {mode === 'password' && (
          <a href="/ngo/reset" style={{ ...textBtn, display: 'block', textDecoration: 'none', marginTop: 4 }}>Forgot password?</a>
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
