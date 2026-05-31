'use client'

import { useEffect } from 'react'

// Error boundary for the whole NGO section. Without this, a client-side exception
// on any /ngo page unmounts the route and the host shows a generic, unbranded
// "This page couldn't load" screen with no way to recover in-app. This keeps the
// user inside NOUR, surfaces the actual error, and offers a one-tap retry.
export default function NgoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[ngo] route error:', error) }, [error])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong on this page</div>
        <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 20 }}>
          You’re still signed in. Try again, or head back to the situation board.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button type="button" onClick={() => reset()} style={{ height: 38, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }}>
            Try again
          </button>
          <a href="/ngo/board" style={{ height: 38, padding: '0 18px', display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#c9d1d9', borderRadius: 8, fontSize: 14, textDecoration: 'none' }}>
            Back to board
          </a>
        </div>
        {error?.message && (
          <div style={{ marginTop: 18, fontSize: 11, color: '#484f58', wordBreak: 'break-word' }}>{error.message}</div>
        )}
      </div>
    </div>
  )
}
