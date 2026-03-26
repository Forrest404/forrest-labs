'use client'

import { useState, useEffect, useCallback, Suspense, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MediaViewer from '../components/MediaViewer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClusterSummary {
  id: string
  status: string
  confidence_score: number
  report_count: number
  centroid_lat: number
  centroid_lon: number
  location_name: string | null
  created_at: string
  updated_at: string | null
  dominant_event_types: string[]
  ai_reasoning: string | null
  ai_concerns: string[] | null
  display_radius_metres: number
  reviewed_by: string | null
  reviewed_at: string | null
}

interface ClusterReport {
  id: string
  created_at: string
  lat: number
  lon: number
  distance_band: string
  event_types: string[]
  media_url: string | null
  media_status: string | null
  session_hash: string
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

function confColour(score: number): string {
  if (score >= 85) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

function statusPill(status: string, large?: boolean): ReactElement {
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
        fontSize: large ? 12 : 11,
        fontWeight: 500,
        color: s.color,
        background: s.bg,
        padding: large ? '4px 10px' : '2px 7px',
        borderRadius: 4,
      }}
    >
      {s.label}
    </span>
  )
}

const DISTANCE_LABELS: Record<string, string> = {
  under_500m: 'Under 500m away',
  '500m_1km': '500m – 1km away',
  '1km_3km': '1 – 3km away',
  over_3km: 'Over 3km away',
}

const FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending_review' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Auto', value: 'auto_confirmed' },
  { label: 'Discarded', value: 'discarded' },
] as const

// ─── Inner component (uses useSearchParams) ──────────────────────────────────

function IncidentsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [clusters, setClusters] = useState<ClusterSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<ClusterSummary | null>(null)
  const [selectedReports, setSelectedReports] = useState<ClusterReport[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // Read filter from URL on mount
  useEffect(() => {
    const fp = searchParams.get('filter')
    if (fp === 'pending') setFilter('pending_review')
    else if (fp === 'confirmed' || fp === 'auto_confirmed' || fp === 'discarded') setFilter(fp)
  }, [searchParams])

  // Fetch clusters
  const fetchClusters = useCallback(async (f: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/incidents?filter=' + f + '&limit=50')
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = (await res.json()) as { clusters: ClusterSummary[]; total: number }
      setClusters(data.clusters ?? [])
      setTotal(data.total ?? 0)
    } catch { /* ignore */ }
    setLoading(false)
  }, [router])

  useEffect(() => { fetchClusters(filter) }, [filter, fetchClusters])

  // Fetch cluster detail
  async function fetchClusterDetail(id: string) {
    setDetailLoading(true)
    try {
      const res = await fetch('/api/admin/incidents/' + id)
      const data = (await res.json()) as { cluster: ClusterSummary; reports: ClusterReport[] }
      setSelected(data.cluster)
      setSelectedReports(data.reports ?? [])
    } catch { /* ignore */ }
    setDetailLoading(false)
  }

  // Approve/reject
  async function handleApprove() {
    if (!selected) return
    const key = process.env.NEXT_PUBLIC_REVIEW_SECRET ?? ''
    await fetch('/api/clusters/' + selected.id + '/approve?key=' + encodeURIComponent(key))
    setSelected(null)
    fetchClusters(filter)
  }

  async function handleReject() {
    if (!selected) return
    const key = process.env.NEXT_PUBLIC_REVIEW_SECRET ?? ''
    await fetch('/api/clusters/' + selected.id + '/reject?key=' + encodeURIComponent(key))
    setSelected(null)
    fetchClusters(filter)
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <style>{`
        @keyframes skeleton { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
      `}</style>

      {/* Left — cluster list */}
      <div
        style={{
          width: selected ? 420 : '100%',
          flexShrink: 0,
          borderRight: selected ? '1px solid #21262d' : 'none',
          overflowY: 'auto',
          padding: '0 16px 16px 0',
        }}
      >
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

        <div style={{ fontSize: 12, color: '#484f58', marginBottom: 10 }}>{total} incidents</div>

        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  background: '#161b22',
                  borderRadius: 6,
                  height: 72,
                  marginBottom: 6,
                  animation: 'skeleton 1.5s infinite',
                }}
              />
            ))
          : clusters.map((c) => (
              <div
                key={c.id}
                onClick={() => { setSelected(c); fetchClusterDetail(c.id) }}
                style={{
                  background: selected?.id === c.id ? 'rgba(248,81,73,0.06)' : '#161b22',
                  border:
                    selected?.id === c.id
                      ? '1px solid rgba(248,81,73,0.2)'
                      : '1px solid #21262d',
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 6,
                  cursor: 'pointer',
                }}
              >
                {/* Top line */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>
                    {c.location_name ?? c.centroid_lat.toFixed(3) + ', ' + c.centroid_lon.toFixed(3)}
                  </span>
                  {statusPill(c.status)}
                </div>
                {/* Middle */}
                <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>
                  <span style={{ color: confColour(c.confidence_score), fontWeight: 500 }}>
                    {c.confidence_score}%
                  </span>
                  <span style={{ margin: '0 6px' }}>·</span>
                  {c.report_count} reports
                </div>
                {/* Bottom */}
                <div style={{ fontSize: 12, color: '#484f58' }}>{timeAgo(c.created_at)}</div>
              </div>
            ))}

        {!loading && clusters.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#484f58' }}>
            No incidents found
          </div>
        )}
      </div>

      {/* Right — detail panel */}
      {selected && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#0d1117', minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>
                {selected.location_name ??
                  selected.centroid_lat.toFixed(3) + ', ' + selected.centroid_lon.toFixed(3)}
              </div>
              <div style={{ fontSize: 12, color: '#484f58' }}>{timeAgo(selected.created_at)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {statusPill(selected.status, true)}
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{
                  width: 28,
                  height: 28,
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: '50%',
                  color: '#8b949e',
                  cursor: 'pointer',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Data grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Confidence', value: selected.confidence_score + '%', color: confColour(selected.confidence_score) },
              { label: 'Reports', value: String(selected.report_count), color: '#e6edf3' },
              { label: 'Radius', value: selected.display_radius_metres + 'm', color: '#e6edf3' },
              { label: 'Location', value: selected.centroid_lat.toFixed(4) + ', ' + selected.centroid_lon.toFixed(4), color: '#e6edf3' },
            ].map((cell) => (
              <div
                key={cell.label}
                style={{
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: 6,
                  padding: '10px 12px',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: '#484f58',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 4,
                  }}
                >
                  {cell.label}
                </div>
                <div style={{ fontSize: 14, color: cell.color, fontWeight: 500 }}>{cell.value}</div>
              </div>
            ))}
          </div>

          {/* AI reasoning */}
          {selected.ai_reasoning && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#484f58',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 8,
                }}
              >
                AI assessment
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#8b949e',
                  lineHeight: 1.6,
                  background: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                {selected.ai_reasoning}
              </div>
            </div>
          )}

          {/* AI concerns */}
          {selected.ai_concerns && selected.ai_concerns.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#484f58',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 8,
                }}
              >
                Concerns flagged
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selected.ai_concerns.map((concern) => (
                  <span
                    key={concern}
                    style={{
                      background: 'rgba(210,153,34,0.1)',
                      border: '1px solid rgba(210,153,34,0.2)',
                      color: '#d29922',
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 20,
                    }}
                  >
                    {concern}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Approve/Reject */}
          {selected.status === 'pending_review' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                onClick={handleApprove}
                style={{
                  flex: 1,
                  height: 36,
                  background: 'rgba(63,185,80,0.1)',
                  border: '1px solid rgba(63,185,80,0.3)',
                  color: '#3fb950',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                }}
              >
                Confirm incident
              </button>
              <button
                type="button"
                onClick={handleReject}
                style={{
                  flex: 1,
                  height: 36,
                  background: 'rgba(248,81,73,0.08)',
                  border: '1px solid rgba(248,81,73,0.2)',
                  color: '#f85149',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                }}
              >
                Reject
              </button>
            </div>
          )}

          {/* Individual reports */}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', marginBottom: 8 }}>
            Individual reports ({selectedReports.length})
          </div>

          {detailLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    background: '#161b22',
                    borderRadius: 6,
                    height: 60,
                    marginBottom: 6,
                    animation: 'skeleton 1.5s infinite',
                  }}
                />
              ))
            : selectedReports.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: '#161b22',
                    border: '1px solid #21262d',
                    borderRadius: 6,
                    padding: '10px 12px',
                    marginBottom: 6,
                  }}
                >
                  {/* Top — event pills + time */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {r.event_types.map((et) => (
                        <span
                          key={et}
                          style={{
                            background: 'rgba(248,81,73,0.08)',
                            color: '#f85149',
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 3,
                          }}
                        >
                          {et.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: '#484f58', flexShrink: 0, marginLeft: 8 }}>
                      {timeAgo(r.created_at)}
                    </span>
                  </div>

                  {/* Distance */}
                  <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>
                    {DISTANCE_LABELS[r.distance_band] ?? r.distance_band}
                  </div>

                  {/* Media */}
                  {r.media_url && (
                    <MediaViewer
                      mediaUrl={r.media_url}
                      mediaStatus={r.media_status ?? 'pending'}
                      lat={r.lat}
                      lon={r.lon}
                      createdAt={r.created_at}
                    />
                  )}

                  {/* Location */}
                  <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>
                    {r.lat.toFixed(3) + ', ' + r.lon.toFixed(3)}
                  </div>

                  {/* Session hash */}
                  <div style={{ fontSize: 10, color: '#484f58', marginTop: 2 }}>
                    Session: {r.session_hash.slice(0, 12)}...
                  </div>
                </div>
              ))}
        </div>
      )}
    </div>
  )
}

// ─── Page wrapper with Suspense ──────────────────────────────────────────────

export default function IncidentsPage() {
  return (
    <Suspense>
      <IncidentsInner />
    </Suspense>
  )
}
