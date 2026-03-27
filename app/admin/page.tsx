'use client'

import { useState, useEffect, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsArticle {
  id: string
  title: string
  source: string
  url: string
  event_type: string
  location_name: string | null
  casualty_count: number | null
  ai_relevance_score: number
  linked_cluster_id: string | null
  fetched_at: string
}

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
  const [news, setNews] = useState<NewsArticle[]>([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [newsRefreshing, setNewsRefreshing] = useState(false)
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

    fetch('/api/admin/news?limit=10')
      .then((r) => r.json())
      .then((d: { articles?: NewsArticle[] }) => {
        setNews(d.articles ?? [])
        setNewsLoading(false)
      })
      .catch(() => setNewsLoading(false))

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
            onClick={() => router.push('/admin/triage')}
            style={{
              fontSize: 13,
              color: '#f85149',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              fontFamily: 'system-ui',
              fontWeight: 500,
            }}
          >
            Review {stats.clusters.pending_review} pending cluster{stats.clusters.pending_review !== 1 ? 's' : ''} →
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

      {/* System health row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '8px 12px', background: '#161b22', border: '1px solid #21262d', borderRadius: 6 }}>
        {(() => {
          const recentCluster = stats.recent_clusters[0]
          const aiMinAgo = recentCluster ? Math.floor((Date.now() - new Date(recentCluster.created_at).getTime()) / 60000) : null
          const aiOk = aiMinAgo !== null && aiMinAgo < 120
          const reportsOk = stats.reports.today > 0
          const newsRecent = news.length > 0 ? Math.floor((Date.now() - new Date(news[0].fetched_at).getTime()) / 60000) : null
          const newsOk = newsRecent !== null && newsRecent < 30

          return [
            { dot: aiOk ? '#3fb950' : '#d29922', label: 'AI Analyst', status: aiMinAgo !== null ? (aiOk ? `Last ran ${aiMinAgo}m ago` : 'Check edge function') : 'No data' },
            { dot: reportsOk ? '#3fb950' : '#484f58', label: 'Report pipeline', status: reportsOk ? `${stats.reports.today} reports today` : 'No reports today' },
            { dot: newsOk ? '#3fb950' : '#d29922', label: 'News feed', status: newsRecent !== null ? (newsOk ? `Updated ${newsRecent}m ago` : 'Refresh manually') : 'No articles' },
          ].map((ind) => (
            <div key={ind.label} style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ind.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#8b949e', fontWeight: 500 }}>{ind.label}</span>
              <span style={{ fontSize: 11, color: '#484f58' }}>{ind.status}</span>
            </div>
          ))
        })()}
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
              {['Location', 'Confidence', 'Reports', 'Status', 'Time', ''].map((col) => (
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
                <td style={{ padding: '10px 0', textAlign: 'right' }}>
                  <span style={{ fontSize: 11, color: '#58a6ff', opacity: hoveredRow === cluster.id ? 1 : 0, transition: 'opacity 0.15s' }}>Review</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Intelligence feed ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '20px 0 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Intelligence feed</span>
          <span
            style={{
              background: 'rgba(163,113,247,0.1)',
              border: '1px solid rgba(163,113,247,0.2)',
              color: '#a371f7',
              fontSize: 9,
              padding: '2px 7px',
              borderRadius: 20,
              fontWeight: 600,
              marginLeft: 8,
            }}
          >
            LIVE
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={async () => {
              setNewsRefreshing(true)
              try {
                await fetch('/api/admin/news/fetch', { method: 'POST' })
                const r = await fetch('/api/admin/news?limit=10')
                const d = (await r.json()) as { articles?: NewsArticle[] }
                setNews(d.articles ?? [])
              } catch { /* ignore */ }
              setNewsRefreshing(false)
            }}
            style={{
              height: 26,
              fontSize: 11,
              background: 'rgba(163,113,247,0.08)',
              border: '1px solid rgba(163,113,247,0.2)',
              color: '#a371f7',
              borderRadius: 5,
              cursor: 'pointer',
              padding: '0 10px',
              fontFamily: 'system-ui',
            }}
          >
            {newsRefreshing ? 'Refreshing...' : 'Refresh feed'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/intelligence')}
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
      </div>

      {newsLoading || news.length === 0 ? (
        <div
          style={{
            background: '#161b22',
            border: '1px solid #21262d',
            borderRadius: 6,
            padding: 20,
            textAlign: 'center',
            fontSize: 13,
            color: '#484f58',
          }}
        >
          {newsLoading ? 'Fetching intelligence feed...' : 'No articles yet'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {news.map((article) => {
            const accentColors: Record<string, string> = {
              airstrike: '#f85149',
              evacuation: '#d29922',
              casualties: '#f85149',
              warning: '#d29922',
              ground_operation: '#a371f7',
            }
            const accent = accentColors[article.event_type] ?? '#484f58'

            const sourceStyles: Record<string, { bg: string; color: string }> = {
              'Al Jazeera': { bg: 'rgba(248,81,73,0.1)', color: '#f85149' },
              BBC: { bg: 'rgba(88,166,255,0.1)', color: '#58a6ff' },
              Reuters: { bg: 'rgba(63,185,80,0.1)', color: '#3fb950' },
              'UN OCHA': { bg: 'rgba(163,113,247,0.1)', color: '#a371f7' },
            }
            const src = sourceStyles[article.source] ?? {
              bg: 'rgba(139,148,158,0.1)',
              color: '#8b949e',
            }

            const score = article.ai_relevance_score
            const relevanceColor = score >= 0.7 ? '#3fb950' : score >= 0.4 ? '#d29922' : '#484f58'

            return (
              <div
                key={article.id}
                style={{
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: 6,
                  padding: '10px 12px',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                {/* Accent bar */}
                <div
                  style={{
                    width: 4,
                    alignSelf: 'stretch',
                    background: accent,
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Top line */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 3,
                        background: src.bg,
                        color: src.color,
                      }}
                    >
                      {article.source}
                    </span>
                    <span style={{ fontSize: 11, color: '#484f58' }}>
                      {timeAgo(article.fetched_at)}
                    </span>
                  </div>

                  {/* Title */}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#e6edf3',
                      lineHeight: 1.4,
                      margin: '4px 0',
                    }}
                  >
                    {article.linked_cluster_id && (
                      <span style={{ color: '#3fb950', fontSize: 8, marginRight: 4 }}>●</span>
                    )}
                    {article.title}
                  </div>

                  {/* Bottom line */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {article.location_name && (
                      <span style={{ fontSize: 11, color: '#8b949e' }}>
                        · {article.location_name}
                      </span>
                    )}
                    {article.casualty_count != null && article.casualty_count > 0 && (
                      <span style={{ fontSize: 11, color: '#f85149' }}>
                        {article.casualty_count} casualties
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: relevanceColor }}>
                      {Math.round(score * 100)}% relevant
                    </span>
                  </div>

                  {/* Matched badge */}
                  {article.linked_cluster_id && (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 4,
                        background: 'rgba(63,185,80,0.08)',
                        border: '1px solid rgba(63,185,80,0.15)',
                        color: '#3fb950',
                        fontSize: 10,
                        padding: '2px 8px',
                        borderRadius: 3,
                      }}
                    >
                      Matched to incident
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
