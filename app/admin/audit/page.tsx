'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string
  created_at: string
  action: string
  entity_type: string
  entity_id: string | null
  admin_session: string | null
  ip_hash: string | null
  notes: string | null
  old_value: string | null
  new_value: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  }
  return map[action] ?? { label: action, color: '#8b949e' }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [daysFilter, setDaysFilter] = useState('30')
  const [searchText, setSearchText] = useState('')
  const [actionSummary, setActionSummary] = useState<Record<string, number>>({})

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: String(page * 50),
        days: daysFilter,
      })
      if (actionFilter) params.set('action', actionFilter)
      if (searchText) params.set('search', searchText)
      const res = await fetch('/api/admin/audit?' + params.toString())
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = (await res.json()) as { entries: AuditEntry[]; total: number; action_summary: Record<string, number> }
      setEntries(data.entries ?? [])
      setTotal(data.total ?? 0)
      setActionSummary(data.action_summary ?? {})
    } catch { /* ignore */ }
    setLoading(false)
  }, [page, actionFilter, daysFilter, searchText, router])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const totalPages = Math.max(1, Math.ceil(total / 50))

  // Summary counts from current page
  const logins = entries.filter((e) => e.action === 'admin_login').length
  const failedAttempts = entries.filter((e) => e.action === 'admin_login_failed').length
  const confirmed = entries.filter((e) => e.action === 'cluster_confirmed').length
  const rejected = entries.filter((e) => e.action === 'cluster_rejected').length

  const summaryCards = [
    { label: 'Logins', value: logins, color: '#3fb950' },
    { label: 'Failed attempts', value: failedAttempts, color: failedAttempts > 0 ? '#f85149' : '#e6edf3' },
    { label: 'Confirmed', value: confirmed, color: '#3fb950' },
    { label: 'Rejected', value: rejected, color: rejected > 0 ? '#f85149' : '#e6edf3' },
  ]

  const actionOptions = [
    { value: '', label: 'All actions' },
    { value: 'admin_login', label: 'Login' },
    { value: 'admin_logout', label: 'Logout' },
    { value: 'admin_login_failed', label: 'Login failed' },
    { value: 'cluster_confirmed', label: 'Confirmed' },
    { value: 'cluster_rejected', label: 'Rejected' },
    { value: 'media_approved', label: 'Media' },
  ]

  const daysOptions = [
    { value: '1', label: 'Last 24h' },
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: 'all', label: 'All time' },
  ]

  const selectStyle: React.CSSProperties = {
    height: 32,
    fontSize: 12,
    background: '#161b22',
    border: '1px solid #21262d',
    color: '#e6edf3',
    borderRadius: 5,
    padding: '0 10px',
    cursor: 'pointer',
    fontFamily: 'system-ui',
  }

  return (
    <div>
      <style>{`
        @keyframes skeleton { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
      `}</style>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
          style={selectStyle}
        >
          {actionOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={daysFilter}
          onChange={(e) => { setDaysFilter(e.target.value); setPage(0) }}
          style={selectStyle}
        >
          {daysOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(0); fetchEntries() } }}
          placeholder="Search notes..."
          style={{
            height: 32,
            fontSize: 12,
            flex: 1,
            minWidth: 150,
            background: '#161b22',
            border: '1px solid #21262d',
            color: '#e6edf3',
            borderRadius: 5,
            padding: '0 10px',
            fontFamily: 'system-ui',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={() => { setPage(0); fetchEntries() }}
          style={{
            height: 32,
            padding: '0 14px',
            background: 'rgba(88,166,255,0.08)',
            border: '1px solid rgba(88,166,255,0.2)',
            color: '#58a6ff',
            borderRadius: 5,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'system-ui',
          }}
        >
          Search
        </button>
      </div>

      {/* Action summary badges */}
      {Object.keys(actionSummary).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {Object.entries(actionSummary)
            .filter(([, count]) => count > 0)
            .map(([action, count]) => {
              const al = actionLabel(action)
              return (
                <span
                  key={action}
                  style={{
                    fontSize: 11,
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
                    padding: '3px 8px',
                    borderRadius: 4,
                  }}
                >
                  {al.label}: {count}
                </span>
              )
            })}
        </div>
      )}

      {/* Summary cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {summaryCards.map((card) => (
            <div
              key={card.label}
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#8b949e',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 4,
                }}
              >
                {card.label}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: card.color,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: '#161b22',
                borderRadius: 6,
                height: 40,
                animation: 'skeleton 1.5s infinite',
              }}
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#484f58' }}>
          No audit entries yet
        </div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #21262d' }}>
                {['Time', 'Action', 'Type', 'Entity', 'Session', 'IP', 'Notes'].map((col) => (
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
              {entries.map((e) => {
                const al = actionLabel(e.action)
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #161b22' }}>
                    <td
                      style={{
                        padding: '10px 8px 10px 0',
                        fontSize: 12,
                        color: '#484f58',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatTimestamp(e.created_at)}
                    </td>
                    <td style={{ padding: '10px 8px 10px 0' }}>
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
                    <td style={{ padding: '10px 8px 10px 0', fontSize: 12, color: '#8b949e' }}>
                      {e.entity_type}
                    </td>
                    <td
                      style={{
                        padding: '10px 8px 10px 0',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: '#484f58',
                      }}
                    >
                      {e.entity_id ? e.entity_id.slice(0, 8) + '...' : '—'}
                    </td>
                    <td
                      style={{
                        padding: '10px 8px 10px 0',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: '#484f58',
                      }}
                    >
                      {e.admin_session ?? '—'}
                    </td>
                    <td
                      style={{
                        padding: '10px 8px 10px 0',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: '#484f58',
                      }}
                    >
                      {e.ip_hash ?? '—'}
                    </td>
                    <td style={{ padding: '10px 0', fontSize: 12, color: '#8b949e' }}>
                      {e.notes ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Pagination */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 16,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              style={{
                height: 32,
                padding: '0 14px',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'system-ui',
                cursor: page === 0 ? 'default' : 'pointer',
                background: 'transparent',
                border: '1px solid #21262d',
                color: page === 0 ? '#484f58' : '#8b949e',
                opacity: page === 0 ? 0.5 : 1,
              }}
            >
              Prev
            </button>
            <span style={{ fontSize: 12, color: '#484f58' }}>Page {page + 1}</span>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{
                height: 32,
                padding: '0 14px',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'system-ui',
                cursor: page + 1 >= totalPages ? 'default' : 'pointer',
                background: 'transparent',
                border: '1px solid #21262d',
                color: page + 1 >= totalPages ? '#484f58' : '#8b949e',
                opacity: page + 1 >= totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
