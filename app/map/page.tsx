'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/realtime-js'

// ─── Global declaration for CDN-loaded Mapbox ─────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { mapboxgl: any }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cluster {
  id: string
  centroid_lat: number
  centroid_lon: number
  status: 'confirmed' | 'auto_confirmed'
  confidence_score: number
  display_radius_metres: number
  dominant_event_types: string[]
  ai_reasoning: string | null
  report_count: number
  created_at: string
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a closed ring of [lon, lat] coordinates approximating a circle
 *  of `radiusMeters` centred at [lon, lat]. Uses equirectangular projection
 *  which is accurate enough for radii under ~10 km. */
function circlePolygon(
  lon: number,
  lat: number,
  radiusMeters: number,
  steps = 64,
): [number, number][] {
  const coords: [number, number][] = []
  const earthRadius = 6378137
  const latRad = (lat * Math.PI) / 180
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    const dx = radiusMeters * Math.cos(angle)
    const dy = radiusMeters * Math.sin(angle)
    coords.push([
      lon + (dx / (earthRadius * Math.cos(latRad))) * (180 / Math.PI),
      lat + (dy / earthRadius) * (180 / Math.PI),
    ])
  }
  return coords
}

// ─── Map page ─────────────────────────────────────────────────────────────────

export default function MapPage() {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'hour' | 'confirmed'>('all')
  const [locationNames, setLocationNames] = useState<Record<string, string>>({})
  const [isMobile, setIsMobile] = useState(false)
  const [showFullReasoning, setShowFullReasoning] = useState(false)
  const [shareLabel, setShareLabel] = useState('Share this alert')

  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const supabase = useRef(createClient())

  // ── Helpers ────────────────────────────────────────────────────────────────

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  function formatEventType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  function getConfidenceColor(score: number): string {
    if (score >= 85) return '#22c55e'
    if (score >= 50) return '#f97316'
    return '#ef4444'
  }

  // ── Mapbox helpers ─────────────────────────────────────────────────────────

  const fetchLocationName = useCallback(async (
    lat: number,
    lon: number,
    clusterId: string,
  ) => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json` +
      `?access_token=${token}&types=neighborhood,locality,place`
    try {
      const res = await fetch(url)
      const data = await res.json() as { features: { place_name: string }[] }
      const name = data.features?.[0]?.place_name ?? 'Unknown location'
      setLocationNames((prev) => {
        if (prev[clusterId]) return prev
        return { ...prev, [clusterId]: name }
      })
    } catch {
      setLocationNames((prev) => {
        if (prev[clusterId]) return prev
        return { ...prev, [clusterId]: 'Unknown location' }
      })
    }
  }, [])

  const updateMapSource = useCallback((clusterData: Cluster[]) => {
    if (!map.current) return

    // Polygon source — geographically accurate radius rings
    const radiusGeojson = {
      type: 'FeatureCollection' as const,
      features: clusterData.map((c) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [circlePolygon(c.centroid_lon, c.centroid_lat, c.display_radius_metres)],
        },
        properties: { id: c.id, status: c.status },
      })),
    }

    // Point source — centre dots
    const dotGeojson = {
      type: 'FeatureCollection' as const,
      features: clusterData.map((c) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [c.centroid_lon, c.centroid_lat],
        },
        properties: {
          id: c.id,
          confidence_score: c.confidence_score,
          report_count: c.report_count,
          display_radius_metres: c.display_radius_metres,
          dominant_event_types: JSON.stringify(c.dominant_event_types),
          ai_reasoning: c.ai_reasoning,
          created_at: c.created_at,
          status: c.status,
        },
      })),
    }

    if (map.current.getSource('clusters-dots')) {
      map.current.getSource('clusters-radius').setData(radiusGeojson)
      map.current.getSource('clusters-dots').setData(dotGeojson)
      return
    }

    map.current.addSource('clusters-radius', { type: 'geojson', data: radiusGeojson })
    map.current.addSource('clusters-dots',   { type: 'geojson', data: dotGeojson })

    // Radius fill
    map.current.addLayer({
      id: 'cluster-radius',
      type: 'fill',
      source: 'clusters-radius',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'status'], 'auto_confirmed'], '#f97316',
          '#ef4444',
        ],
        'fill-opacity': 0.15,
      },
    })

    // Radius outline
    map.current.addLayer({
      id: 'cluster-radius-outline',
      type: 'line',
      source: 'clusters-radius',
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'status'], 'auto_confirmed'], '#f97316',
          '#ef4444',
        ],
        'line-width': 1.5,
        'line-opacity': 0.6,
      },
    })

    // Centre dot layer
    map.current.addLayer({
      id: 'cluster-dots',
      type: 'circle',
      source: 'clusters-dots',
      paint: {
        'circle-radius': 7,
        'circle-color': [
          'case',
          ['==', ['get', 'status'], 'auto_confirmed'], '#f97316',
          '#ef4444',
        ],
        'circle-opacity': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.8,
      },
    })

    // Click handler
    map.current.on('click', 'cluster-dots', (e: any) => {
      const props = e.features[0].properties
      const cluster = clusterData.find((c) => c.id === props.id)
      if (cluster) {
        setSelectedCluster(cluster)
        fetchLocationName(cluster.centroid_lat, cluster.centroid_lon, cluster.id)
      }
    })

    map.current.on('mouseenter', 'cluster-dots', () => {
      map.current.getCanvas().style.cursor = 'pointer'
    })
    map.current.on('mouseleave', 'cluster-dots', () => {
      map.current.getCanvas().style.cursor = ''
    })
  }, [fetchLocationName])

  const loadClusters = useCallback(async () => {
    const { data } = await supabase.current
      .from('clusters')
      .select('*')
      .in('status', ['confirmed', 'auto_confirmed'])
      .order('created_at', { ascending: false })
      .limit(100)

    const rows = (data ?? []) as Cluster[]
    setClusters(rows)
    updateMapSource(rows)
  }, [updateMapSource])

  const setupRealtimeSubscription = useCallback(() => {
    supabase.current
      .channel('clusters-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clusters',
          filter: 'status=in.(confirmed,auto_confirmed)',
        },
        (payload: RealtimePostgresChangesPayload<Cluster>) => {
          if (
            payload.eventType === 'INSERT' ||
            payload.eventType === 'UPDATE'
          ) {
            const newCluster = payload.new as Cluster
            setClusters((prev) => {
              const exists = prev.find((c) => c.id === newCluster.id)
              const updated = exists
                ? prev.map((c) => (c.id === newCluster.id ? newCluster : c))
                : [newCluster, ...prev]
              updateMapSource(updated)
              return updated
            })
          }
        }
      )
      .subscribe()
  }, [updateMapSource])

  // ── Effect 1: map init ─────────────────────────────────────────────────────

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js'
    script.onload = () => {
      if (!mapContainer.current) return

      window.mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      map.current = new window.mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [35.5018, 33.8938],
        zoom: 12,
        attributionControl: false,
      })

      map.current.addControl(
        new window.mapboxgl.AttributionControl(),
        'bottom-left'
      )
      map.current.addControl(
        new window.mapboxgl.ScaleControl(),
        'bottom-right'
      )

      map.current.on('load', () => {
        setMapLoaded(true)
        loadClusters()
        setupRealtimeSubscription()
      })
    }
    document.head.appendChild(script)

    const sb = supabase.current

    return () => {
      window.removeEventListener('resize', checkMobile)
      sb.removeAllChannels()
      if (map.current) map.current.remove()
    }
  }, [loadClusters, setupRealtimeSubscription])

  // ── Effect 2: filter ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!map.current || !map.current.getSource('clusters')) return

    const now = Date.now()
    const oneHour = 60 * 60 * 1000

    const filtered = clusters.filter((c) => {
      if (activeFilter === 'hour') {
        return now - new Date(c.created_at).getTime() < oneHour
      }
      if (activeFilter === 'confirmed') {
        return c.status === 'confirmed'
      }
      return true
    })

    updateMapSource(filtered)
  }, [activeFilter, clusters, updateMapSource])

  // ── Effect 3: reset panel state when selection changes ────────────────────

  useEffect(() => {
    setShowFullReasoning(false)
    setShareLabel('Share this alert')
  }, [selectedCluster])

  // ── Share handler ──────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    const url = window.location.origin + '/map'
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Forrest Labs — Live Map', url })
      } catch {
        // user cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(url)
        setShareLabel('Link copied ✓')
        setTimeout(() => setShareLabel('Share this alert'), 2000)
      } catch {
        // clipboard unavailable
      }
    }
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  const recentCluster = clusters[0] ?? null

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        background: '#0a0a0f',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Keyframe animations */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Map container */}
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {/* Loading overlay — fades out once map is ready */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#0a0a0f',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          zIndex: 10,
          opacity: mapLoaded ? 0 : 1,
          pointerEvents: mapLoaded ? 'none' : 'auto',
          transition: 'opacity 0.4s ease',
        }}
      >
        <span
          style={{
            color: '#ef4444',
            fontSize: 11,
            letterSpacing: '0.2em',
            fontWeight: 500,
            textTransform: 'uppercase',
          }}
        >
          Forrest Labs
        </span>
        <span style={{ color: '#4b5563', fontSize: 14 }}>
          Loading live map...
        </span>
      </div>

      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          zIndex: 5,
          borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ef4444',
              animation: 'pulse-dot 1.4s ease-in-out infinite',
            }}
          />
          <span
            style={{
              color: '#ef4444',
              fontSize: 10,
              letterSpacing: '0.15em',
              fontWeight: 600,
            }}
          >
            LIVE
          </span>
        </div>

        {/* Centre summary */}
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 13,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {recentCluster
            ? `${locationNames[recentCluster.id] ?? 'Loading location...'} · ${recentCluster.report_count} reports · ${timeAgo(recentCluster.created_at)}`
            : 'Monitoring active — no confirmed incidents'}
        </div>

        {/* Report button */}
        <a
          href="/report"
          style={{
            background: '#ef4444',
            color: '#ffffff',
            padding: '7px 14px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            textDecoration: 'none',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          Report incident
        </a>
      </div>

      {/* Filter bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
          zIndex: 5,
        }}
      >
        {(
          [
            { label: 'All events', value: 'all' },
            { label: 'Last hour', value: 'hour' },
            { label: 'Confirmed only', value: 'confirmed' },
          ] as const
        ).map((pill) => (
          <button
            key={pill.value}
            type="button"
            onClick={() => setActiveFilter(pill.value)}
            style={{
              background:
                activeFilter === pill.value
                  ? 'rgba(239,68,68,0.2)'
                  : 'rgba(10,10,15,0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border:
                activeFilter === pill.value
                  ? '0.5px solid #ef4444'
                  : '0.5px solid rgba(255,255,255,0.15)',
              color:
                activeFilter === pill.value
                  ? '#ef4444'
                  : 'rgba(255,255,255,0.6)',
              padding: '7px 14px',
              borderRadius: 20,
              fontSize: 12,
              cursor: 'pointer',
              minHeight: 44,
              whiteSpace: 'nowrap',
            }}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Side panel */}
      {selectedCluster && (
        <div
          style={
            isMobile
              ? {
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  borderRadius: '16px 16px 0 0',
                  maxHeight: '70vh',
                  overflowY: 'auto',
                  background: 'rgba(15,17,27,0.97)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderTop: '0.5px solid rgba(255,255,255,0.08)',
                  padding: '20px 16px',
                  zIndex: 6,
                  boxSizing: 'border-box',
                }
              : {
                  position: 'absolute',
                  top: 56,
                  right: 0,
                  width: 320,
                  height: 'calc(100vh - 56px)',
                  overflowY: 'auto',
                  background: 'rgba(15,17,27,0.97)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderLeft: '0.5px solid rgba(255,255,255,0.08)',
                  padding: '20px 16px',
                  zIndex: 6,
                  boxSizing: 'border-box',
                }
          }
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setSelectedCluster(null)}
            aria-label="Close panel"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              width: 28,
              height: 28,
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            ×
          </button>

          {/* Status badge */}
          <div style={{ marginBottom: 8 }}>
            <span
              style={{
                display: 'inline-block',
                background:
                  selectedCluster.status === 'confirmed' ? '#052e16' : '#431407',
                color:
                  selectedCluster.status === 'confirmed' ? '#86efac' : '#fdba74',
                fontSize: 11,
                padding: '3px 9px',
                borderRadius: 20,
                fontWeight: 500,
              }}
            >
              {selectedCluster.status === 'confirmed' ? 'Confirmed' : 'Auto-confirmed'}
            </span>
          </div>

          {/* Location name */}
          <p
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: '#ffffff',
              margin: '8px 0 4px 0',
              paddingRight: 36,
            }}
          >
            {locationNames[selectedCluster.id] ?? 'Loading location...'}
          </p>

          {/* Time */}
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 4px 0' }}>
            {timeAgo(selectedCluster.created_at)}
          </p>

          {/* Divider */}
          <div
            style={{
              borderTop: '0.5px solid rgba(255,255,255,0.08)',
              margin: '12px 0',
            }}
          />

          {/* Report count */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
              Reports
            </div>
            <div style={{ fontSize: 13, color: '#ffffff' }}>
              {selectedCluster.report_count} people reported this
            </div>
          </div>

          {/* Confidence */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
              Confidence
            </div>
            <div
              style={{
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 2,
                height: 4,
                width: '100%',
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  background: getConfidenceColor(selectedCluster.confidence_score),
                  borderRadius: 2,
                  height: 4,
                  width: `${selectedCluster.confidence_score}%`,
                }}
              />
            </div>
            <div
              style={{
                fontSize: 12,
                color: getConfidenceColor(selectedCluster.confidence_score),
              }}
            >
              {selectedCluster.confidence_score}/100
            </div>
          </div>

          {/* Event types */}
          {selectedCluster.dominant_event_types?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                What was reported
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedCluster.dominant_event_types.map((type) => (
                  <span
                    key={type}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 20,
                    }}
                  >
                    {formatEventType(type)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI reasoning */}
          {selectedCluster.ai_reasoning && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                AI assessment
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: '#9ca3af',
                  lineHeight: 1.6,
                  margin: 0,
                  ...(showFullReasoning
                    ? {}
                    : {
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical' as const,
                      }),
                }}
              >
                {selectedCluster.ai_reasoning}
              </p>
              <button
                type="button"
                onClick={() => setShowFullReasoning((v) => !v)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '4px 0 0 0',
                }}
              >
                {showFullReasoning ? 'Show less' : 'Show more'}
              </button>
            </div>
          )}

          {/* Share button */}
          <button
            type="button"
            onClick={handleShare}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.08)',
              border: '0.5px solid rgba(255,255,255,0.15)',
              color: '#ffffff',
              borderRadius: 8,
              padding: 10,
              fontSize: 13,
              cursor: 'pointer',
              marginTop: 4,
              boxSizing: 'border-box',
            }}
          >
            {shareLabel}
          </button>
        </div>
      )}
    </div>
  )
}
