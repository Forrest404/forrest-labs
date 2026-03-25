'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginCard() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  async function handleSubmit() {
    if (loading || !password.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        const from = searchParams.get('from')
        router.push(from ?? '/admin')
        return
      }
      const data = (await res.json()) as { error?: string }
      setError(data.error ?? 'Sign in failed')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0d1117',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Card */}
      <div
        style={{
          background: '#161b22',
          border: '1px solid #21262d',
          borderRadius: 8,
          padding: 32,
          width: '100%',
          maxWidth: 360,
          boxSizing: 'border-box',
        }}
      >
        {/* Header — logo + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="#f85149" strokeWidth="1" />
            <circle cx="9" cy="9" r="2" fill="#f85149" />
            <line x1="9" y1="1" x2="9" y2="5" stroke="#f85149" strokeWidth="1" />
            <line x1="9" y1="13" x2="9" y2="17" stroke="#f85149" strokeWidth="1" />
            <line x1="1" y1="9" x2="5" y2="9" stroke="#f85149" strokeWidth="1" />
            <line x1="13" y1="9" x2="17" y2="9" stroke="#f85149" strokeWidth="1" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>Forrest Labs</span>
          <span
            style={{
              background: '#21262d',
              borderRadius: 4,
              padding: '2px 7px',
              fontSize: 11,
              color: '#484f58',
              marginLeft: 4,
            }}
          >
            Admin
          </span>
        </div>

        {/* Heading */}
        <div style={{ fontSize: 18, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>
          Operations centre
        </div>
        <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 24 }}>Authorised access only</div>

        {/* Expired banner */}
        {searchParams.get('expired') === '1' && (
          <div
            style={{
              background: 'rgba(210,153,34,0.08)',
              border: '1px solid rgba(210,153,34,0.2)',
              borderRadius: 6,
              padding: '10px 12px',
              marginBottom: 16,
              fontSize: 13,
              color: '#d29922',
            }}
          >
            Session expired. Please sign in again.
          </div>
        )}

        {/* Password field */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#8b949e',
              marginBottom: 6,
            }}
          >
            Password
          </label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            style={{
              width: '100%',
              height: 40,
              background: '#0d1117',
              border: `1px solid ${error ? '#f85149' : '#21262d'}`,
              borderRadius: 6,
              padding: '0 12px',
              fontSize: 14,
              color: '#e6edf3',
              fontFamily: 'system-ui',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {error && (
            <div style={{ fontSize: 12, color: '#f85149', marginTop: 6 }}>{error}</div>
          )}
        </div>

        {/* Submit button */}
        <button
          type="button"
          disabled={loading}
          onClick={handleSubmit}
          style={{
            width: '100%',
            height: 40,
            background: loading ? '#6e3731' : '#f85149',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            marginTop: 12,
            fontFamily: 'system-ui',
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#484f58' }}>
        Forrest Labs · 2026
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  )
}
