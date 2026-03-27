'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Operations', href: '/admin', exact: true, icon: 'grid' },
  { label: 'Incidents', href: '/admin/incidents', exact: false, icon: 'circle' },
  { label: 'Warnings', href: '/admin/warnings', exact: false, icon: 'triangle' },
  { label: 'Reports', href: '/admin/reports', exact: false, icon: 'doc' },
  { label: 'Audit Log', href: '/admin/audit', exact: false, icon: 'list' },
  { label: 'Intelligence', href: '/admin/intelligence', exact: false, icon: 'brain' },
  { label: 'Map', href: '/admin/map', exact: false, icon: 'map' },
  { label: 'Triage', href: '/admin/triage', exact: false, icon: 'queue' },
] as const

function NavIcon({ name, color }: { name: string; color: string }) {
  switch (name) {
    case 'grid':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" stroke={color} strokeWidth="1.2" />
          <rect x="8" y="1" width="5" height="5" rx="1" stroke={color} strokeWidth="1.2" />
          <rect x="1" y="8" width="5" height="5" rx="1" stroke={color} strokeWidth="1.2" />
          <rect x="8" y="8" width="5" height="5" rx="1" stroke={color} strokeWidth="1.2" />
        </svg>
      )
    case 'circle':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="1.2" />
          <circle cx="7" cy="7" r="2" fill={color} />
        </svg>
      )
    case 'triangle':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2L13 12H1L7 2Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      )
    case 'doc':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="2" y="1" width="10" height="12" rx="1.5" stroke={color} strokeWidth="1.2" />
          <line x1="4.5" y1="5" x2="9.5" y2="5" stroke={color} strokeWidth="1.2" />
          <line x1="4.5" y1="8" x2="9.5" y2="8" stroke={color} strokeWidth="1.2" />
        </svg>
      )
    case 'list':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <line x1="4" y1="3.5" x2="12" y2="3.5" stroke={color} strokeWidth="1.2" />
          <line x1="4" y1="7" x2="12" y2="7" stroke={color} strokeWidth="1.2" />
          <line x1="4" y1="10.5" x2="12" y2="10.5" stroke={color} strokeWidth="1.2" />
          <circle cx="2" cy="3.5" r="0.8" fill={color} />
          <circle cx="2" cy="7" r="0.8" fill={color} />
          <circle cx="2" cy="10.5" r="0.8" fill={color} />
        </svg>
      )
    case 'brain':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 2C3.34 2 2 3.34 2 5c0 1 .5 1.9 1.2 2.5C2.5 8.1 2 9 2 10c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2 0-1-.5-1.9-1.2-2.5C11.5 6.9 12 6 12 5c0-1.66-1.34-3-3-3-.6 0-1.16.18-1.63.49A2.99 2.99 0 005 2z" stroke={color} strokeWidth="1.2" fill="none" />
          <line x1="7" y1="5" x2="7" y2="10" stroke={color} strokeWidth="1.2" />
          <line x1="5" y1="7" x2="9" y2="7" stroke={color} strokeWidth="1.2" />
        </svg>
      )
    case 'map':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 3l4-1.5L9 3l4-1.5V11l-4 1.5L5 11l-4 1.5V3z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill="none" />
          <line x1="5" y1="1.5" x2="5" y2="11" stroke={color} strokeWidth="1.2" />
          <line x1="9" y1="3" x2="9" y2="12.5" stroke={color} strokeWidth="1.2" />
        </svg>
      )
    case 'queue':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2" width="12" height="3" rx="1" stroke={color} strokeWidth="1.2" />
          <rect x="1" y="7" width="8" height="3" rx="1" stroke={color} strokeWidth="1.2" />
          <path d="M11 8.5l2 2-2 2" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    default:
      return null
  }
}

