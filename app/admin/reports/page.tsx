'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MediaViewer from '../components/MediaViewer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawReport {
  id: string
  created_at: string
  lat: number
  lon: number
  distance_band: string
  event_types: string[]
  media_url: string | null
  media_status: string | null
  session_hash: string
  cluster_id: string | null
  status: string
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

const SHORT_DISTANCE: Record<string, string> = {
  under_500m: '< 500m',
  '500m_1km': '500m-1km',
  '1km_3km': '1-3km',
  over_3km: '> 3km',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const router = useRouter()
  const [reports, setReports] = useState<RawReport[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mediaOnly, setMediaOnly] = useState(false)
  const [page, setPage] = useState(0)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const url =
        '/api/admin/reports?limit=50&offset=' + page * 50 + (mediaOnly ? '&has_media=true' : '')
      const res = await fetch(url)
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = (await res.json()) as { reports: RawReport[]; total: number }
      setReports(data.reports ?? [])
      setTotal(data.total ?? 0)
    } catch { /* ignore */ }
    setLoading(false)
  }, [page, mediaOnly, router])

  useEffect(() => { fetchReports() }, [fetchReports])

  // Reset page when filter changes
  useEffect(() => { setPage(0) }, [mediaOnly])

  const totalPages = Math.max(1, Math.ceil(total / 50))

  return (
    <div>
      <style>{`
        @keyframes skeleton { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
      `}</style>

      {/* Top controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 13, color: '#8b949e' }}>{total} total reports</span>

        {/* Media only toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#8b949e' }}>Media only</span>
          <div
            onClick={() => setMediaOnly(!mediaOnly)}
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              background: mediaOnly ? '#f85149' : '#21262d',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: 'white',
                top: 3,
                left: mediaOnly ? 17 : 3,
                transition: 'left 0.2s',
              }}
            />
          </div>
        </div>
      </div>

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
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #21262d' }}>
                {['Time', 'Location', 'Distance', 'Events', 'Media', 'Session', 'Cluster'].map(
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
              {reports.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #161b22' }}>
                  <td style={{ padding: '10px 8px 10px 0', fontSize: 12, color: '#484f58' }}>
                    {timeAgo(r.created_at)}
                  </td>
                  <td style={{ padding: '10px 8px 10px 0', fontSize: 12, color: '#8b949e' }}>
                    {r.lat.toFixed(3) + ', ' + r.lon.toFixed(3)}
                  </td>
                  <td style={{ padding: '10px 8px 10px 0', fontSize: 12, color: '#8b949e' }}>
                    {SHORT_DISTANCE[r.distance_band] ?? r.distance_band}
                  </td>
                  <td style={{ padding: '10px 8px 10px 0' }}>
                    {r.event_types.length > 0 && (
                      <span
                        style={{
                          background: 'rgba(248,81,73,0.08)',
                          color: '#f85149',
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 3,
                        }}
                      >
                        {r.event_types[0].replace(/_/g, ' ')}
                      </span>
                    )}
                    {r.event_types.length > 1 && (
                      <span style={{ fontSize: 10, color: '#484f58', marginLeft: 3 }}>
                        +{r.event_types.length - 1}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px 10px 0' }}>
                    {r.media_url ? (
                      r.media_status === 'approved' ? (
                        <MediaViewer
                          mediaUrl={r.media_url}
                          mediaStatus={r.media_status}
                          lat={r.lat}
                          lon={r.lon}
                          createdAt={r.created_at}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            color: '#d29922',
                            background: 'rgba(210,153,34,0.1)',
                            padding: '2px 6px',
                            borderRadius: 3,
                          }}
                        >
                          Pending
                        </span>
                      )
                    ) : (
                      <span style={{ fontSize: 12, color: '#484f58' }}>—</span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '10px 8px 10px 0',
                      fontFamily: 'monospace',
                      fontSize: 10,
                      color: '#484f58',
                    }}
                  >
                    {r.session_hash.slice(0, 8)}...
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    {r.cluster_id ? (
                      <span
                        onClick={() => router.push('/admin/incidents')}
                        style={{
                          fontSize: 10,
                          color: '#3fb950',
                          background: 'rgba(63,185,80,0.1)',
                          padding: '2px 6px',
                          borderRadius: 3,
                          cursor: 'pointer',
                        }}
                      >
                        Clustered
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 10,
                          color: '#484f58',
                          background: 'rgba(139,148,158,0.1)',
                          padding: '2px 6px',
                          borderRadius: 3,
                        }}
                      >
                        Unclustered
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {reports.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#484f58' }}>
              No reports found
            </div>
          )}

          {/* Pagination */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
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
