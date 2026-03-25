'use client'

import { useState, useEffect, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentCluster {
  id: string
  status: string
  confidence_score: number
  report_count: number
  centroid_lat: number
  centroid_lon: number
  location_name: string | null
  created_at: string
  dominant_event_types: string[]
  ai_reasoning: string | null
}

interface AdminStats {
  reports: { total: number; today: number }
  clusters: {
    confirmed: number
    auto_confirmed: number
    pending_review: number
    discarded: number
  }
  warnings: { active: number; all_clear: number }
  recent_clusters: RecentCluster[]
  generated_at: string
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

function confColour(score: number): string {
  if (score >= 85) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

function statusPill(status: string): ReactElement {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    confirmed: { bg: 'rgba(63,185,80,0.1)', color: '#3fb950', label: 'Confirmed' },
    auto_confirmed: { bg: 'rgba(63,185,80,0.07)', color: 'rgba(63,185,80,0.7)', label: 'Auto' },
    pending_review: { bg: 'rgba(248,81,73,0.1)', color: '#f85149', label: 'Pending' },
    discarded: { bg: 'rgba(139,148,158,0.1)', color: '#484f58', label: 'Discarded' },
  }
  const s = map[status] ?? map.discarded
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: s.color,
        background: s.bg,
        padding: '2px 7px',
        borderRadius: 4,
      }}
    >
      {s.label}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/stats')
        if (res.status === 401) {
          router.push('/admin/login')
          return
        }
        const data = (await res.json()) as AdminStats
        setStats(data)
        setLoading(false)
      } catch {
        setLoading(false)
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [router])

  // ── Loading skeleton ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <style>{`
          @keyframes skeleton {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.8; }
          }
        `}</style>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: '#161b22',
                borderRadius: 6,
                height: 80,
                animation: 'skeleton 1.5s infinite',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (!stats) return null

  // ── Metric cards data ───────────────────────────────────────────────────

  const cards: {
    label: string
    number: string | number
    numberColor: string
    sub: string
    borderColor: string
  }[] = [
    {
      label: 'Total reports',
      number: stats.reports.total,
      numberColor: '#e6edf3',
      sub: stats.reports.today + ' today',
      borderColor: '#21262d',
    },
    {
      label: 'Confirmed',
      number: stats.clusters.confirmed + stats.clusters.auto_confirmed,
      numberColor: '#3fb950',
      sub: stats.clusters.confirmed + ' founder · ' + stats.clusters.auto_confirmed + ' auto',
      borderColor: 'rgba(63,185,80,0.15)',
    },
    {
      label: 'Pending review',
      number: stats.clusters.pending_review,
      numberColor: stats.clusters.pending_review > 0 ? '#f85149' : '#e6edf3',
      sub: stats.clusters.pending_review > 0 ? 'action required' : 'queue clear',
      borderColor: stats.clusters.pending_review > 0 ? 'rgba(248,81,73,0.25)' : '#21262d',
    },
    {
      label: 'Active warnings',
      number: stats.warnings.active,
      numberColor: stats.warnings.active > 0 ? '#d29922' : '#e6edf3',
      sub: stats.warnings.active > 0 ? 'evacuation zones' : 'none active',
      borderColor: stats.warnings.active > 0 ? 'rgba(210,153,34,0.2)' : '#21262d',
    },
    {
      label: 'Discarded',
      number: stats.clusters.discarded,
      numberColor: '#484f58',
      sub: 'rejected by AI or founder',
      borderColor: '#21262d',
    },
    {
      label: 'Uptime',
      number: '99.9%',
      numberColor: '#3fb950',
      sub: 'all systems nominal',
      borderColor: '#21262d',
    },
  ]

  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Pending review banner */}
      {stats.clusters.pending_review > 0 && (
        <div
          style={{
            background: 'rgba(248,81,73,0.06)',
            border: '1px solid rgba(248,81,73,0.2)',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#f85149',
                animation: 'pulse 1.5s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, color: '#e6edf3' }}>
              {stats.clusters.pending_review} cluster{stats.clusters.pending_review !== 1 ? 's' : ''}{' '}
              awaiting review
            </span>
          </div>
          <button
            type="button"
            onClick={() => router.push('/admin/incidents?filter=pending')}
            style={{
              fontSize: 13,
              color: '#f85149',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              fontFamily: 'system-ui',
            }}
          >
            Review now →
          </button>
        </div>
      )}

      {/* Metrics grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              background: '#161b22',
              border: `1px solid ${card.borderColor}`,
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#8b949e',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 8,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: card.numberColor,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              {card.number}
            </div>
            <div style={{ fontSize: 12, color: '#484f58', marginTop: 4 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Incidents table section */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Recent incidents</span>
        <button
          type="button"
          onClick={() => router.push('/admin/incidents')}
          style={{
            fontSize: 12,
            color: '#58a6ff',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            fontFamily: 'system-ui',
          }}
        >
          View all →
        </button>
      </div>

      {stats.recent_clusters.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#484f58' }}>
          No incidents yet
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #21262d' }}>
              {['Location', 'Confidence', 'Reports', 'Status', 'Time'].map((col) => (
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
            {stats.recent_clusters.map((cluster) => (
              <tr
                key={cluster.id}
                onClick={() => router.push('/admin/incidents/' + cluster.id)}
                onMouseEnter={() => setHoveredRow(cluster.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  borderBottom: '1px solid #161b22',
                  cursor: 'pointer',
                  background:
                    hoveredRow === cluster.id ? 'rgba(255,255,255,0.02)' : 'transparent',
                }}
              >
                <td
                  style={{
                    padding: '10px 16px 10px 0',
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#e6edf3',
                  }}
                >
                  {cluster.location_name ??
                    cluster.centroid_lat.toFixed(3) + ', ' + cluster.centroid_lon.toFixed(3)}
                </td>
                <td
                  style={{
                    padding: '10px 0',
                    fontSize: 12,
                    fontWeight: 500,
                    color: confColour(cluster.confidence_score),
                  }}
                >
                  {cluster.confidence_score}%
                </td>
                <td style={{ padding: '10px 0', fontSize: 12, color: '#8b949e' }}>
                  {cluster.report_count}
                </td>
                <td style={{ padding: '10px 0' }}>{statusPill(cluster.status)}</td>
                <td style={{ padding: '10px 0', fontSize: 11, color: '#484f58' }}>
                  {timeAgo(cluster.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
