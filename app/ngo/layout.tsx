'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// NGO platform shell. Design-system colours + inline styles, matching the
// rest of the app. Auth pages (login/signup) render bare — no sidebar chrome,
// mirroring the admin login exemption. Nav is role-gated: org admins manage the
// operational area; org admins + team leaders manage teams; field coordinators
// get no chrome (they live on /ngo/field).
export default function NgoLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/ngo/login' || pathname === '/ngo/signup'

  const [role, setRole] = useState<string | null>(null)
  useEffect(() => {
    if (isAuthPage) return
    fetch('/api/ngo/auth/check').then((r) => (r.ok ? r.json() : null)).then((d) => setRole(d?.role ?? null)).catch(() => {})
  }, [isAuthPage])

  if (isAuthPage) return <>{children}</>

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: '#0d1117',
        color: '#e6edf3',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: '#0d1117',
          borderRight: '1px solid #21262d',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 0',
        }}
      >
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #21262d' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>
            NOUR <span style={{ color: '#3fb950' }}>for NGOs</span>
          </div>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>Operations dashboard</div>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(role === 'org_admin' || role === 'team_leader') && (
            <NavLink href="/ngo/teams" label="Teams" active={pathname.startsWith('/ngo/teams')} />
          )}
          {role === 'org_admin' && (
            <NavLink href="/ngo/setup" label="Operational area" active={pathname.startsWith('/ngo/setup')} />
          )}
        </nav>

        <div style={{ padding: '0 16px', fontSize: 10, color: '#484f58' }}>Pre-release</div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
    </div>
  )
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      style={{
        display: 'block', padding: '8px 12px', borderRadius: 6, fontSize: 13, textDecoration: 'none',
        color: active ? '#e6edf3' : '#8b949e', background: active ? '#161b22' : 'transparent',
      }}
    >
      {label}
    </a>
  )
}
