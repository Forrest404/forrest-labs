'use client'

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PartnerOrg {
  id: string
  name: string
  org_type: string
}

interface PartnerTeam {
  id: string
  name: string
  team_type: string
  status: string
  current_location: string | null
  capacity: number
}

interface PartnerAlert {
  id: string
  status: string
  confidence_score: number
  report_count: number
  location_name: string | null
  centroid_lat: number
  centroid_lon: number
  created_at: string
}

interface PartnerResource {
  id: string
  name: string
  resource_type: string
  quantity_total: number
  quantity_available: number
  unit: string
  low_stock_threshold: number
}

interface PartnerData {
  organisation: PartnerOrg
  recent_alerts: PartnerAlert[]
  teams: PartnerTeam[]
  resources: PartnerResource[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  if (m < 1) return 'just now'
  if (m < 60) return m + 'm ago'
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

function teamStatusColour(status: string): string {
  const map: Record<string, string> = { standby: '#3fb950', deployed: '#d29922', returning: '#58a6ff', unavailable: '#f85149', offline: '#484f58' }
  return map[status] ?? '#484f58'
}

function teamTypeLabel(type: string): string {
  const map: Record<string, string> = { medical: 'Medical', rescue: 'Rescue', assessment: 'Assessment', shelter: 'Shelter', logistics: 'Logistics', liaison: 'Liaison' }
  return map[type] ?? type
}

function confColour(score: number): string {
  if (score >= 85) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PartnerPortal() {
  const [authed, setAuthed] = useState(false)
  const [data, setData] = useState<PartnerData | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [time, setTime] = useState('')

  // Check session on mount
  useEffect(() => {
    fetch('/api/partner/auth/check', { credentials: 'include' })
      .then((r) => {
        if (r.ok) return r.json()
        return null
      })
      .then((d: PartnerData | null) => {
        if (d) { setAuthed(true); setData(d) }
      })
      .catch(() => {})
  }, [])

  // UTC clock
  useEffect(() => {
    if (!authed) return
    const tick = () => {
      const n = new Date()
      setTime(
        n.getUTCHours().toString().padStart(2, '0') + ':' +
        n.getUTCMinutes().toString().padStart(2, '0') + ':' +
        n.getUTCSeconds().toString().padStart(2, '0') + ' UTC',
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [authed])

  async function handleLogin() {
    if (loginLoading || !email.trim() || !password.trim()) return
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/partner/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        const d = (await res.json()) as { data?: PartnerData }
        setAuthed(true)
        setData(d.data ?? null)
        // Fetch full data
        const overviewRes = await fetch('/api/partner/overview', { credentials: 'include' })
        if (overviewRes.ok) {
          const overviewData = (await overviewRes.json()) as PartnerData
          setData(overviewData)
        }
        return
      }
      const err = (await res.json()) as { error?: string }
      setLoginError(err.error ?? 'Login failed')
    } catch {
      setLoginError('Network error. Please try again.')
    } finally {
      setLoginLoading(false)
    }
  }

  // ── Login screen ───────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 32, width: '100%', maxWidth: 360, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3fb950' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>Forrest Labs</span>
            <span style={{ background: '#21262d', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: '#484f58', marginLeft: 4 }}>Partner</span>
          </div>

          <div style={{ fontSize: 18, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>Partner portal</div>
          <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 24 }}>Forrest Labs NGO access</div>

          {loginError && (
            <div style={{ fontSize: 12, color: '#f85149', marginBottom: 12 }}>{loginError}</div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8b949e', marginBottom: 6 }}>Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
              autoFocus
              style={{ width: '100%', height: 40, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '0 12px', fontSize: 14, color: '#e6edf3', fontFamily: 'system-ui', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8b949e', marginBottom: 6 }}>Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
              style={{ width: '100%', height: 40, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '0 12px', fontSize: 14, color: '#e6edf3', fontFamily: 'system-ui', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <button type="button" disabled={loginLoading} onClick={handleLogin} style={{
            width: '100%', height: 40, background: loginLoading ? '#1a5c2e' : '#3fb950', color: 'white', border: 'none', borderRadius: 6,
            fontSize: 14, fontWeight: 600, cursor: loginLoading ? 'default' : 'pointer', marginTop: 4, fontFamily: 'system-ui',
          }}>
            {loginLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#484f58' }}>Forrest Labs · 2026</div>
      </div>
    )
  }

  // ── Dashboard ──────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', fontFamily: 'system-ui, sans-serif', color: '#e6edf3' }}>
      {/* Top bar */}
      <div style={{ background: '#0d1117', borderBottom: '1px solid #21262d', height: 48, padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>{data?.organisation?.name ?? 'Partner'}</span>
          <span style={{ fontSize: 12, color: '#484f58' }}>· Forrest Labs</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#484f58', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>{time}</span>
          <button type="button" onClick={() => {
            fetch('/api/partner/auth/logout', { method: 'POST', credentials: 'include' }).then(() => { setAuthed(false); setData(null) })
          }} style={{ height: 28, padding: '0 10px', background: 'transparent', border: '1px solid #21262d', borderRadius: 5, color: '#8b949e', fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
        {/* Section 1 — Active incidents */}
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>Confirmed incidents</div>
        {(data?.recent_alerts ?? []).length === 0 ? (
          <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 24, textAlign: 'center', fontSize: 13, color: '#484f58', marginBottom: 24 }}>No confirmed incidents in your area</div>
        ) : (
          <div style={{ marginBottom: 24 }}>
            {(data?.recent_alerts ?? []).map((a) => (
              <div key={a.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>{a.location_name ?? a.centroid_lat.toFixed(3) + ', ' + a.centroid_lon.toFixed(3)}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: 'rgba(63,185,80,0.1)', color: '#3fb950' }}>{a.status === 'confirmed' ? 'Confirmed' : a.status.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                  <span style={{ color: confColour(a.confidence_score), fontWeight: 500 }}>{a.confidence_score}%</span>
                  <span style={{ margin: '0 6px' }}>·</span>
                  {a.report_count} reports
                  <span style={{ margin: '0 6px' }}>·</span>
                  {timeAgo(a.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Section 2 — Your teams */}
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>Your teams</div>
        {(data?.teams ?? []).length === 0 ? (
          <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 24, textAlign: 'center', fontSize: 13, color: '#484f58', marginBottom: 24 }}>No teams assigned to your organisation</div>
        ) : (
          <div style={{ marginBottom: 24 }}>
            {(data?.teams ?? []).map((t) => (
              <div key={t.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(88,166,255,0.08)', color: '#58a6ff', marginRight: 6 }}>{teamTypeLabel(t.team_type)}</span>
                    {t.capacity} personnel
                    {t.current_location && <span style={{ marginLeft: 8, color: '#484f58' }}>· {t.current_location}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: teamStatusColour(t.status) }}>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Section 3 — Resources */}
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>Resources</div>
        {(data?.resources ?? []).length === 0 ? (
          <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 24, textAlign: 'center', fontSize: 13, color: '#484f58', marginBottom: 24 }}>No resources tracked</div>
        ) : (
          <div style={{ marginBottom: 24 }}>
            {(data?.resources ?? []).map((r) => {
              const pct = r.quantity_total > 0 ? (r.quantity_available / r.quantity_total) * 100 : 0
              const barColor = pct > 50 ? '#3fb950' : r.quantity_available > r.low_stock_threshold ? '#d29922' : '#f85149'
              return (
                <div key={r.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: '#8b949e' }}>{r.resource_type.replace(/_/g, ' ')}</div>
                  </div>
                  <div style={{ width: 140, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: barColor, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color: barColor, whiteSpace: 'nowrap' }}>{r.quantity_available}/{r.quantity_total} {r.unit}</span>
                  </div>
                  {r.quantity_available <= r.low_stock_threshold && (
                    <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: 'rgba(210,153,34,0.1)', color: '#d29922' }}>LOW</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Section 4 — Map link */}
        <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 8 }}>View all confirmed incidents and active warnings on the public map</div>
          <a href="/map" target="_blank" style={{ fontSize: 13, color: '#3fb950', textDecoration: 'none', fontWeight: 500 }}>Open live map ↗</a>
        </div>
      </div>
    </div>
  )
}
