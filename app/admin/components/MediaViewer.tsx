'use client'

import { useState } from 'react'

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface MediaViewerProps {
  mediaUrl: string
  mediaStatus: string
  lat: number
  lon: number
  createdAt: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MediaViewer({ mediaUrl, mediaStatus, lat, lon, createdAt }: MediaViewerProps) {
  const [expanded, setExpanded] = useState(false)
  const isVideo =
    mediaUrl.includes('.mp4') || mediaUrl.includes('.mov') || mediaUrl.includes('.webm')

  const approxLocation = getApproxLocation(lat, lon)

  return (
    <>
      {/* Compact view */}
      <div
        onClick={() => setExpanded(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 8,
          background: '#161b22',
          border: '1px solid #21262d',
          borderRadius: 6,
          cursor: 'pointer',
          marginTop: 8,
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 4,
            overflow: 'hidden',
            flexShrink: 0,
            background: '#0d1117',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isVideo ? (
            <svg width="16" height="16" viewBox="0 0 16 16">
              <polygon points="4,2 14,8 4,14" fill="#e6edf3" />
            </svg>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mediaUrl}
              alt="Report media"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>

        {/* Info */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#e6edf3' }}>
            {isVideo ? 'Video' : 'Photo'}
          </div>
          <div style={{ fontSize: 11, color: '#484f58', marginTop: 2 }}>
            Tap to view · {approxLocation}
          </div>
          <div style={{ marginTop: 3 }}>
            {mediaStatus === 'approved' ? (
              <span
                style={{
                  fontSize: 10,
                  color: '#3fb950',
                  background: 'rgba(63,185,80,0.1)',
                  padding: '1px 6px',
                  borderRadius: 3,
                }}
              >
                Verified — faces blurred
              </span>
            ) : (
              <span
                style={{
                  fontSize: 10,
                  color: '#d29922',
                  background: 'rgba(210,153,34,0.1)',
                  padding: '1px 6px',
                  borderRadius: 3,
                }}
              >
                Pending review
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded overlay */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
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
            onClick={() => setExpanded(false)}
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

          {/* Media content */}
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(90vw, 900px)', maxHeight: '70vh', borderRadius: 8, overflow: 'hidden' }}>
            {isVideo ? (
              <video
                src={mediaUrl}
                controls
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={mediaUrl}
                alt="Report media expanded"
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }}
              />
            )}
          </div>

          {/* Metadata bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(13,17,23,0.9)',
              borderRadius: '0 0 8px 8px',
              padding: '12px 16px',
              display: 'flex',
              gap: 20,
              flexWrap: 'wrap',
              maxWidth: 'min(90vw, 900px)',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {[
              { label: 'Type', value: isVideo ? 'Video' : 'Photo', color: '#e6edf3' },
              { label: 'Location', value: approxLocation, color: '#e6edf3' },
              { label: 'Submitted', value: timeAgo(createdAt), color: '#e6edf3' },
              {
                label: 'Verification',
                value:
                  mediaStatus === 'approved'
                    ? '✓ Faces blurred · EXIF removed'
                    : 'Pending processing',
                color: mediaStatus === 'approved' ? '#3fb950' : '#d29922',
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
            style={{ fontSize: 11, color: '#484f58', textAlign: 'center', marginTop: 8 }}
          >
            Exact GPS coordinates are not shown to protect reporter privacy.
          </div>
        </div>
      )}
    </>
  )
}
