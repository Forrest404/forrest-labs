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

function getApproxLocation(lat: number, lon: number): string {
  if (lat > 33.7 && lat < 34.0 && lon > 35.4 && lon < 35.6) return 'Beirut area'
  if (lat > 33.1 && lat < 33.5 && lon > 35.0 && lon < 35.5) return 'South Lebanon — coastal'
  if (lat > 33.1 && lat < 33.5 && lon > 35.4 && lon < 35.7) return 'South Lebanon — inland'
  if (lat > 33.5 && lat < 33.8 && lon > 35.2 && lon < 35.5) return 'Sidon area'
  if (lat > 33.7 && lat < 34.2 && lon > 35.8 && lon < 36.5) return 'Bekaa Valley'
  if (lat > 33.8 && lat < 34.2 && lon > 35.9 && lon < 36.5) return 'Baalbek area'
  return lat.toFixed(2) + ', ' + lon.toFixed(2)
}

function isVideo(url: string): boolean {
  return url.includes('.mp4') || url.includes('.mov') || url.includes('.webm')
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaReport {
  id: string
  created_at: string
  lat: number
  lon: number
  media_url: string
  media_status: string
  distance_band: string
  event_types: string[]
  session_hash: string
  cluster_id: string | null
  clusters: {
    id: string
    location_name: string
    status: string
    confidence_score: number
  } | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MediaPage() {
  const [reports, setReports] = useState<MediaReport[]>([])
  const [counts, setCounts] = useState({ pending: 0, approved: 0 })
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const router = useRouter()

  const fetchMedia = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/media?status=' + filter)
      .then((r) => {
        if (r.status === 401) { router.push('/admin/login'); return null }
        return r.json()
      })
      .then((d) => {
        if (!d) return
        setReports(d.reports ?? [])
        setCounts({
          pending: d.pending_count ?? 0,
          approved: d.approved_count ?? 0,
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [filter, router])

  useEffect(() => { fetchMedia() }, [fetchMedia])

  const handleApprove = (id: string) => {
    fetch('/api/admin/media/' + id + '/approve', {
      method: 'POST',
      credentials: 'include',
    }).then(() => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, media_status: 'approved' } : r,
        ),
      )
      setCounts((prev) => ({
        pending: prev.pending - 1,
        approved: prev.approved + 1,
      }))
    })
  }

  const handleReject = (id: string) => {
    fetch('/api/admin/media/' + id + '/reject', {
      method: 'POST',
      credentials: 'include',
    }).then(() => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, media_status: 'rejected' } : r,
        ),
      )
      setCounts((prev) => ({
        ...prev,
        pending: prev.pending - 1,
      }))
    })
  }

  const expandedReport = expanded
    ? reports.find((r) => r.id === expanded) ?? null
    : null

  const filters = ['all', 'pending', 'approved', 'rejected'] as const

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          <span
            style={{
              background: 'rgba(210,153,34,0.1)',
              color: '#d29922',
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 12,
            }}
          >
            {counts.pending} pending
          </span>
          <span
            style={{
              background: 'rgba(63,185,80,0.1)',
              color: '#3fb950',
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 12,
            }}
          >
            {counts.approved} approved
          </span>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                height: 30,
                padding: '0 12px',
                fontSize: 12,
                fontWeight: filter === f ? 500 : 400,
                color: filter === f ? '#e6edf3' : '#8b949e',
                background: filter === f ? 'rgba(248,81,73,0.1)' : 'transparent',
                border: '1px solid ' + (filter === f ? 'rgba(248,81,73,0.2)' : '#21262d'),
                borderRadius: 5,
                cursor: 'pointer',
                fontFamily: 'system-ui',
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ color: '#484f58', fontSize: 13, textAlign: 'center', padding: 40 }}>
          Loading media...
        </div>
      )}

      {/* Empty state */}
      {!loading && reports.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: 14, color: '#8b949e', marginBottom: 6 }}>
            No media submissions yet
          </div>
          <div style={{ fontSize: 12, color: '#484f58' }}>
            Photos and videos submitted by civilians will appear here for review
          </div>
        </div>
      )}

      {/* Media grid */}
      {!loading && reports.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {reports.map((report) => (
            <div
              key={report.id}
              style={{
                background: '#161b22',
                border:
                  '1px solid ' +
                  (report.media_status === 'pending'
                    ? 'rgba(210,153,34,0.25)'
                    : report.media_status === 'approved'
                      ? 'rgba(63,185,80,0.15)'
                      : '#21262d'),
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {/* Media preview */}
              <div
                onClick={() => setExpanded(report.id)}
                style={{
                  height: 180,
                  position: 'relative',
                  background: '#0d1117',
                  cursor: 'pointer',
                }}
              >
                {isVideo(report.media_url) ? (
                  <>
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.1)',
                          border: '2px solid rgba(255,255,255,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16">
                          <polygon points="5,3 13,8 5,13" fill="white" />
                        </svg>
                      </div>
                    </div>
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 8,
                        left: 8,
                        background: 'rgba(0,0,0,0.6)',
                        color: 'white',
                        fontSize: 10,
                        padding: '2px 7px',
                        borderRadius: 3,
                      }}
                    >
                      Video
                    </span>
                  </>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={report.media_url}
                    alt="Report media"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}

                {/* Status badge */}
                <span
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    fontSize: 10,
                    padding: '2px 7px',
                    borderRadius: 3,
                    fontWeight: 600,
                    ...(report.media_status === 'pending'
                      ? { background: 'rgba(210,153,34,0.2)', color: '#d29922' }
                      : report.media_status === 'approved'
                        ? { background: 'rgba(63,185,80,0.2)', color: '#3fb950' }
                        : { background: 'rgba(139,148,158,0.2)', color: '#8b949e' }),
                  }}
                >
                  {report.media_status === 'pending'
                    ? 'Pending'
                    : report.media_status === 'approved'
                      ? 'Approved'
                      : 'Rejected'}
                </span>
              </div>

              {/* Card body */}
              <div style={{ padding: '10px 12px' }}>
                {/* Location */}
                <div style={{ fontSize: 12, color: '#8b949e' }}>
                  {getApproxLocation(report.lat, report.lon)}
                </div>

                {/* Event types */}
                {report.event_types && report.event_types.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {report.event_types.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 10,
                          background: 'rgba(248,81,73,0.1)',
                          color: '#f85149',
                          padding: '1px 6px',
                          borderRadius: 3,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Time */}
                <div style={{ fontSize: 11, color: '#484f58', marginTop: 4 }}>
                  {timeAgo(report.created_at)}
                </div>

                {/* Cluster link */}
                {report.cluster_id && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push('/admin/incidents/' + report.cluster_id)
                    }}
                    style={{
                      fontSize: 11,
                      color: '#58a6ff',
                      cursor: 'pointer',
                      marginTop: 4,
                    }}
                  >
                    → Linked to incident
                  </div>
                )}

                {/* Action buttons */}
                {report.media_status === 'pending' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleApprove(report.id)
                      }}
                      style={{
                        flex: 1,
                        height: 30,
                        background: 'rgba(63,185,80,0.1)',
                        border: '1px solid rgba(63,185,80,0.25)',
                        color: '#3fb950',
                        borderRadius: 5,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'system-ui',
                      }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReject(report.id)
                      }}
                      style={{
                        width: 60,
                        height: 30,
                        background: 'transparent',
                        border: '1px solid rgba(248,81,73,0.2)',
                        color: '#f85149',
                        borderRadius: 5,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'system-ui',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expanded viewer */}
      {expandedReport && (
        <div
          onClick={() => setExpanded(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setExpanded(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              color: 'white',
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>

          {/* Media */}
          <div onClick={(e) => e.stopPropagation()}>
            {isVideo(expandedReport.media_url) ? (
              <video
                src={expandedReport.media_url}
                controls
                autoPlay
                style={{
                  maxWidth: '90vw',
                  maxHeight: '75vh',
                  borderRadius: 8,
                }}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={expandedReport.media_url}
                alt="Report media expanded"
                style={{
                  maxWidth: '90vw',
                  maxHeight: '75vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                }}
              />
            )}
          </div>

          {/* Info bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(13,17,23,0.95)',
              padding: '12px 20px',
              borderRadius: '0 0 8px 8px',
              display: 'flex',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            {[
              {
                label: 'Location',
                value: getApproxLocation(expandedReport.lat, expandedReport.lon),
                color: '#e6edf3',
              },
              {
                label: 'Event types',
                value: (expandedReport.event_types ?? []).join(', ') || 'Unknown',
                color: '#e6edf3',
              },
              {
                label: 'Time',
                value: timeAgo(expandedReport.created_at),
                color: '#e6edf3',
              },
              {
                label: 'Verification',
                value:
                  expandedReport.media_status === 'approved'
                    ? 'Approved — faces blurred'
                    : expandedReport.media_status === 'rejected'
                      ? 'Rejected'
                      : 'Pending review',
                color:
                  expandedReport.media_status === 'approved'
                    ? '#3fb950'
                    : expandedReport.media_status === 'rejected'
                      ? '#f85149'
                      : '#d29922',
              },
            ].map((item) => (
              <div key={item.label}>
                <div
                  style={{
                    fontSize: 10,
                    color: '#484f58',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 2,
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: 13, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Privacy note */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 11,
              color: '#484f58',
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            Exact coordinates not shown to protect reporter privacy
          </div>
        </div>
      )}
    </div>
  )
}
