'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return (
    d.getUTCDate() +
    ' ' +
    months[d.getUTCMonth()] +
    ' ' +
    d.getUTCFullYear() +
    ' · ' +
    d.getUTCHours().toString().padStart(2, '0') +
    ':' +
    d.getUTCMinutes().toString().padStart(2, '0') +
    ':' +
    d.getUTCSeconds().toString().padStart(2, '0')
  )
}

function actionLabel(action: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    admin_login: { label: 'Login', color: '#3fb950' },
    admin_logout: { label: 'Logout', color: '#8b949e' },
    admin_login_failed: { label: 'Login failed', color: '#f85149' },
    cluster_confirmed: { label: 'Confirmed', color: '#3fb950' },
    cluster_rejected: { label: 'Rejected', color: '#f85149' },
    cluster_viewed: { label: 'Viewed', color: '#8b949e' },
    warning_all_clear: { label: 'All clear', color: '#d29922' },
    team_dispatched: { label: 'Dispatched', color: '#58a6ff' },
    partner_created: { label: 'Partner created', color: '#58a6ff' },
  }
  return map[action] ?? { label: action, color: '#8b949e' }
}

function latencyColour(ms: number): string {
  if (ms < 100) return '#3fb950'
  if (ms < 500) return '#d29922'
  return '#f85149'
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthCheck {
  name: string
  ok: boolean
  latency: number
  error?: string
  last_run?: string | null
  minutes_ago?: number | null
  last_cluster?: string | null
  hours_ago?: number | null
  last_report?: string | null
}

interface HealthData {
  status: string
  checks: HealthCheck[]
  checked_at: string
}

interface MetricsData {
  reports: {
    last_hour: number
    last_24h: number
    last_7d: number
    hourly_breakdown: Record<number, number>
  }
  clusters: {
    last_24h: number
    last_7d: number
    auto_confirmed_today: number
    rejected_today: number
    auto_confirm_rate: number
  }
}

interface AuditEntry {
  id: string
  created_at: string
  action: string
  entity_type: string
  entity_id: string | null
  admin_session: string | null
  ip_hash: string | null
  notes: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [actionSummary, setActionSummary] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const fetchAll = useCallback(async () => {
    try {
      const [hRes, mRes, aRes] = await Promise.all([
        fetch('/api/admin/health/system', { credentials: 'include' }),
        fetch('/api/admin/health/metrics', { credentials: 'include' }),
        fetch('/api/admin/audit?limit=20', { credentials: 'include' }),
      ])
      if (hRes.status === 401) { router.push('/admin/login'); return }
      const [hData, mData, aData] = await Promise.all([
        hRes.json(),
        mRes.json(),
        aRes.json(),
      ])
      setHealth(hData)
      setMetrics(mData)
      setAuditEntries(aData.entries ?? [])
      setActionSummary(aData.action_summary ?? {})
    } catch { /* ignore */ }
    setLoading(false)
  }, [router])

  useEffect(() => { fetchAll() }, [fetchAll])

  const refresh = async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <div>
        <style>{'@keyframes skeleton { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }'}</style>
        <div style={{ background: '#161b22', borderRadius: 8, height: 52, marginBottom: 16, animation: 'skeleton 1.5s infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ background: '#161b22', borderRadius: 8, height: 80, animation: 'skeleton 1.5s infinite' }} />
          ))}
        </div>
      </div>
    )
  }

  const statusConfig = {
    ok: {
      bg: 'rgba(63,185,80,0.06)',
      border: 'rgba(63,185,80,0.2)',
      color: '#3fb950',
      text: 'All systems operational',
    },
    degraded: {
      bg: 'rgba(210,153,34,0.06)',
      border: 'rgba(210,153,34,0.2)',
      color: '#d29922',
      text: 'Degraded — some systems affected',
    },
    critical: {
      bg: 'rgba(248,81,73,0.06)',
      border: 'rgba(248,81,73,0.2)',
      color: '#f85149',
      text: 'Critical — immediate attention required',
    },
  }

  const sc = statusConfig[(health?.status as keyof typeof statusConfig) ?? 'critical']

  const failedLogins = actionSummary.admin_login_failed ?? 0

  // Activity chart
  const hourly = metrics?.reports.hourly_breakdown ?? {}
  const hourValues = Array.from({ length: 24 }, (_, i) => hourly[i] ?? 0)
  const maxVal = Math.max(...hourValues, 1)

  const autoConfirmRate = metrics?.clusters.auto_confirm_rate ?? 0
  const rateColour = autoConfirmRate >= 70 ? '#3fb950' : autoConfirmRate >= 40 ? '#d29922' : '#f85149'

  return (
    <div>
      <style>{'@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }'}</style>

      {/* Overall status banner */}
      <div
        style={{
          background: sc.bg,
          border: '1px solid ' + sc.border,
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: sc.color,
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 600, color: sc.color, flex: 1 }}>
          {sc.text}
        </span>
        {health?.checked_at && (
          <span style={{ fontSize: 12, color: '#484f58', flexShrink: 0 }}>
            Last checked {timeAgo(health.checked_at)}
          </span>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          style={{
            height: 28,
            padding: '0 10px',
            background: 'transparent',
            border: '1px solid ' + sc.border,
            color: sc.color,
            borderRadius: 4,
            fontSize: 11,
            cursor: refreshing ? 'default' : 'pointer',
            fontFamily: 'system-ui',
            opacity: refreshing ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          {refreshing ? 'Refreshing...' : '\u21BA Refresh'}
        </button>
      </div>

      {/* Failed login warning */}
      {failedLogins > 0 && (
        <div
          style={{
            background: 'rgba(248,81,73,0.06)',
            border: '1px solid rgba(248,81,73,0.2)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
            color: '#f85149',
            marginBottom: 16,
          }}
        >
          {'\u26A0 ' + failedLogins + ' failed login attempt' + (failedLogins > 1 ? 's' : '') + ' today'}
        </div>
      )}

      {/* Checks grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {(health?.checks ?? []).map((check) => (
          <div
            key={check.name}
            style={{
              background: '#161b22',
              border: '1px solid ' + (check.ok ? '#21262d' : 'rgba(248,81,73,0.25)'),
              borderRadius: 8,
              padding: 14,
            }}
          >
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: check.ok ? '#3fb950' : '#f85149',
                  flexShrink: 0,
                  ...(check.ok ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>
                {check.name}
              </span>
            </div>

            {/* Latency */}
            {check.latency > 0 && (
              <div style={{ fontSize: 11, color: latencyColour(check.latency), marginBottom: 3 }}>
                {check.latency}ms
              </div>
            )}

            {/* Extra info */}
            {check.minutes_ago !== undefined && check.minutes_ago !== null && (
              <div
                style={{
                  fontSize: 11,
                  color: check.minutes_ago < 10 ? '#3fb950' : check.minutes_ago < 30 ? '#d29922' : '#f85149',
                }}
              >
                Last run {check.minutes_ago} minutes ago
              </div>
            )}
            {check.hours_ago !== undefined && check.hours_ago !== null && (
              <div style={{ fontSize: 11, color: '#484f58' }}>
                Last cluster {check.hours_ago} hours ago
              </div>
            )}
            {check.last_report && (
              <div style={{ fontSize: 11, color: '#484f58' }}>
                Last report {timeAgo(check.last_report)}
              </div>
            )}
            {check.error && (
              <div style={{ fontSize: 11, color: '#f85149', marginTop: 2 }}>
                {check.error}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Performance metrics */}
      {metrics && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', margin: '16px 0 12px' }}>
            Performance metrics
          </div>

          {/* Reports row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
            {[
              { label: 'Reports — last hour', value: metrics.reports.last_hour },
              { label: 'Reports — last 24h', value: metrics.reports.last_24h },
              { label: 'Reports — last 7 days', value: metrics.reports.last_7d },
            ].map((card) => (
              <div
                key={card.label}
                style={{
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 500, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          {/* Clusters row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Clusters — 24h', value: metrics.clusters.last_24h, color: '#e6edf3' },
              { label: 'Clusters — 7 days', value: metrics.clusters.last_7d, color: '#e6edf3' },
              { label: 'Auto-confirmed today', value: metrics.clusters.auto_confirmed_today, color: '#e6edf3' },
              { label: 'Auto-confirm rate', value: autoConfirmRate + '%', color: rateColour },
            ].map((card) => (
              <div
                key={card.label}
                style={{
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 500, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: card.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          {/* Activity chart */}
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>
            Report activity — last 24 hours
          </div>
          <div
            style={{
              background: '#161b22',
              border: '1px solid #21262d',
              borderRadius: 8,
              padding: '14px 14px 8px',
              marginBottom: 16,
            }}
          >
            <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
              {hourValues.map((count, i) => (
                <div
                  key={i}
                  title={i.toString().padStart(2, '0') + ':00 UTC — ' + count + ' reports'}
                  style={{
                    flex: 1,
                    height: count > 0 ? (count / maxVal) * 100 + '%' : 1,
                    minHeight: count > 0 ? 3 : 1,
                    background: '#ef4444',
                    opacity: 0.6 + (count / maxVal) * 0.4,
                    borderRadius: '2px 2px 0 0',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              {['00', '06', '12', '18', '00'].map((label, i) => (
                <span key={i} style={{ fontSize: 10, color: '#484f58' }}>{label}</span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Recent audit log */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', margin: '20px 0 12px' }}>
        Recent audit log
      </div>

      {auditEntries.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: '#484f58' }}>
          No audit entries yet
        </div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #21262d' }}>
                {['Time', 'Action', 'Type', 'Entity', 'Notes'].map((col) => (
                  <th
                    key={col}
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: '#484f58',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      padding: '0 0 10px',
                      textAlign: 'left',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((e) => {
                const al = actionLabel(e.action)
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #161b22' }}>
                    <td
                      style={{
                        padding: '8px 8px 8px 0',
                        fontSize: 11,
                        color: '#484f58',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatTimestamp(e.created_at)}
                    </td>
                    <td style={{ padding: '8px 8px 8px 0' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: al.color,
                          background:
                            al.color === '#3fb950'
                              ? 'rgba(63,185,80,0.1)'
                              : al.color === '#f85149'
                                ? 'rgba(248,81,73,0.1)'
                                : al.color === '#d29922'
                                  ? 'rgba(210,153,34,0.1)'
                                  : 'rgba(139,148,158,0.1)',
                          padding: '2px 7px',
                          borderRadius: 4,
                        }}
                      >
                        {al.label}
                      </span>
                    </td>
                    <td style={{ padding: '8px 8px 8px 0', fontSize: 11, color: '#8b949e' }}>
                      {e.entity_type}
                    </td>
                    <td
                      style={{
                        padding: '8px 8px 8px 0',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: '#484f58',
                      }}
                    >
                      {e.entity_id ? e.entity_id.slice(0, 8) + '...' : '\u2014'}
                    </td>
                    <td style={{ padding: '8px 0', fontSize: 11, color: '#8b949e' }}>
                      {e.notes ?? '\u2014'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Link to full audit */}
          <div
            onClick={() => router.push('/admin/audit')}
            style={{
              fontSize: 12,
              color: '#58a6ff',
              cursor: 'pointer',
              marginTop: 12,
            }}
          >
            View full audit log →
          </div>
        </>
      )}
    </div>
  )
}