function getPageTitle(pathname: string): string {
  if (pathname === '/admin') return 'Operations'
  if (pathname.startsWith('/admin/incidents')) return 'Incidents'
  if (pathname.startsWith('/admin/warnings')) return 'Warnings'
  if (pathname.startsWith('/admin/reports')) return 'Reports'
  if (pathname.startsWith('/admin/audit')) return 'Audit log'
  if (pathname.startsWith('/admin/intelligence')) return 'Intelligence'
  if (pathname.startsWith('/admin/map')) return 'Map'
  if (pathname.startsWith('/admin/triage')) return 'Triage'
  return 'Admin'
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [time, setTime] = useState('')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Skip auth check on login page
  const isLoginPage = pathname === '/admin/login'

  // Verify auth on mount
  useEffect(() => {
    if (isLoginPage) {
      setAuthed(true)
      return
    }
    fetch('/api/admin/stats')
      .then((r) => {
        if (r.status === 401) {
          router.push('/admin/login')
        } else {
          setAuthed(true)
        }
      })
      .catch(() => {
        router.push('/admin/login')
      })
  }, [isLoginPage, router])

  // UTC clock
  useEffect(() => {
    if (isLoginPage) return
    const tick = () => {
      const n = new Date()
      setTime(
        n.getUTCHours().toString().padStart(2, '0') +
          ':' +
          n.getUTCMinutes().toString().padStart(2, '0') +
          ':' +
          n.getUTCSeconds().toString().padStart(2, '0') +
          ' UTC',
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isLoginPage])

  // Global keyboard shortcuts
  useEffect(() => {
    if (isLoginPage) return
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case 'Escape':
          setShowShortcuts(false)
          break
      }
    }
    window.addEventListener('keydown', handleGlobalKeys)
    return () => window.removeEventListener('keydown', handleGlobalKeys)
  }, [isLoginPage, router])

  // Login page gets no layout chrome
  if (isLoginPage) return <>{children}</>

  if (!authed) return null

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: '#0d1117',
        fontFamily: 'system-ui, sans-serif',
        color: '#e6edf3',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Sidebar */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          background: '#0d1117',
          borderRight: '1px solid #21262d',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 12px',
          overflowY: 'auto',
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingBottom: 16,
            borderBottom: '1px solid #21262d',
            marginBottom: 12,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="#f85149" strokeWidth="1" />
            <circle cx="9" cy="9" r="2" fill="#f85149" />
            <line x1="9" y1="1" x2="9" y2="5" stroke="#f85149" strokeWidth="1" />
            <line x1="9" y1="13" x2="9" y2="17" stroke="#f85149" strokeWidth="1" />
            <line x1="1" y1="9" x2="5" y2="9" stroke="#f85149" strokeWidth="1" />
            <line x1="13" y1="9" x2="17" y2="9" stroke="#f85149" strokeWidth="1" />
          </svg>
          <span style={{ fontSize: 13, color: '#e6edf3', fontWeight: 600 }}>Forrest Labs</span>
          <span
            style={{
              background: '#21262d',
              borderRadius: 4,
              padding: '2px 7px',
              fontSize: 11,
              color: '#484f58',
            }}
          >
            Admin
          </span>
        </div>

        {/* Nav items */}
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <div
              key={item.href}
              onClick={() => router.push(item.href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                height: 34,
                padding: '0 10px',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
                marginBottom: 2,
                background: isActive ? 'rgba(248,81,73,0.1)' : 'transparent',
                color: isActive ? '#e6edf3' : '#8b949e',
                fontWeight: isActive ? 500 : 400,
              }}
            >
              <NavIcon name={item.icon} color={isActive ? '#e6edf3' : '#8b949e'} />
              {item.label}
            </div>
          )
        })}

        {/* Divider */}
        <div style={{ borderTop: '1px solid #21262d', margin: '8px 0' }} />

        {/* Map link */}
        <div
          onClick={() => window.open('/map', '_blank')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 34,
            padding: '0 10px',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
            marginBottom: 2,
            color: '#8b949e',
            background: 'transparent',
          }}
        >
          Live map ↗
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom section */}
        <div>
          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', marginBottom: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#3fb950',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: 11, color: '#3fb950', fontWeight: 500 }}>Live</span>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={() => {
              fetch('/api/admin/auth/logout', { method: 'POST' }).then(() =>
                router.push('/admin/login'),
              )
            }}
            style={{
              width: '100%',
              height: 32,
              background: 'transparent',
              border: '1px solid #21262d',
              borderRadius: 6,
              color: '#8b949e',
              fontSize: 12,
              fontFamily: 'system-ui',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Top bar */}
        <div
          style={{
            height: 44,
            borderBottom: '1px solid #21262d',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            background: '#0d1117',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>
            {getPageTitle(pathname)}
          </span>
          <span
            style={{
              fontSize: 12,
              color: '#484f58',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'monospace',
            }}
          >
            {time}
          </span>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>{children}</div>
      </div>

      {/* Keyboard shortcut help */}
      <button
        type="button"
        onClick={() => setShowShortcuts((v) => !v)}
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          width: 28,
          height: 28,
          background: '#161b22',
          border: '1px solid #21262d',
          borderRadius: '50%',
          fontSize: 12,
          color: '#484f58',
          cursor: 'pointer',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui',
        }}
      >
        ?
      </button>

      {showShortcuts && (
        <div
          style={{
            position: 'fixed',
            bottom: 56,
            right: 16,
            background: '#161b22',
            border: '1px solid #21262d',
            borderRadius: 8,
            padding: '14px 16px',
            width: 220,
            zIndex: 50,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>
            Keyboard shortcuts
          </div>
          {pathname.startsWith('/admin/triage') && (
            <>
              {[
                { key: 'A', desc: 'Confirm cluster' },
                { key: 'R', desc: 'Reject cluster' },
                { key: 'S', desc: 'Skip to next' },
                { key: '→', desc: 'Skip to next' },
              ].map((s) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ background: '#21262d', border: '1px solid #30363d', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: '#8b949e', fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>{s.key}</span>
                  <span style={{ fontSize: 11, color: '#484f58' }}>{s.desc}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #21262d', margin: '6px 0' }} />
            </>
          )}
          {[
            { key: 'Esc', desc: 'Close modal/panel' },
          ].map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ background: '#21262d', border: '1px solid #30363d', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: '#8b949e', fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>{s.key}</span>
              <span style={{ fontSize: 11, color: '#484f58' }}>{s.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
