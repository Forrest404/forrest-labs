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
  status: 'confirmed' | 'auto_confirmed' | 'pending_review'
  confidence_score: number
  display_radius_metres: number
  dominant_event_types: string[]
  ai_reasoning: string | null
  report_count: number
  created_at: string
}

interface WarningCluster {
  id: string
  centroid_lat: number
  centroid_lon: number
  status: 'active' | 'all_clear'
  warning_count: number
  dominant_warning_type: string
  confidence_score: number
  location_name: string | null
  source_detail: string | null
  created_at: string
  expires_at: string | null
  all_clear_votes: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAP_STYLES = [
  { id: 'mapbox://styles/mapbox/dark-v11', label: 'Dark', color: '#1a1a2e' },
  { id: 'mapbox://styles/mapbox/satellite-v9', label: 'Satellite', color: '#2d4a1e' },
  { id: 'mapbox://styles/mapbox/satellite-streets-v12', label: 'Sat + Roads', color: '#1e3a2d' },
  { id: 'mapbox://styles/mapbox/streets-v12', label: 'Streets', color: '#2c3e50' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  // ── Existing state ───────────────────────────────────────────────────────
  const [mapLoaded, setMapLoaded] = useState(false)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'hour' | 'confirmed'>('all')
  const [locationNames, setLocationNames] = useState<Record<string, string>>({})
  const [isMobile, setIsMobile] = useState(false)
  const [showFullReasoning, setShowFullReasoning] = useState(false)
  const [shareLabel, setShareLabel] = useState('Share this alert')

  // ── New state ────────────────────────────────────────────────────────────
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/dark-v11')
  const [showControls, setShowControls] = useState(true)
  const [mouseCoords, setMouseCoords] = useState({ lat: '33.8938', lon: '35.5018' })
  const [layerStrikeZones, setLayerStrikeZones] = useState(true)
  const [layerLabels, setLayerLabels] = useState(false)
  const [layerHeatDensity, setLayerHeatDensity] = useState(false)

  // ── Warning state ──────────────────────────────────────────────────────
  const [warningClusters, setWarningClusters] = useState<WarningCluster[]>([])
  const [selectedWarning, setSelectedWarning] = useState<WarningCluster | null>(null)
  const [allClearSent, setAllClearSent] = useState(false)

  // ── Refs ─────────────────────────────────────────────────────────────────
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const supabase = useRef(createClient())
  const locationNamesRef = useRef<Record<string, string>>({})
  const clustersRef = useRef<Cluster[]>([])
  const pulseFrameRef = useRef<number>(0)
  const layerStrikeZonesRef = useRef(true)
  const layerLabelsRef = useRef(false)
  const layerHeatDensityRef = useRef(false)
  const warningClustersRef = useRef<WarningCluster[]>([])

  // ── Sync refs ────────────────────────────────────────────────────────────
  useEffect(() => { locationNamesRef.current = locationNames }, [locationNames])
  useEffect(() => { clustersRef.current = clusters }, [clusters])
  useEffect(() => { layerStrikeZonesRef.current = layerStrikeZones }, [layerStrikeZones])
  useEffect(() => { layerLabelsRef.current = layerLabels }, [layerLabels])
  useEffect(() => { layerHeatDensityRef.current = layerHeatDensity }, [layerHeatDensity])
  useEffect(() => { warningClustersRef.current = warningClusters }, [warningClusters])

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  function formatWarningType(type: string): string {
    const labels: Record<string, string> = {
      official_order: 'Official IDF order', phone_call: 'IDF phone call',
      leaflet_drop: 'Leaflet drop', community_warning: 'Community warning', other: 'Unspecified warning',
    }
    return labels[type] ?? type
  }

  // ── Mapbox helpers ──────────────────────────────────────────────────────

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
        properties: {
          id: c.id,
          status: c.status,
          confidence_score: c.confidence_score,
        },
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
          location_name: locationNamesRef.current[c.id] ?? '',
        },
      })),
    }

    // Pulse source — most recent cluster with 1.3× radius
    const mostRecent = clusterData[0]
    const pulseGeojson = {
      type: 'FeatureCollection' as const,
      features: mostRecent
        ? [
            {
              type: 'Feature' as const,
              geometry: {
                type: 'Polygon' as const,
                coordinates: [
                  circlePolygon(
                    mostRecent.centroid_lon,
                    mostRecent.centroid_lat,
                    mostRecent.display_radius_metres * 1.3,
                  ),
                ],
              },
              properties: {
                id: mostRecent.id,
                status: mostRecent.status,
              },
            },
          ]
        : [],
    }

    if (map.current.getSource('clusters-dots')) {
      map.current.getSource('clusters-radius').setData(radiusGeojson)
      map.current.getSource('clusters-dots').setData(dotGeojson)
      if (map.current.getSource('clusters-pulse')) {
        map.current.getSource('clusters-pulse').setData(pulseGeojson)
      }
      return
    }

    map.current.addSource('clusters-radius', { type: 'geojson', data: radiusGeojson })
    map.current.addSource('clusters-dots', { type: 'geojson', data: dotGeojson })
    map.current.addSource('clusters-pulse', { type: 'geojson', data: pulseGeojson })

    // Pulse fill (underneath everything)
    map.current.addLayer({
      id: 'cluster-pulse',
      type: 'fill',
      source: 'clusters-pulse',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'status'], 'confirmed'], '#22c55e',
          ['==', ['get', 'status'], 'auto_confirmed'], '#f97316',
          '#ef4444',
        ],
        'fill-opacity': 0.1,
      },
    })

    // Radius fill — opacity driven by confidence
    map.current.addLayer({
      id: 'cluster-radius',
      type: 'fill',
      source: 'clusters-radius',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'status'], 'confirmed'], '#22c55e',
          ['==', ['get', 'status'], 'auto_confirmed'], '#f97316',
          '#ef4444',
        ],
        'fill-opacity': [
          'interpolate',
          ['linear'],
          ['get', 'confidence_score'],
          50, 0.1,
          85, 0.2,
          100, 0.3,
        ],
      },
    })

    // Radius outline — width driven by confidence
    map.current.addLayer({
      id: 'cluster-radius-outline',
      type: 'line',
      source: 'clusters-radius',
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'status'], 'confirmed'], '#22c55e',
          ['==', ['get', 'status'], 'auto_confirmed'], '#f97316',
          '#ef4444',
        ],
        'line-width': [
          'interpolate',
          ['linear'],
          ['get', 'confidence_score'],
          50, 1.0,
          85, 1.5,
          100, 2.5,
        ],
        'line-opacity': 0.8,
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
          ['==', ['get', 'status'], 'confirmed'], '#22c55e',
          ['==', ['get', 'status'], 'auto_confirmed'], '#f97316',
          '#ef4444',
        ],
        'circle-opacity': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.8,
      },
    })
  }, [])

  // ── Warning source/layers ─────────────────────────────────────────────

  const updateWarningSource = useCallback((data: WarningCluster[]) => {
    if (!map.current) return

    const geojson = {
      type: 'FeatureCollection' as const,
      features: data.map((w) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [w.centroid_lon, w.centroid_lat] },
        properties: {
          id: w.id,
          warning_count: w.warning_count,
          dominant_warning_type: w.dominant_warning_type,
          confidence_score: w.confidence_score,
          status: w.status,
          location_name: w.location_name ?? '',
          created_at: w.created_at,
          expires_at: w.expires_at ?? '',
        },
      })),
    }

    if (map.current.getSource('warnings')) {
      map.current.getSource('warnings').setData(geojson)
      return
    }

    map.current.addSource('warnings', { type: 'geojson', data: geojson })

    // Warning radius circle
    map.current.addLayer({
      id: 'warning-radius',
      type: 'circle',
      source: 'warnings',
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          8, ['/', ['get', 'warning_count'], 2],
          12, ['*', ['get', 'warning_count'], 4],
          16, ['*', ['get', 'warning_count'], 12],
        ],
        'circle-color': ['case', ['==', ['get', 'status'], 'all_clear'], '#22c55e', '#f97316'],
        'circle-opacity': 0.12,
        'circle-stroke-color': ['case', ['==', ['get', 'status'], 'all_clear'], '#22c55e', '#f97316'],
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.7,
      },
    }, map.current.getLayer('cluster-radius') ? 'cluster-radius' : undefined)

    // Warning centre dots
    map.current.addLayer({
      id: 'warning-dots',
      type: 'circle',
      source: 'warnings',
      paint: {
        'circle-radius': 7,
        'circle-color': ['case', ['==', ['get', 'status'], 'all_clear'], '#22c55e', '#f97316'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    }, map.current.getLayer('cluster-dots') ? 'cluster-dots' : undefined)

    // Warning labels
    map.current.addLayer({
      id: 'warning-labels',
      type: 'symbol',
      source: 'warnings',
      filter: ['==', ['get', 'status'], 'active'],
      layout: {
        'text-field': 'WARNING',
        'text-size': 9,
        'text-offset': [0, -1.4],
        'text-anchor': 'bottom',
        'text-letter-spacing': 0.1,
      },
      paint: {
        'text-color': '#f97316',
        'text-halo-color': 'rgba(0,0,0,0.8)',
        'text-halo-width': 1.5,
      },
    })
  }, [])

  // ── Attach map event handlers (separate from updateMapSource) ───────────

  const attachMapHandlers = useCallback(() => {
    if (!map.current) return

    const onClick = (e: any) => {
      const props = e.features[0].properties
      const data = clustersRef.current
      const cluster = data.find((c) => c.id === props.id)
      if (cluster) {
        setSelectedCluster(cluster)
        fetchLocationName(cluster.centroid_lat, cluster.centroid_lon, cluster.id)
      }
    }
    const onEnter = () => {
      if (map.current) map.current.getCanvas().style.cursor = 'pointer'
    }
    const onLeave = () => {
      if (map.current) map.current.getCanvas().style.cursor = ''
    }

    // Remove any previous handlers to avoid duplicates
    map.current.off('click', 'cluster-dots', onClick)
    map.current.off('mouseenter', 'cluster-dots', onEnter)
    map.current.off('mouseleave', 'cluster-dots', onLeave)

    map.current.on('click', 'cluster-dots', onClick)
    map.current.on('mouseenter', 'cluster-dots', onEnter)
    map.current.on('mouseleave', 'cluster-dots', onLeave)

    // Warning dot click
    const onWarningClick = (e: any) => {
      const props = e.features[0].properties
      const data = warningClustersRef.current
      const warning = data.find((w) => w.id === props.id)
      if (warning) {
        setSelectedWarning(warning)
        setSelectedCluster(null)
      }
    }
    map.current.off('click', 'warning-dots', onWarningClick)
    map.current.on('click', 'warning-dots', onWarningClick)
    map.current.off('mouseenter', 'warning-dots', onEnter)
    map.current.on('mouseenter', 'warning-dots', onEnter)
    map.current.off('mouseleave', 'warning-dots', onLeave)
    map.current.on('mouseleave', 'warning-dots', onLeave)
  }, [fetchLocationName])

  // ── Start pulse animation ──────────────────────────────────────────────

  const startPulseAnimation = useCallback(() => {
    cancelAnimationFrame(pulseFrameRef.current)
    const animate = () => {
      if (!map.current || !map.current.getLayer('cluster-pulse')) return
      const t = performance.now() / 1000
      const opacity = 0.05 + 0.15 * ((Math.sin(t * 2) + 1) / 2)
      map.current.setPaintProperty('cluster-pulse', 'fill-opacity', opacity)
      pulseFrameRef.current = requestAnimationFrame(animate)
    }
    pulseFrameRef.current = requestAnimationFrame(animate)
  }, [])

  // ── Re-add optional layers after style change ──────────────────────────

  const reAddOptionalLayers = useCallback(() => {
    if (!map.current) return

    // Strike zone visibility
    if (!layerStrikeZonesRef.current) {
      if (map.current.getLayer('cluster-radius'))
        map.current.setLayoutProperty('cluster-radius', 'visibility', 'none')
      if (map.current.getLayer('cluster-radius-outline'))
        map.current.setLayoutProperty('cluster-radius-outline', 'visibility', 'none')
      if (map.current.getLayer('cluster-dots'))
        map.current.setLayoutProperty('cluster-dots', 'visibility', 'none')
    }

    // Labels
    if (layerLabelsRef.current && !map.current.getLayer('cluster-labels')) {
      map.current.addLayer({
        id: 'cluster-labels',
        type: 'symbol',
        source: 'clusters-dots',
        layout: {
          'text-field': ['get', 'location_name'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-max-width': 10,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.5,
        },
      })
    }

    // Heat density
    if (layerHeatDensityRef.current && !map.current.getLayer('strike-heat')) {
      map.current.addLayer(
        {
          id: 'strike-heat',
          type: 'heatmap',
          source: 'clusters-dots',
          maxzoom: 15,
          paint: {
            'heatmap-weight': [
              'interpolate', ['linear'],
              ['get', 'report_count'],
              0, 0, 20, 1,
            ],
            'heatmap-intensity': [
              'interpolate', ['linear'],
              ['zoom'], 0, 1, 15, 3,
            ],
            'heatmap-color': [
              'interpolate', ['linear'],
              ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.2, 'rgba(239,68,68,0.3)',
              0.5, 'rgba(239,68,68,0.6)',
              0.8, 'rgba(239,68,68,0.85)',
              1, 'rgba(255,255,255,1)',
            ],
            'heatmap-radius': [
              'interpolate', ['linear'],
              ['zoom'], 0, 20, 15, 60,
            ],
            'heatmap-opacity': 0.7,
          },
        },
        'cluster-dots',
      )
    }

    // Pulse
    startPulseAnimation()
  }, [startPulseAnimation])

  // ── Data loading (unchanged) ────────────────────────────────────────────

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

    // Also load warning clusters
    const { data: warnData } = await supabase.current
      .from('warning_clusters')
      .select('*')
      .in('status', ['active', 'all_clear'])
      .order('created_at', { ascending: false })
      .limit(50)

    const warnRows = (warnData ?? []) as WarningCluster[]
    setWarningClusters(warnRows)
    updateWarningSource(warnRows)
  }, [updateMapSource, updateWarningSource])

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

    // Warning clusters realtime
    supabase.current
      .channel('warnings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'warning_clusters',
          filter: 'status=in.(active,all_clear)',
        },
        (payload: RealtimePostgresChangesPayload<WarningCluster>) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newWarning = payload.new as WarningCluster
            setWarningClusters((prev) => {
              const exists = prev.find((w) => w.id === newWarning.id)
              const updated = exists
                ? prev.map((w) => (w.id === newWarning.id ? newWarning : w))
                : [newWarning, ...prev]
              updateWarningSource(updated)
              return updated
            })
          }
        }
      )
      .subscribe()
  }, [updateMapSource, updateWarningSource])

  // ── All clear handler ──────────────────────────────────────────────────

  const handleAllClear = useCallback(async () => {
    if (!selectedWarning) return
    let sessionId = sessionStorage.getItem('fl_session_id')
    if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem('fl_session_id', sessionId) }
    try {
      const res = await fetch(`/api/warnings/${selectedWarning.id}/all-clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      if (res.ok) setAllClearSent(true)
    } catch { /* ignore */ }
  }, [selectedWarning])

  // ── Effect 1: map init ────────────────────────────────────────────────

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 640
      setIsMobile(mobile)
      setShowControls(!mobile)
    }
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

      // Coordinates on mousemove
      map.current.on('mousemove', (e: any) => {
        setMouseCoords({
          lat: e.lngLat.lat.toFixed(4),
          lon: e.lngLat.lng.toFixed(4),
        })
      })

      // Mobile: update coords on map move (no mousemove on touch)
      map.current.on('moveend', () => {
        if (!map.current) return
        const center = map.current.getCenter()
        setMouseCoords({
          lat: center.lat.toFixed(4),
          lon: center.lng.toFixed(4),
        })
      })

      // Re-add custom layers after style *changes* (not initial load)
      let initialStyleLoaded = false
      map.current.on('style.load', () => {
        if (!initialStyleLoaded) {
          initialStyleLoaded = true
          return
        }
        updateMapSource(clustersRef.current)
        updateWarningSource(warningClustersRef.current)
        attachMapHandlers()
        reAddOptionalLayers()
      })

      map.current.on('load', () => {
        setMapLoaded(true)
        loadClusters()
        setupRealtimeSubscription()
        attachMapHandlers()
        startPulseAnimation()
      })
    }
    document.head.appendChild(script)

    const sb = supabase.current

    return () => {
      window.removeEventListener('resize', checkMobile)
      sb.removeAllChannels()
      cancelAnimationFrame(pulseFrameRef.current)
      if (map.current) map.current.remove()
    }
  }, [loadClusters, setupRealtimeSubscription, attachMapHandlers, reAddOptionalLayers, startPulseAnimation])

  // ── Effect 2: filter ──────────────────────────────────────────────────

  useEffect(() => {
    if (!map.current || !map.current.getSource('clusters-dots')) return

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

  // ── Effect 3: reset panel state when selection changes ────────────────

  useEffect(() => {
    setShowFullReasoning(false)
    setShareLabel('Share this alert')
  }, [selectedCluster])

  useEffect(() => {
    setAllClearSent(false)
  }, [selectedWarning])

  // ── Layer toggle handlers ─────────────────────────────────────────────

  const toggleStrikeZones = useCallback((on: boolean) => {
    setLayerStrikeZones(on)
    if (!map.current) return
    const vis = on ? 'visible' : 'none'
    if (map.current.getLayer('cluster-radius'))
      map.current.setLayoutProperty('cluster-radius', 'visibility', vis)
    if (map.current.getLayer('cluster-radius-outline'))
      map.current.setLayoutProperty('cluster-radius-outline', 'visibility', vis)
    if (map.current.getLayer('cluster-dots'))
      map.current.setLayoutProperty('cluster-dots', 'visibility', vis)
    if (map.current.getLayer('cluster-pulse'))
      map.current.setLayoutProperty('cluster-pulse', 'visibility', vis)
  }, [])

  const toggleLabels = useCallback((on: boolean) => {
    setLayerLabels(on)
    if (!map.current) return
    if (on) {
      if (!map.current.getLayer('cluster-labels')) {
        map.current.addLayer({
          id: 'cluster-labels',
          type: 'symbol',
          source: 'clusters-dots',
          layout: {
            'text-field': ['get', 'location_name'],
            'text-size': 11,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-max-width': 10,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.8)',
            'text-halo-width': 1.5,
          },
        })
      }
    } else {
      if (map.current.getLayer('cluster-labels')) {
        map.current.removeLayer('cluster-labels')
      }
    }
  }, [])

  const toggleHeatDensity = useCallback((on: boolean) => {
    setLayerHeatDensity(on)
    if (!map.current) return
    if (on) {
      if (!map.current.getLayer('strike-heat')) {
        map.current.addLayer(
          {
            id: 'strike-heat',
            type: 'heatmap',
            source: 'clusters-dots',
            maxzoom: 15,
            paint: {
              'heatmap-weight': [
                'interpolate', ['linear'],
                ['get', 'report_count'],
                0, 0, 20, 1,
              ],
              'heatmap-intensity': [
                'interpolate', ['linear'],
                ['zoom'], 0, 1, 15, 3,
              ],
              'heatmap-color': [
                'interpolate', ['linear'],
                ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.2, 'rgba(239,68,68,0.3)',
                0.5, 'rgba(239,68,68,0.6)',
                0.8, 'rgba(239,68,68,0.85)',
                1, 'rgba(255,255,255,1)',
              ],
              'heatmap-radius': [
                'interpolate', ['linear'],
                ['zoom'], 0, 20, 15, 60,
              ],
              'heatmap-opacity': 0.7,
            },
          },
          'cluster-dots',
        )
      }
    } else {
      if (map.current.getLayer('strike-heat')) {
        map.current.removeLayer('strike-heat')
      }
    }
  }, [])

  const changeStyle = useCallback((styleId: string) => {
    if (!map.current) return
    map.current.setStyle(styleId)
    setMapStyle(styleId)
  }, [])

  const toggleRoads = useCallback((on: boolean) => {
    if (on && mapStyle === 'mapbox://styles/mapbox/satellite-v9') {
      changeStyle('mapbox://styles/mapbox/satellite-streets-v12')
    } else if (!on && mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12') {
      changeStyle('mapbox://styles/mapbox/satellite-v9')
    }
  }, [mapStyle, changeStyle])

  const toggleSatellite = useCallback(() => {
    const styleMap: Record<string, string> = {
      'mapbox://styles/mapbox/dark-v11': 'mapbox://styles/mapbox/satellite-v9',
      'mapbox://styles/mapbox/streets-v12': 'mapbox://styles/mapbox/satellite-streets-v12',
      'mapbox://styles/mapbox/satellite-v9': 'mapbox://styles/mapbox/dark-v11',
      'mapbox://styles/mapbox/satellite-streets-v12': 'mapbox://styles/mapbox/streets-v12',
    }
    const target = styleMap[mapStyle]
    if (target) changeStyle(target)
  }, [mapStyle, changeStyle])

  // ── Share handler ─────────────────────────────────────────────────────

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

  // ── Derived values ────────────────────────────────────────────────────

  const recentCluster = clusters[0] ?? null
  const activeWarningCount = warningClusters.filter((w) => w.status === 'active').length
  const isSatelliteStyle =
    mapStyle === 'mapbox://styles/mapbox/satellite-v9' ||
    mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12'
  const roadsDisabled = !isSatelliteStyle
  const roadsOn = mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12'
  const satelliteOn = isSatelliteStyle

  // ── Render ────────────────────────────────────────────────────────────

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

      {/* Loading overlay */}
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
        <div style={{ flex: 1, textAlign: 'center', overflow: 'hidden' }}>
          {activeWarningCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
              <span style={{ color: '#f97316', fontSize: 11, fontWeight: 500 }}>
                {activeWarningCount} evacuation warning{activeWarningCount !== 1 ? 's' : ''} active
              </span>
            </div>
          )}
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {recentCluster
              ? `${locationNames[recentCluster.id] ?? 'Loading location...'} · ${recentCluster.report_count} reports · ${timeAgo(recentCluster.created_at)}`
              : 'Monitoring active — no confirmed incidents'}
          </div>
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

      {/* ── Mobile controls toggle button ──────────────────────────────── */}
      {isMobile && (
        <button
          type="button"
          onClick={() => setShowControls((v) => !v)}
          aria-label="Toggle map controls"
          style={{
            position: 'absolute',
            top: 56,
            right: 12,
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'rgba(10,10,15,0.9)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 6,
          }}
        >
          {/* Layers icon — 3 stacked bars */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="0" y="1" width="14" height="2" rx="1" fill="white" />
            <rect x="0" y="6" width="14" height="2" rx="1" fill="white" />
            <rect x="0" y="11" width="14" height="2" rx="1" fill="white" />
          </svg>
        </button>
      )}

      {/* ── PART 1: Style switcher ─────────────────────────────────────── */}
      {(showControls || !isMobile) && (
        <div
          style={{
            position: 'absolute',
            top: isMobile ? 100 : 56,
            right: 12,
            background: 'rgba(10,10,15,0.9)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 12,
            border: '0.5px solid rgba(255,255,255,0.1)',
            padding: 10,
            zIndex: 5,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Map style
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
            }}
          >
            {MAP_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => changeStyle(s.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 8,
                    background: s.color,
                    border:
                      mapStyle === s.id
                        ? '2px solid #ef4444'
                        : '1px solid rgba(255,255,255,0.2)',
                    boxSizing: 'border-box',
                  }}
                />
                <div
                  style={{
                    fontSize: 10,
                    color: '#ffffff',
                    marginTop: 4,
                  }}
                >
                  {s.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── PART 2: Layer controls ─────────────────────────────────────── */}
      {(showControls || !isMobile) && (
        <div
          style={{
            position: 'absolute',
            top: isMobile ? 100 + 170 + 8 : 56 + 170 + 8,
            right: 12,
            background: 'rgba(10,10,15,0.9)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 12,
            border: '0.5px solid rgba(255,255,255,0.1)',
            padding: 10,
            zIndex: 5,
            width: 158,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Layers
          </div>

          {/* Layer rows */}
          {[
            {
              dot: '#ef4444',
              label: 'Strike zones',
              on: layerStrikeZones,
              toggle: toggleStrikeZones,
              disabled: false,
            },
            {
              dot: '#f97316',
              label: 'Labels',
              on: layerLabels,
              toggle: toggleLabels,
              disabled: false,
            },
            {
              dot: '#3b82f6',
              label: 'Roads',
              on: roadsOn,
              toggle: toggleRoads,
              disabled: roadsDisabled,
            },
            {
              dot: '#22c55e',
              label: 'Satellite',
              on: satelliteOn,
              toggle: toggleSatellite,
              disabled: false,
            },
            {
              dot: '#a855f7',
              label: 'Density heat',
              on: layerHeatDensity,
              toggle: toggleHeatDensity,
              disabled: false,
            },
          ].map((layer) => (
            <div
              key={layer.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                opacity: layer.disabled ? 0.35 : 1,
              }}
            >
              {/* Dot */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: layer.dot,
                  flexShrink: 0,
                }}
              />
              {/* Label */}
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: '#ffffff',
                }}
              >
                {layer.label}
              </span>
              {/* iOS toggle */}
              <button
                type="button"
                disabled={layer.disabled}
                onClick={() => {
                  if (layer.label === 'Satellite') {
                    toggleSatellite()
                  } else {
                    layer.toggle(!layer.on)
                  }
                }}
                style={{
                  position: 'relative',
                  width: 28,
                  height: 16,
                  borderRadius: 8,
                  background: layer.on ? '#ef4444' : '#374151',
                  border: 'none',
                  cursor: layer.disabled ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                  padding: 0,
                  transition: 'background 0.2s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: layer.on ? 14 : 2,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#ffffff',
                    transition: 'left 0.2s',
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── PART 3: Coordinates display ────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          background: 'rgba(10,10,15,0.7)',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          zIndex: 5,
          fontFamily: 'monospace',
        }}
      >
        {mouseCoords.lat}° N {'  '} {mouseCoords.lon}° E
      </div>

      {/* ── PART 5: Mini legend ────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 32,
          right: 8,
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 8,
          padding: '8px 12px',
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Strike confidence
        </div>
        {/* Confirmed 85+ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'rgba(255,255,255,0.7)',
            marginBottom: 5,
          }}
        >
          <span
            style={{
              width: 20,
              height: 2.5,
              background: '#22c55e',
              borderRadius: 2,
              flexShrink: 0,
            }}
          />
          Confirmed 85+
        </div>
        {/* Probable 50–84 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'rgba(255,255,255,0.7)',
            marginBottom: 5,
          }}
        >
          <span
            style={{
              width: 20,
              height: 1.5,
              background: '#22c55e',
              borderRadius: 2,
              flexShrink: 0,
            }}
          />
          Probable 50–84
        </div>
        {/* Auto-confirmed */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#f97316',
              flexShrink: 0,
              marginLeft: 6,
              marginRight: 6,
            }}
          />
          Auto-confirmed
        </div>
        {/* Evacuation warning */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 8, marginBottom: 5 }}>
          <span style={{ width: 20, height: 1.5, background: '#f97316', borderRadius: 2, flexShrink: 0, borderTop: '1px dashed #f97316' }} />
          Evacuation warning
        </div>
        {/* All clear */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          All clear reported
        </div>
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
                  boxSizing: 'border-box' as const,
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
                  boxSizing: 'border-box' as const,
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

      {/* Warning side panel */}
      {selectedWarning && (
        <div
          style={
            isMobile
              ? {
                  position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: '16px 16px 0 0', maxHeight: '70vh', overflowY: 'auto',
                  background: 'rgba(15,17,27,0.97)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  borderTop: '0.5px solid rgba(255,255,255,0.08)', padding: '20px 16px', zIndex: 6, boxSizing: 'border-box' as const,
                }
              : {
                  position: 'absolute', top: 56, right: 0, width: 320, height: 'calc(100vh - 56px)', overflowY: 'auto',
                  background: 'rgba(15,17,27,0.97)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  borderLeft: '0.5px solid rgba(255,255,255,0.08)', padding: '20px 16px', zIndex: 6, boxSizing: 'border-box' as const,
                }
          }
        >
          <button type="button" onClick={() => setSelectedWarning(null)} aria-label="Close panel" style={{
            position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
            width: 28, height: 28, color: '#ffffff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>×</button>

          {/* Status badge */}
          <div style={{ marginBottom: 8 }}>
            <span style={{
              display: 'inline-block',
              background: selectedWarning.status === 'all_clear' ? '#052e16' : '#431407',
              color: selectedWarning.status === 'all_clear' ? '#86efac' : '#fdba74',
              fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 500,
            }}>
              {selectedWarning.status === 'all_clear' ? 'All clear' : 'Active warning'}
            </span>
          </div>

          {/* Location */}
          <p style={{ fontSize: 18, fontWeight: 500, color: '#ffffff', margin: '8px 0 4px 0', paddingRight: 36 }}>
            {selectedWarning.location_name ?? 'Unknown location'}
          </p>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 4px 0' }}>
            Warning received {timeAgo(selectedWarning.created_at)}
          </p>

          <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', margin: '12px 0' }} />

          {/* Warning type */}
          <div style={{ marginBottom: 14 }}>
            <span style={{
              display: 'inline-block', background: '#431407', color: '#fdba74',
              fontSize: 11, padding: '3px 9px', borderRadius: 20,
            }}>
              {formatWarningType(selectedWarning.dominant_warning_type)}
            </span>
          </div>

          {/* Report count */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: '#ffffff' }}>
              {selectedWarning.warning_count} people reported this warning
            </div>
          </div>

          {/* Expires */}
          {selectedWarning.status === 'active' && selectedWarning.expires_at && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Expires</div>
              <div style={{ fontSize: 13, color: '#ffffff' }}>{timeAgo(selectedWarning.expires_at)}</div>
            </div>
          )}

          {/* Source detail */}
          {selectedWarning.source_detail && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>What was reported</div>
              <p style={{
                fontSize: 13, color: '#9ca3af', lineHeight: 1.6, margin: 0, fontStyle: 'italic',
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
              }}>
                {selectedWarning.source_detail}
              </p>
            </div>
          )}

          {/* All clear button */}
          {selectedWarning.status === 'active' && (
            <button type="button" onClick={handleAllClear} disabled={allClearSent} style={{
              width: '100%', height: 48, background: 'transparent',
              border: allClearSent ? '1px solid #6b7280' : '1px solid #22c55e',
              color: allClearSent ? '#6b7280' : '#22c55e',
              borderRadius: 8, fontSize: 14, cursor: allClearSent ? 'default' : 'pointer', marginBottom: 8, boxSizing: 'border-box',
            }}>
              {allClearSent ? 'All clear reported ✓' : 'Report all clear'}
            </button>
          )}

          {/* Share */}
          <button type="button" onClick={handleShare} style={{
            width: '100%', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)',
            color: '#ffffff', borderRadius: 8, padding: 10, fontSize: 13, cursor: 'pointer', marginTop: 4, boxSizing: 'border-box',
          }}>
            Share this warning
          </button>
        </div>
      )}
    </div>
  )
}
