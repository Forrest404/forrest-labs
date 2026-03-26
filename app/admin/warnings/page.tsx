'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WarningCluster {
  id: string
  created_at: string
  status: string
  centroid_lat: number
  centroid_lon: number
  warning_count: number
  dominant_warning_type: string
  confidence_score: number
  location_name: string | null
  expires_at: string | null
  all_clear_votes: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confColour(score: number): string {
  if (score >= 85) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

function formatWarningType(type: string): string {
  const map: Record<string, string> = {
    official_order: 'Official order',
    phone_call: 'Phone call',
    leaflet_drop: 'Leaflet drop',
    community_warning: 'Community',
    other: 'Other',
  }
  return map[type] ?? type
}

function formatExpiry(expiresAt: string | null): { text: string; color: string } {
  if (!expiresAt) return { text: '—', color: '#484f58' }
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', color: '#484f58' }
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return { text: h + 'h ' + m + 'm left', color: '#d29922' }
  return { text: m + 'm left', color: '#f85149' }
}

function statusStyle(status: string): { bg: string; color: string; label: string } {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: 'rgba(210,153,34,0.1)', color: '#d29922', label: 'Active' },
    all_clear: { bg: 'rgba(63,185,80,0.1)', color: '#3fb950', label: 'All clear' },
    expired: { bg: 'rgba(139,148,158,0.1)', color: '#484f58', label: 'Expired' },
    strike_confirmed: { bg: 'rgba(248,81,73,0.1)', color: '#f85149', label: 'Became strike' },
    discarded: { bg: 'rgba(139,148,158,0.1)', color: '#484f58', label: 'Discarded' },
  }
  return map[status] ?? { bg: 'rgba(139,148,158,0.1)', color: '#484f58', label: status }
}

const FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'All clear', value: 'all_clear' },
  { label: 'Expired', value: 'expired' },
] as const

// ─── Component ────────────────────────────────────────────────────────────────

export default function WarningsPage() {
  const router = useRouter()
  const [warnings, setWarnings] = useState<WarningCluster[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    async function fetchWarnings() {
      try {
        const res = await fetch('/api/admin/warnings-list')
        if (res.status === 401) { router.push('/admin/login'); return }
        const data = (await res.json()) as { warnings: WarningCluster[]; total: number }
        setWarnings(data.warnings ?? [])
      } catch { /* ignore */ }
      setLoading(false)
    }
    fetchWarnings()
  }, [router])

  const filtered =
    filter === 'all'
      ? warnings
      : warnings.filter((w) => {
          if (filter === 'expired') {
            return w.status !== 'active' && w.status !== 'all_clear'
          }
          return w.status === filter
        })

  return (
    <div>
      <style>{`
        @keyframes skeleton { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
      `}</style>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            style={{
              height: 28,
              padding: '0 12px',
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'system-ui',
              background: filter === tab.value ? 'rgba(248,81,73,0.1)' : 'transparent',
              border:
                filter === tab.value
                  ? '1px solid rgba(248,81,73,0.3)'
                  : '1px solid #21262d',
              color: filter === tab.value ? '#f85149' : '#8b949e',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 6 }).map((_, i) => (
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
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#484f58' }}>
          No warning clusters yet
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #21262d' }}>
              {['Location', 'Reports', 'Type', 'Confidence', 'Expires', 'Status', 'All clear'].map(
                (col) => (
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
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => {
              const expiry = formatExpiry(w.expires_at)
              const sts = statusStyle(w.status)
              return (
                <tr key={w.id} style={{ borderBottom: '1px solid #161b22' }}>
                  <td style={{ padding: '10px 8px 10px 0', fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>
                    {w.location_name ?? w.centroid_lat.toFixed(3) + ', ' + w.centroid_lon.toFixed(3)}
                  </td>
                  <td style={{ padding: '10px 8px 10px 0', fontSize: 12, color: '#8b949e' }}>
                    {w.warning_count}
                  </td>
                  <td style={{ padding: '10px 8px 10px 0' }}>
                    <span
                      style={{
                        background: 'rgba(210,153,34,0.1)',
                        border: '1px solid rgba(210,153,34,0.2)',
                        color: '#d29922',
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 3,
                      }}
                    >
                      {formatWarningType(w.dominant_warning_type)}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '10px 8px 10px 0',
                      fontSize: 12,
                      fontWeight: 500,
                      color: confColour(w.confidence_score),
                    }}
                  >
                    {w.confidence_score}%
                  </td>
                  <td style={{ padding: '10px 8px 10px 0', fontSize: 12, color: expiry.color }}>
                    {expiry.text}
                  </td>
                  <td style={{ padding: '10px 8px 10px 0' }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: sts.color,
                        background: sts.bg,
                        padding: '2px 7px',
                        borderRadius: 4,
                      }}
                    >
                      {sts.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: '#484f58' }}>{w.all_clear_votes} / 5</span>
                      <div
                        style={{
                          width: 40,
                          height: 3,
                          borderRadius: 2,
                          background: '#21262d',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: Math.min(w.all_clear_votes / 5, 1) * 100 + '%',
                            height: '100%',
                            background: '#3fb950',
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
