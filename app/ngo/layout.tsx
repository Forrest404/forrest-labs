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
  // Auth pages and the mobile field view render bare — no desktop sidebar chrome.
  const isBare = pathname === '/ngo/login' || pathname === '/ngo/signup' || pathname.startsWith('/ngo/field')

  const isAuthPage = pathname === '/ngo/login' || pathname === '/ngo/signup'

  const [role, setRole] = useState<string | null>(null)
  const [who, setWho] = useState<{ name: string; org: string | null } | null>(null)
  const [panicCount, setPanicCount] = useState(0)
  // Poll the session for every signed-in NGO page (including the bare field view):
  // if access is revoked mid-session, /api/ngo/auth/check starts returning 401 and
  // we bounce to the login screen (which then refuses the suspended account).
  useEffect(() => {
    if (isAuthPage) return
    let stop = false
    const check = async () => {
      try {
        const r = await fetch('/api/ngo/auth/check', { cache: 'no-store' })
        if (stop) return
        if (r.status === 401) { window.location.replace('/ngo/login'); return }
        if (r.ok) { const d = await r.json(); setRole(d?.role ?? null); setWho({ name: d?.name ?? 'Signed in', org: d?.org_name ?? null }) }
      } catch { /* offline — leave the user where they are */ }
    }
    check()
    const id = setInterval(check, 20000)
    return () => { stop = true; clearInterval(id) }
  }, [isAuthPage])

  // Live active-panic count for the nav badge (leaders/admins). Polls fast so a new
  // duress alert surfaces on every page, not just the board.
  useEffect(() => {
    if (isAuthPage || !(role === 'org_admin' || role === 'team_leader')) return
    let stop = false
    const poll = async () => {
      try {
        const r = await fetch('/api/ngo/safety/panic', { cache: 'no-store' })
        if (!stop && r.ok) setPanicCount(((await r.json()).panics ?? []).length)
      } catch { /* offline */ }
    }
    poll()
    const id = setInterval(poll, 12000)
    return () => { stop = true; clearInterval(id) }
  }, [isAuthPage, role])

  async function logout() {
    try { await fetch('/api/ngo/auth/logout', { method: 'POST' }) } catch { /* clear locally anyway */ }
    window.location.replace('/ngo/login')
  }

  // Instant press feedback for every control in the NGO section. Scoped to
  // `.ngo-scope` so it can never leak into the civilian/admin/partner apps. On
  // press the control dips (scale + slight dim) the moment the finger lands —
  // before any async handler runs — so the UI never feels dead on a slow or
  // offline link. `touch-action: manipulation` removes the ~300ms mobile tap
  // delay; the grey tap highlight is cleared so our own dip is the only feedback
  // shown. Disabled buttons are excluded; inline `transform` (e.g. the field
  // panic button's hold state) wins over this rule, so existing gestures stand.
  const pressFeedback = (
    <style>{`
      .ngo-scope button, .ngo-scope [role="button"], .ngo-scope a {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition: transform 70ms ease, filter 70ms ease;
      }
      .ngo-scope button:not(:disabled):active,
      .ngo-scope [role="button"]:not([aria-disabled="true"]):active,
      .ngo-scope a:active {
        transform: scale(0.97);
        filter: brightness(0.9);
      }
    `}</style>
  )

  if (isBare) return <div className="ngo-scope" style={{ display: 'contents' }}>{pressFeedback}{children}</div>

  return (
    <div
      className="ngo-scope"
      style={{
        display: 'flex',
        height: '100vh',
        background: '#0d1117',
        color: '#e6edf3',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {pressFeedback}
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
            <NavLink href="/ngo/board" label="Situation board" active={pathname.startsWith('/ngo/board')} />
          )}
          {(role === 'org_admin' || role === 'team_leader') && (
            <NavLink href="/ngo/panic" label="Panic" active={pathname.startsWith('/ngo/panic')} badge={panicCount} danger />
          )}
          {(role === 'org_admin' || role === 'team_leader') && (
            <NavLink href="/ngo/dispatch" label="Dispatch" active={pathname.startsWith('/ngo/dispatch')} />
          )}
          {(role === 'org_admin' || role === 'team_leader') && (
            <NavLink href="/ngo/teams" label="Teams" active={pathname.startsWith('/ngo/teams')} />
          )}
          {role === 'org_admin' && (
            <NavLink href="/ngo/setup" label="Operational area" active={pathname.startsWith('/ngo/setup')} />
          )}
          {role === 'org_admin' && (
            <NavLink href="/ngo/users" label="Users" active={pathname.startsWith('/ngo/users')} />
          )}
          {role === 'org_admin' && (
            <NavLink href="/ngo/settings" label="Settings" active={pathname.startsWith('/ngo/settings')} />
          )}
        </nav>

        {/* Who's signed in + logout — present on every authenticated desktop page. */}
        <div style={{ padding: '12px 16px 0', borderTop: '1px solid #21262d' }}>
          {who && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who.name}</div>
              {who.org && <div style={{ fontSize: 11, color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who.org}</div>}
            </div>
          )}
          <button type="button" onClick={logout} style={{ width: '100%', height: 32, background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }}>
            Log out
          </button>
          <div style={{ padding: '10px 0 0', fontSize: 10, color: '#484f58' }}>Pre-release</div>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
    </div>
  )
}

function NavLink({ href, label, active, badge, danger }: { href: string; label: string; active: boolean; badge?: number; danger?: boolean }) {
  const hasBadge = !!badge && badge > 0
  return (
    <a
      href={href}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, fontSize: 13, textDecoration: 'none',
        color: hasBadge && danger ? '#f85149' : active ? '#e6edf3' : '#8b949e',
        background: active ? '#161b22' : 'transparent', fontWeight: hasBadge && danger ? 700 : 400,
      }}
    >
      <span>{label}</span>
      {hasBadge && (
        <span style={{ background: '#da3633', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{badge}</span>
      )}
    </a>
  )
}
