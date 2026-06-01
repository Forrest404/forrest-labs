'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type NgoRole = 'org_admin' | 'team_leader' | 'field_coordinator'

// Single source of truth for in-app navigation. Each page the persistent nav can
// reach is listed once with the roles allowed to see it; the sidebar (desktop)
// and the drawer (mobile) both render this same filtered list, so role gating is
// written once, not duplicated. NOTE: hiding a link is cosmetic — the API still
// enforces access via requireRole on every /api/ngo/* route.
type NavItem = { href: string; label: string; roles: NgoRole[]; section: string; danger?: boolean; badgeKey?: 'panic' }
const NAV: NavItem[] = [
  // Operations
  { href: '/ngo/board', label: 'Situation board', roles: ['org_admin', 'team_leader'], section: 'Operations' },
  { href: '/ngo/panic', label: 'Panic', roles: ['org_admin', 'team_leader'], section: 'Operations', danger: true, badgeKey: 'panic' },
  { href: '/ngo/dispatch', label: 'Dispatch', roles: ['org_admin', 'team_leader'], section: 'Operations' },
  { href: '/ngo/teams', label: 'Teams', roles: ['org_admin', 'team_leader'], section: 'Operations' },
  // Coordination (Reports/Chat/Facilities are scaffolds — see their pages)
  { href: '/ngo/reports', label: 'Reports', roles: ['org_admin', 'team_leader'], section: 'Coordination' },
  { href: '/ngo/chat', label: 'Group chats', roles: ['org_admin', 'team_leader'], section: 'Coordination' },
  { href: '/ngo/facilities', label: 'Facilities & contacts', roles: ['org_admin', 'team_leader'], section: 'Coordination' },
  // Admin
  { href: '/ngo/setup', label: 'Operational area', roles: ['org_admin'], section: 'Admin' },
  { href: '/ngo/users', label: 'Users', roles: ['org_admin'], section: 'Admin' },
  { href: '/ngo/settings', label: 'Settings', roles: ['org_admin', 'team_leader'], section: 'Admin' },
  { href: '/ngo/security', label: 'Security (2FA)', roles: ['org_admin', 'team_leader'], section: 'Admin' },
]
const SECTION_ORDER = ['Operations', 'Coordination', 'Admin']

// NGO platform shell. Design-system colours + inline styles, matching the rest of
// the app. Auth pages (login/signup) render bare — no chrome. The mobile field
// view is also bare: field_coordinator is locked to /ngo/field by middleware, so
// it carries its own on-screen controls and needs no sidebar/drawer.
export default function NgoLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isBare = pathname === '/ngo/login' || pathname === '/ngo/signup' || pathname === '/ngo/invite' || pathname === '/ngo/reset' || pathname.startsWith('/ngo/field')
  const isAuthPage = pathname === '/ngo/login' || pathname === '/ngo/signup' || pathname === '/ngo/invite' || pathname === '/ngo/reset'

  const [role, setRole] = useState<NgoRole | null>(null)
  const [who, setWho] = useState<{ name: string; org: string | null } | null>(null)
  const [panicCount, setPanicCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Track viewport so we render the sidebar (desktop) or the top bar + drawer
  // (mobile). 768px breakpoint, matched in pure JS since we use inline styles.
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Close the mobile drawer whenever the route changes (e.g. after a nav tap).
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  // Poll the session for every signed-in NGO page: if access is revoked
  // mid-session, /api/ngo/auth/check returns 401 and we bounce to login.
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
  // delay; the grey tap highlight is cleared so our own dip is the only feedback.
  // Disabled buttons are excluded; inline `transform` wins over this rule.
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

  // Links this role may see, grouped into sections (preserving section order).
  const visible = role ? NAV.filter((n) => n.roles.includes(role)) : []
  const grouped = SECTION_ORDER
    .map((section) => ({ section, items: visible.filter((n) => n.section === section) }))
    .filter((g) => g.items.length > 0)

  const navBody = (
    <NavBody grouped={grouped} pathname={pathname} panicCount={panicCount} who={who} onLogout={logout} loading={role === null} />
  )

  return (
    <div
      className="ngo-scope"
      style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        height: '100vh',
        background: '#0d1117',
        color: '#e6edf3',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {pressFeedback}
      {/* Desktop: persistent sidebar */}
      {!isMobile && (
        <aside style={{ width: 220, flexShrink: 0, background: '#0d1117', borderRight: '1px solid #21262d', display: 'flex', flexDirection: 'column', padding: '16px 0' }}>
          {navBody}
        </aside>
      )}

      {/* Mobile: fixed top bar with brand, panic badge and hamburger */}
      {isMobile && (
        <header style={{ flexShrink: 0, height: 52, background: '#0d1117', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>
            NOUR <span style={{ color: '#3fb950' }}>for NGOs</span>
          </div>
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open menu" style={{ position: 'relative', height: 36, width: 40, background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', borderRadius: 8, color: '#e6edf3', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
            ☰
            {panicCount > 0 && (
              <span style={{ position: 'absolute', top: -6, right: -6, background: '#da3633', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{panicCount}</span>
            )}
          </button>
        </header>
      )}

      {/* Mobile: slide-in drawer + backdrop */}
      {isMobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: 264, maxWidth: '85%', background: '#0d1117', borderRight: '1px solid #21262d', display: 'flex', flexDirection: 'column', padding: '16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 4px' }}>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu" style={{ height: 30, width: 30, background: 'transparent', border: 'none', color: '#8b949e', fontSize: 20, cursor: 'pointer', fontFamily: 'system-ui' }}>✕</button>
            </div>
            {navBody}
          </div>
        </div>
      )}

      <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
    </div>
  )
}

// The nav contents, shared by the desktop sidebar and the mobile drawer.
function NavBody({
  grouped, pathname, panicCount, who, onLogout, loading,
}: {
  grouped: { section: string; items: { href: string; label: string; danger?: boolean; badgeKey?: 'panic' }[] }[]
  pathname: string
  panicCount: number
  who: { name: string; org: string | null } | null
  onLogout: () => void
  loading: boolean
}) {
  return (
    <>
      <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #21262d' }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>
          NOUR <span style={{ color: '#3fb950' }}>for NGOs</span>
        </div>
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>Operations dashboard</div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '8px 12px', fontSize: 12, color: '#484f58' }}>Loading menu…</div>}
        {!loading && grouped.map((g) => (
          <div key={g.section} style={{ marginBottom: 8 }}>
            <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#484f58' }}>{g.section}</div>
            {g.items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={pathname.startsWith(item.href)}
                badge={item.badgeKey === 'panic' ? panicCount : undefined}
                danger={item.danger}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Who's signed in + logout — present on every authenticated page. */}
      <div style={{ padding: '12px 16px 0', borderTop: '1px solid #21262d' }}>
        {who && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who.name}</div>
            {who.org && <div style={{ fontSize: 11, color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who.org}</div>}
          </div>
        )}
        <button type="button" onClick={onLogout} style={{ width: '100%', height: 32, background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }}>
          Log out
        </button>
        <div style={{ padding: '10px 0 0', fontSize: 10, color: '#484f58' }}>Pre-release</div>
      </div>
    </>
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
