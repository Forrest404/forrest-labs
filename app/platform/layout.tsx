'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

// Platform-operator console shell. A tier ABOVE all NGOs — gated by the existing
// admin session (fl_admin_session); middleware redirects to /admin/login without
// it. Deliberately small: Overview, NGO Review, Manage NGOs, Audit. Matches the
// civilian admin layout's structure/design system but is a separate area.

const NAV = [
  { label: 'Overview', href: '/platform', exact: true },
  { label: 'NGO Review', href: '/platform/review', exact: false },
  { label: 'Manage NGOs', href: '/platform/ngos', exact: false },
  { label: 'Audit', href: '/platform/audit', exact: false },
]

export default function PlatformLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)

  // Verify the admin session on mount (server is the real gate; this avoids a
  // flash of content before middleware/redirect on a stale tab).
  useEffect(() => {
    fetch('/api/platform/overview', { cache: 'no-store' })
      .then((r) => { if (r.status === 401) router.push('/admin/login'); else setAuthed(true) })
      .catch(() => setAuthed(true)) // transient/offline — let the page render its own error
  }, [router])

  if (!authed) return null

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, background: '#0d1117', borderRight: '1px solid #21262d', display: 'flex', flexDirection: 'column', padding: '16px 0' }}>
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #21262d' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="7.5" stroke="#a371f7" strokeWidth="1" />
              <circle cx="9" cy="9" r="2" fill="#a371f7" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600 }}>NOUR</span>
            <span style={{ background: 'rgba(163,113,247,0.15)', color: '#a371f7', borderRadius: 4, padding: '2px 7px', fontSize: 11 }}>Platform</span>
          </div>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6 }}>Operator console</div>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <div
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  padding: '8px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                  background: active ? '#161b22' : 'transparent',
                  color: active ? '#e6edf3' : '#8b949e', fontWeight: active ? 500 : 400,
                }}
              >
                {item.label}
              </div>
            )
          })}
        </nav>

        <div style={{ padding: '12px 16px 0', borderTop: '1px solid #21262d' }}>
          <div style={{ fontSize: 12, color: '#e6edf3', marginBottom: 8 }}>Platform admin</div>
          <button
            type="button"
            onClick={() => { fetch('/api/admin/auth/logout', { method: 'POST' }).then(() => router.push('/admin/login')) }}
            style={{ width: '100%', height: 32, background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }}
          >
            Log out
          </button>
          <div style={{ padding: '10px 0 0', fontSize: 10, color: '#484f58' }}>Above all NGOs</div>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</main>
    </div>
  )
}
