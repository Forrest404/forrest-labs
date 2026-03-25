'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 'success'
type GpsStatus = 'loading' | 'done' | 'denied' | 'error'
type DistanceBand = 'under_500m' | '500m_1km' | '1km_3km' | 'over_3km'
type EventValue =
  | 'large_explosion'
  | 'shockwave'
  | 'smoke_fire'
  | 'aircraft'
  | 'ground_shook'
  | 'other'

interface StoredReport {
  timestamp: number
  id: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BEIRUT_LAT = 33.8938
const BEIRUT_LON = 35.5018
const TEN_MINUTES = 10 * 60 * 1000
const MAX_MEDIA_BYTES = 52428800 // 50 MB

const DISTANCE_CARDS: {
  value: DistanceBand
  label: string
  range: string
  r: number
  stroke: string
  strokeWidth: number
}[] = [
  {
    value: 'under_500m',
    label: 'Very close',
    range: 'Under 500m',
    r: 10,
    stroke: '#ef4444',
    strokeWidth: 2.5,
  },
  {
    value: '500m_1km',
    label: 'Close',
    range: '500m – 1km',
    r: 14,
    stroke: '#f97316',
    strokeWidth: 2,
  },
  {
    value: '1km_3km',
    label: 'Distant',
    range: '1 – 3km',
    r: 18,
    stroke: '#3b82f6',
    strokeWidth: 1.5,
  },
  {
    value: 'over_3km',
    label: 'Far away',
    range: 'Over 3km',
    r: 22,
    stroke: '#6b7280',
    strokeWidth: 1,
  },
]

const EVENT_BUTTONS: {
  value: EventValue
  label: string
  colour: string
}[] = [
  { value: 'large_explosion', label: 'Large explosion heard', colour: '#ef4444' },
  { value: 'shockwave', label: 'Shockwave felt / windows shook', colour: '#f97316' },
  { value: 'smoke_fire', label: 'Smoke or fire visible', colour: '#eab308' },
  { value: 'aircraft', label: 'Aircraft or missiles overhead', colour: '#8b5cf6' },
  { value: 'ground_shook', label: 'Ground shook / debris fell', colour: '#6b7280' },
  { value: 'other', label: 'Something else / not sure', colour: '#374151' },
]

const DISTANCE_LABELS: Record<DistanceBand, string> = {
  under_500m: 'Under 500m away',
  '500m_1km': '500m – 1km away',
  '1km_3km': '1 – 3km away',
  over_3km: 'Over 3km away',
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function ReportPage() {
  // Navigation
  const [currentStep, setCurrentStep] = useState<Step>(1)

  // Rate limiting
  const [rateLimitMinutesLeft, setRateLimitMinutesLeft] = useState<number | null>(null)
  const [rateLimitMinutesAgo, setRateLimitMinutesAgo] = useState<number>(0)

  // Step 1 — Location
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('loading')
  const [lat, setLat] = useState<number>(BEIRUT_LAT)
  const [lon, setLon] = useState<number>(BEIRUT_LON)
  const [locationName, setLocationName] = useState<string>('')
  const [manualLocation, setManualLocation] = useState<string>('')

  // Step 2 — Distance
  const [distanceBand, setDistanceBand] = useState<DistanceBand | null>(null)

  // Step 3 — Event types
  const [eventTypes, setEventTypes] = useState<EventValue[]>([])

  // Step 4 — Media
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [mediaSizeError, setMediaSizeError] = useState(false)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  // Step 5 — Submission
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [_submittedReportId, setSubmittedReportId] = useState<string | null>(null)
  const [_mediaUploading, setMediaUploading] = useState(false)

  // Success screen
  const [shareButtonText, setShareButtonText] = useState('Share this page')

  // ── Rate limit check on mount ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('fl_last_report')
      if (!stored) return
      const parsed: StoredReport = JSON.parse(stored)
      const elapsed = Date.now() - parsed.timestamp
      if (elapsed < TEN_MINUTES) {
        const minsLeft = Math.ceil((TEN_MINUTES - elapsed) / 60000)
        const minsAgo = Math.floor(elapsed / 60000)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRateLimitMinutesLeft(minsLeft)
        setRateLimitMinutesAgo(minsAgo)
        setTimeout(() => {
          localStorage.removeItem('fl_last_report')
          window.location.reload()
        }, TEN_MINUTES - elapsed)
      }
    } catch {
      // malformed localStorage — ignore
    }
  }, [])

  // ── GPS on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGpsStatus('error')
      return
    }

    // On HTTP (non-localhost) mobile browsers the permission prompt is never
    // shown and neither callback fires. Fall through to manual entry after 8s.
    let resolved = false
    const fallbackTimer = setTimeout(() => {
      if (!resolved) setGpsStatus('error')
    }, 8000)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        resolved = true
        clearTimeout(fallbackTimer)
        const newLat = pos.coords.latitude
        const newLon = pos.coords.longitude
        setLat(newLat)
        setLon(newLon)
        setGpsStatus('done')

        // Mapbox reverse geocoding
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${newLon},${newLat}.json?access_token=${token}`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json() as { features: { place_name: string }[] }
            setLocationName(data.features?.[0]?.place_name ?? 'Location found')
          } else {
            setLocationName('Location found')
          }
        } catch {
          setLocationName('Location found')
        }
      },
      (err) => {
        resolved = true
        clearTimeout(fallbackTimer)
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied')
        } else {
          setGpsStatus('error')
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )

    return () => clearTimeout(fallbackTimer)
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const toggleEvent = useCallback((val: EventValue) => {
    setEventTypes((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    )
  }, [])

  const handleMediaFile = useCallback((file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_MEDIA_BYTES) {
      setMediaSizeError(true)
      return
    }
    setMediaSizeError(false)
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(file)
    setMediaPreviewUrl(URL.createObjectURL(file))
  }, [mediaPreviewUrl])

  const clearMedia = useCallback(() => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(null)
    setMediaPreviewUrl(null)
    setMediaSizeError(false)
    if (mediaInputRef.current) mediaInputRef.current.value = ''
  }, [mediaPreviewUrl])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    setSubmitError(null)

    try {
      let sessionId = sessionStorage.getItem('fl_session_id')
      if (!sessionId) {
        sessionId = crypto.randomUUID()
        sessionStorage.setItem('fl_session_id', sessionId)
      }

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lon,
          distance_band: distanceBand,
          event_types: eventTypes,
          session_id: sessionId,
        }),
      })

      if (res.ok) {
        const data = (await res.json()) as { success: boolean; id: string }
        localStorage.setItem(
          'fl_last_report',
          JSON.stringify({ timestamp: Date.now(), id: data.id })
        )
        if (mediaFile) {
          setSubmittedReportId(data.id)
          setMediaUploading(true)
        }
        setCurrentStep('success')
      } else {
        setSubmitError('Something went wrong. Please try again.')
        setSubmitting(false)
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }, [lat, lon, distanceBand, eventTypes, mediaFile])

  const handleShare = useCallback(async () => {
    const url = window.location.origin + '/report'
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Forrest Labs', url })
      } catch {
        // user cancelled — do nothing
      }
    } else {
      try {
        await navigator.clipboard.writeText(url)
        setShareButtonText('Link copied ✓')
        setTimeout(() => setShareButtonText('Share this page'), 2000)
      } catch {
        // clipboard unavailable
      }
    }
  }, [])

  const handleReportAnother = useCallback(() => {
    // Clear rate limit so they can submit again
    localStorage.removeItem('fl_last_report')
    // Reset all state
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setCurrentStep(1)
    setGpsStatus('loading')
    setLat(BEIRUT_LAT)
    setLon(BEIRUT_LON)
    setLocationName('')
    setManualLocation('')
    setDistanceBand(null)
    setEventTypes([])
    setMediaFile(null)
    setMediaPreviewUrl(null)
    setMediaSizeError(false)
    setSubmitting(false)
    setSubmitError(null)
    setSubmittedReportId(null)
    setMediaUploading(false)
    setRateLimitMinutesLeft(null)
    setShareButtonText('Share this page')
    // Re-trigger GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const newLat = pos.coords.latitude
          const newLon = pos.coords.longitude
          setLat(newLat)
          setLon(newLon)
          setGpsStatus('done')
          try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${newLon},${newLat}.json?access_token=${token}`
            const res = await fetch(url)
            if (res.ok) {
              const data = await res.json() as { features: { place_name: string }[] }
              setLocationName(data.features?.[0]?.place_name ?? 'Location found')
            } else {
              setLocationName('Location found')
            }
          } catch {
            setLocationName('Location found')
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setGpsStatus('denied')
          else setGpsStatus('error')
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else {
      setGpsStatus('error')
    }
  }, [mediaPreviewUrl])

  // ── Derived values ──────────────────────────────────────────────────────────

  const effectiveLocationName =
    locationName ||
    manualLocation ||
    (gpsStatus === 'denied' || gpsStatus === 'error' ? 'Beirut area' : '')

  const step1ButtonEnabled = gpsStatus === 'done' || gpsStatus === 'denied' || gpsStatus === 'error'

  const formattedEventTypes = eventTypes
    .map((v) => {
      const label = v.replace(/_/g, ' ')
      return label.charAt(0).toUpperCase() + label.slice(1)
    })
    .join(', ')

  const isImage = mediaFile?.type.startsWith('image') ?? false

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        background: '#0a0a0f',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        paddingBottom: 200,
        color: '#ffffff',
      }}
    >
      {/* Keyframe animations */}
      <style>{`
        @keyframes pulse-fade {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '40px 20px 0',
        }}
      >
        {/* ── Rate limit blocker ─────────────────────────────────────────── */}
        {rateLimitMinutesLeft !== null ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 'calc(100vh - 80px)',
              textAlign: 'center',
              gap: 16,
            }}
          >
            <div style={{ fontSize: 48 }}>⏳</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Report submitted
            </h1>
            <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.6, maxWidth: 280, margin: 0 }}>
              You submitted a report {rateLimitMinutesAgo} minute{rateLimitMinutesAgo !== 1 ? 's' : ''} ago.
              You can submit another in {rateLimitMinutesLeft} minute{rateLimitMinutesLeft !== 1 ? 's' : ''}.
            </p>
            <a
              href="/map"
              style={{
                color: '#ef4444',
                fontSize: 15,
                textDecoration: 'none',
                marginTop: 8,
              }}
            >
              View the live map →
            </a>
          </div>
        ) : currentStep === 'success' ? (
          // ── Success screen ───────────────────────────────────────────────
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 'calc(100vh - 120px)',
              textAlign: 'center',
            }}
          >
            {/* Checkmark circle */}
            <div
              style={{
                width: 56,
                height: 56,
                background: '#052e16',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 12 l4 4 l8-8"
                  stroke="#22c55e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: '#ffffff',
                marginTop: 20,
                marginBottom: 0,
              }}
            >
              Report sent
            </h1>

            <p
              style={{
                fontSize: 15,
                color: '#9ca3af',
                textAlign: 'center',
                maxWidth: 280,
                lineHeight: 1.6,
                marginTop: 8,
                marginBottom: 0,
              }}
            >
              Thank you. Aid organisations can now see activity in this area.
            </p>

            {mediaFile && (
              <p
                style={{
                  fontSize: 16,
                  color: '#6b7280',
                  marginTop: 12,
                  marginBottom: 0,
                }}
              >
                Your photo or video will appear on the map once reviewed.
              </p>
            )}

            {/* Three action buttons */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginTop: 32,
                width: '100%',
                maxWidth: 320,
              }}
            >
              <a
                href="/map"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 52,
                  background: '#ef4444',
                  color: '#ffffff',
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                }}
              >
                View live map
              </a>

              <button
                type="button"
                onClick={handleShare}
                style={{
                  height: 52,
                  background: 'transparent',
                  border: '1px solid #374151',
                  color: '#9ca3af',
                  borderRadius: 8,
                  fontSize: 15,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {shareButtonText}
              </button>

              <button
                type="button"
                onClick={handleReportAnother}
                style={{
                  height: 52,
                  background: 'transparent',
                  border: '1px solid #374151',
                  color: '#9ca3af',
                  borderRadius: 8,
                  fontSize: 15,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                Report another incident
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Shared header ──────────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 24,
              }}
            >
              <span
                style={{
                  color: '#ef4444',
                  fontSize: 16,
                  letterSpacing: '0.2em',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                }}
              >
                Forrest Labs
              </span>
              <a
                href="/map"
                style={{
                  color: '#9ca3af',
                  fontSize: 16,
                  textDecoration: 'none',
                }}
              >
                Live map →
              </a>
            </div>

            {/* ── Progress dots ──────────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 32,
              }}
              role="progressbar"
              aria-valuenow={currentStep as number}
              aria-valuemin={1}
              aria-valuemax={5}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  style={{
                    display: 'block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background:
                      i < (currentStep as number)
                        ? '#ef4444'
                        : i === (currentStep as number)
                        ? '#ffffff'
                        : '#374151',
                    transition: 'background 0.2s',
                  }}
                />
              ))}
            </div>

            {/* ── Step 1: Location ───────────────────────────────────────── */}
            {currentStep === 1 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>
                  Where are you?
                </h1>
                <p style={{ fontSize: 15, color: '#9ca3af', marginBottom: 28, marginTop: 0 }}>
                  Used only to place your report on the map.
                </p>

                {gpsStatus === 'loading' && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '32px 0',
                      color: '#9ca3af',
                      fontSize: 16,
                      animation: 'pulse-fade 1.5s ease-in-out infinite',
                    }}
                  >
                    Finding your location...
                  </div>
                )}

                {gpsStatus === 'done' && locationName && (
                  <div style={{ marginBottom: 20 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#22c55e',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 16, color: '#ffffff', fontWeight: 500 }}>
                        {locationName}
                      </span>
                    </div>
                    <p style={{ fontSize: 16, color: '#6b7280', margin: 0 }}>
                      Approximate only. Your identity is never stored.
                    </p>
                  </div>
                )}

                {(gpsStatus === 'denied' || gpsStatus === 'error') && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 16, color: '#ef4444', marginBottom: 12, marginTop: 0 }}>
                      Location access denied.
                    </p>
                    <input
                      type="text"
                      placeholder="Enter your neighbourhood (optional)"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      style={{
                        width: '100%',
                        height: 48,
                        background: '#111827',
                        border: '1px solid #374151',
                        borderRadius: 8,
                        color: '#ffffff',
                        fontSize: 16,
                        padding: '0 14px',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  disabled={!step1ButtonEnabled}
                  style={{
                    width: '100%',
                    height: 52,
                    background: step1ButtonEnabled ? '#ef4444' : '#1f2937',
                    color: step1ButtonEnabled ? '#ffffff' : '#6b7280',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: step1ButtonEnabled ? 'pointer' : 'not-allowed',
                    opacity: step1ButtonEnabled ? 1 : 0.5,
                    marginTop: 8,
                  }}
                >
                  Use this location
                </button>
              </div>
            )}

            {/* ── Step 2: Distance ───────────────────────────────────────── */}
            {currentStep === 2 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>
                  How far away was it?
                </h1>
                <p style={{ fontSize: 15, color: '#9ca3af', marginBottom: 28, marginTop: 0 }}>
                  Your best guess is fine.
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    marginBottom: 24,
                  }}
                >
                  {DISTANCE_CARDS.map((card) => {
                    const selected = distanceBand === card.value
                    const svgSize = (card.r + card.strokeWidth) * 2 + 4
                    return (
                      <div
                        key={card.value}
                        onClick={() => setDistanceBand(card.value)}
                        style={{
                          background: selected ? '#1f0a0a' : '#111827',
                          border: selected ? '2px solid #ef4444' : '1px solid #1f2937',
                          borderRadius: 10,
                          padding: 16,
                          minHeight: 100,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <svg
                          width={svgSize}
                          height={svgSize}
                          viewBox={`0 0 ${svgSize} ${svgSize}`}
                          aria-hidden="true"
                        >
                          <circle
                            cx={svgSize / 2}
                            cy={svgSize / 2}
                            r={card.r}
                            fill="none"
                            stroke={card.stroke}
                            strokeWidth={card.strokeWidth}
                          />
                        </svg>
                        <span
                          style={{
                            fontSize: 16,
                            fontWeight: 500,
                            color: '#ffffff',
                            marginTop: 8,
                            textAlign: 'center',
                          }}
                        >
                          {card.label}
                        </span>
                        <span
                          style={{
                            fontSize: 16,
                            color: '#9ca3af',
                            marginTop: 2,
                            textAlign: 'center',
                          }}
                        >
                          {card.range}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {distanceBand && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    style={{
                      width: '100%',
                      height: 52,
                      background: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginBottom: 10,
                    }}
                  >
                    Continue
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  style={{
                    width: '100%',
                    height: 48,
                    background: 'transparent',
                    border: 'none',
                    color: '#6b7280',
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
              </div>
            )}

            {/* ── Step 3: Event type ─────────────────────────────────────── */}
            {currentStep === 3 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>
                  What did you experience?
                </h1>
                <p style={{ fontSize: 15, color: '#9ca3af', marginBottom: 28, marginTop: 0 }}>
                  Select all that apply.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {EVENT_BUTTONS.map((btn) => {
                    const selected = eventTypes.includes(btn.value)
                    return (
                      <button
                        key={btn.value}
                        type="button"
                        onClick={() => toggleEvent(btn.value)}
                        style={{
                          minHeight: 56,
                          borderRadius: 8,
                          padding: '0 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                          textAlign: 'left',
                          background: selected ? '#111827' : '#0f172a',
                          border: selected ? '1.5px solid #ef4444' : '1px solid #1f2937',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: btn.colour,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 15, color: '#ffffff' }}>{btn.label}</span>
                      </button>
                    )
                  })}
                </div>

                {eventTypes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(4)}
                    style={{
                      width: '100%',
                      height: 52,
                      background: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginBottom: 10,
                    }}
                  >
                    Continue
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  style={{
                    width: '100%',
                    height: 48,
                    background: 'transparent',
                    border: 'none',
                    color: '#6b7280',
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
              </div>
            )}

            {/* ── Step 4: Media ──────────────────────────────────────────── */}
            {currentStep === 4 && (
              <div>
                {/* Optional pill */}
                <div style={{ marginBottom: 10 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      background: '#1e1b4b',
                      color: '#a5b4fc',
                      borderRadius: 20,
                      padding: '3px 10px',
                      fontSize: 16,
                    }}
                  >
                    Optional — helps verification
                  </span>
                </div>

                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>
                  Add a photo or video
                </h1>
                <p style={{ fontSize: 15, color: '#9ca3af', marginBottom: 28, marginTop: 0 }}>
                  &nbsp;
                </p>

                {/* Upload zone or preview */}
                {!mediaPreviewUrl ? (
                  <div
                    onClick={() => mediaInputRef.current?.click()}
                    style={{
                      border: '1.5px dashed #374151',
                      borderRadius: 10,
                      minHeight: 130,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      background: '#0f172a',
                      marginBottom: 16,
                    }}
                  >
                    {/* Upload icon */}
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="16" x2="12" y2="4" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                      <polyline points="8,8 12,4 16,8" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="4" y1="20" x2="20" y2="20" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span style={{ fontSize: 16, color: '#9ca3af' }}>
                      Tap to add photo or video
                    </span>
                    <span style={{ fontSize: 16, color: '#4b5563' }}>
                      Max 50MB · Faces auto-blurred before publication
                    </span>
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaPreviewUrl}
                        alt="Selected photo"
                        style={{
                          width: '100%',
                          maxHeight: 160,
                          borderRadius: 8,
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <video
                        src={mediaPreviewUrl}
                        style={{
                          width: '100%',
                          maxHeight: 160,
                          borderRadius: 8,
                          display: 'block',
                        }}
                        controls
                        muted
                      />
                    )}
                    <p style={{ fontSize: 16, color: '#9ca3af', marginTop: 6, marginBottom: 4 }}>
                      {mediaFile && mediaFile.name.length > 30
                        ? mediaFile.name.slice(0, 30) + '…'
                        : mediaFile?.name}
                    </p>
                    <button
                      type="button"
                      onClick={clearMedia}
                      style={{
                        fontSize: 16,
                        color: '#ef4444',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}

                {mediaSizeError && (
                  <p style={{ fontSize: 16, color: '#ef4444', marginBottom: 12, marginTop: 0 }}>
                    File too large. Max 50MB.
                  </p>
                )}

                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  aria-hidden="true"
                  onChange={(e) => handleMediaFile(e.target.files?.[0])}
                />

                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(5)}
                    style={{
                      flex: 1,
                      height: 52,
                      background: 'transparent',
                      border: '1px solid #374151',
                      color: '#9ca3af',
                      borderRadius: 8,
                      fontSize: 15,
                      cursor: 'pointer',
                    }}
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(5)}
                    style={{
                      flex: 2,
                      height: 52,
                      background: '#ef4444',
                      border: 'none',
                      color: '#ffffff',
                      borderRadius: 8,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Continue
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  style={{
                    width: '100%',
                    height: 48,
                    background: 'transparent',
                    border: 'none',
                    color: '#6b7280',
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
              </div>
            )}

            {/* ── Step 5: Confirm ────────────────────────────────────────── */}
            {currentStep === 5 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 24, marginTop: 0 }}>
                  Confirm your report
                </h1>

                {/* Summary card */}
                <div
                  style={{
                    background: '#052e16',
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 20,
                  }}
                >
                  <p style={{ fontSize: 16, fontWeight: 500, color: '#ffffff', margin: '0 0 8px 0' }}>
                    {effectiveLocationName || 'Beirut area'}
                  </p>
                  {distanceBand && (
                    <p style={{ fontSize: 16, color: '#86efac', margin: '0 0 4px 0' }}>
                      {DISTANCE_LABELS[distanceBand]}
                    </p>
                  )}
                  {formattedEventTypes && (
                    <p style={{ fontSize: 16, color: '#86efac', margin: '0 0 4px 0' }}>
                      {formattedEventTypes}
                    </p>
                  )}
                  {mediaFile && (
                    <p style={{ fontSize: 16, color: '#86efac', margin: '0' }}>
                      {isImage ? 'Photo attached' : 'Video attached'}
                    </p>
                  )}
                </div>

                <p
                  style={{
                    fontSize: 16,
                    color: '#6b7280',
                    lineHeight: 1.6,
                    marginBottom: 24,
                    marginTop: 0,
                  }}
                >
                  Your report is anonymous. No name, phone number, or device ID is stored.
                  This report will be combined with others nearby to identify where help is needed.
                </p>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{
                    width: '100%',
                    height: 56,
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.8 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    marginBottom: submitError ? 10 : 10,
                    boxSizing: 'border-box',
                  }}
                >
                  {submitting ? (
                    <>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 20,
                          height: 20,
                          border: '3px solid rgba(255,255,255,0.3)',
                          borderTop: '3px solid #ffffff',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                          flexShrink: 0,
                        }}
                      />
                      Sending...
                    </>
                  ) : (
                    'Send report'
                  )}
                </button>

                {submitError && (
                  <p style={{ fontSize: 16, color: '#ef4444', margin: '0 0 10px 0' }}>
                    {submitError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  disabled={submitting}
                  style={{
                    width: '100%',
                    height: 48,
                    background: 'transparent',
                    border: 'none',
                    color: '#6b7280',
                    fontSize: 15,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Back
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
