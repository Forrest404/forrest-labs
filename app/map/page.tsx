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
  status: 'confirmed' | 'auto_confirmed' | 'news_verified' | 'official_verified' | 'pending_review'
  confidence_score: number
  display_radius_metres: number
  dominant_event_types: string[]
  ai_reasoning: string | null
  report_count: number
  created_at: string
  source_name: string | null
  source_url: string | null
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
  const [sentinelVisible, setSentinelVisible] = useState(false)
  const sentinelVisibleRef = useRef(false)

  // ── Warning state ──────────────────────────────────────────────────────
  const [warningClusters, setWarningClusters] = useState<WarningCluster[]>([])
  const [selectedWarning, setSelectedWarning] = useState<WarningCluster | null>(null)
  const [allClearSent, setAllClearSent] = useState(false)
  const [warningBannerDismissed, setWarningBannerDismissed] = useState(false)
  const [warningBannerIndex, setWarningBannerIndex] = useState(0)

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
  const warningPulseRef = useRef<number>(0)

  // ── Sync refs ────────────────────────────────────────────────────────────
  useEffect(() => { locationNamesRef.current = locationNames }, [locationNames])
  useEffect(() => { clustersRef.current = clusters }, [clusters])
  useEffect(() => { layerStrikeZonesRef.current = layerStrikeZones }, [layerStrikeZones])
  useEffect(() => { layerLabelsRef.current = layerLabels }, [layerLabels])
  useEffect(() => { layerHeatDensityRef.current = layerHeatDensity }, [layerHeatDensity])
  useEffect(() => { sentinelVisibleRef.current = sentinelVisible }, [sentinelVisible])
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
          source_name: c.source_name ?? '',
          source_url: c.source_url ?? '',
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
          ['==', ['get', 'status'], 'official_verified'], '#a371f7',
          ['==', ['get', 'status'], 'news_verified'], '#58a6ff',
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
          ['==', ['get', 'status'], 'official_verified'], '#a371f7',
          ['==', ['get', 'status'], 'news_verified'], '#58a6ff',
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
          ['==', ['get', 'status'], 'official_verified'], '#a371f7',
          ['==', ['get', 'status'], 'news_verified'], '#58a6ff',
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

    // Compute a geographic radius per warning: 300m base + 100m per report, max 1000m
    const warningRadius = (w: WarningCluster) => Math.min(300 + w.warning_count * 100, 1000)

    // Polygon source — geographically accurate radius rings
    const radiusGeojson = {
      type: 'FeatureCollection' as const,
      features: data.map((w) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [circlePolygon(w.centroid_lon, w.centroid_lat, warningRadius(w))],
        },
        properties: { id: w.id, status: w.status },
      })),
    }

    // Outer ring — 1.3× radius, active only
    const outerGeojson = {
      type: 'FeatureCollection' as const,
      features: data.filter((w) => w.status === 'active').map((w) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [circlePolygon(w.centroid_lon, w.centroid_lat, warningRadius(w) * 1.3)],
        },
        properties: { id: w.id, status: w.status },
      })),
    }

    // Point source for dots + labels
    const dotGeojson = {
      type: 'FeatureCollection' as const,
      features: data.map((w) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [w.centroid_lon, w.centroid_lat] },
        properties: {
          id: w.id, warning_count: w.warning_count,
          dominant_warning_type: w.dominant_warning_type,
          confidence_score: w.confidence_score, status: w.status,
          location_name: w.location_name ?? '', created_at: w.created_at,
          expires_at: w.expires_at ?? '',
        },
      })),
    }

    if (map.current.getSource('warnings-radius')) {
      map.current.getSource('warnings-radius').setData(radiusGeojson)
      map.current.getSource('warnings-outer').setData(outerGeojson)
      map.current.getSource('warnings-dots').setData(dotGeojson)
      return
    }

    map.current.addSource('warnings-radius', { type: 'geojson', data: radiusGeojson })
    map.current.addSource('warnings-outer', { type: 'geojson', data: outerGeojson })
    map.current.addSource('warnings-dots', { type: 'geojson', data: dotGeojson })

    // Outer ring fill (faint)
    map.current.addLayer({
      id: 'warning-outer-ring',
      type: 'line',
      source: 'warnings-outer',
      paint: {
        'line-color': '#f97316',
        'line-width': 1,
        'line-opacity': 0.3,
      },
    }, map.current.getLayer('cluster-radius') ? 'cluster-radius' : undefined)

    // Warning radius fill
    map.current.addLayer({
      id: 'warning-radius',
      type: 'fill',
      source: 'warnings-radius',
      paint: {
        'fill-color': ['case', ['==', ['get', 'status'], 'all_clear'], '#22c55e', '#f97316'],
        'fill-opacity': 0.12,
      },
    }, map.current.getLayer('cluster-radius') ? 'cluster-radius' : undefined)

    // Warning radius outline
    map.current.addLayer({
      id: 'warning-radius-outline',
      type: 'line',
      source: 'warnings-radius',
      paint: {
        'line-color': ['case', ['==', ['get', 'status'], 'all_clear'], '#22c55e', '#f97316'],
        'line-width': 2,
        'line-opacity': 0.7,
        'line-dasharray': [4, 3],
      },
    }, map.current.getLayer('cluster-radius') ? 'cluster-radius' : undefined)

    // Warning centre dots (point layer, stays as circle for the small dot marker)
    map.current.addLayer({
      id: 'warning-dots',
      type: 'circle',
      source: 'warnings-dots',
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
      source: 'warnings-dots',
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

    // Warning dot hover tooltip
    let warningPopup: { remove: () => void } | null = null
    map.current.on('mouseenter', 'warning-dots', (e: any) => {
      if (!map.current) return
      map.current.getCanvas().style.cursor = 'pointer'
      const coords = e.features[0].geometry.coordinates.slice()
      const name = e.features[0].properties.location_name || 'Warning zone'
      warningPopup = new window.mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 })
        .setLngLat(coords)
        .setHTML(`<div style="background:#1a130a;border:1px solid #f97316;border-radius:6px;padding:5px 10px;font-size:12px;color:#fdba74">${name}</div>`)
        .addTo(map.current)
    })
    map.current.on('mouseleave', 'warning-dots', () => {
      if (map.current) map.current.getCanvas().style.cursor = ''
      if (warningPopup) { warningPopup.remove(); warningPopup = null }
    })
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

  const startWarningPulse = useCallback(() => {
    cancelAnimationFrame(warningPulseRef.current)
    let opacity = 0.12
    let dir = 1
    const animate = () => {
      opacity += dir * 0.003
      if (opacity >= 0.22) dir = -1
      if (opacity <= 0.06) dir = 1
      if (map.current?.getLayer('warning-radius')) {
        map.current.setPaintProperty('warning-radius', 'fill-opacity', opacity)
      }
      warningPulseRef.current = requestAnimationFrame(animate)
    }
    warningPulseRef.current = requestAnimationFrame(animate)
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

    // Sentinel layer
    if (sentinelVisibleRef.current) {
      if (!map.current.getSource('sentinel')) {
        map.current.addSource('sentinel', {
          type: 'raster',
          tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg'],
          tileSize: 256,
          attribution: 'Sentinel-2 / ESA / EOX',
        })
      }
      if (!map.current.getLayer('sentinel-layer')) {
        // Insert below all cluster layers
        const firstLayer = map.current.getLayer('cluster-pulse') ? 'cluster-pulse' : undefined
        map.current.addLayer({
          id: 'sentinel-layer',
          type: 'raster',
          source: 'sentinel',
          layout: { visibility: 'visible' },
        }, firstLayer)
      } else {
        map.current.setLayoutProperty('sentinel-layer', 'visibility', 'visible')
      }
    }

    // Pulse
    startPulseAnimation()
    startWarningPulse()
  }, [startPulseAnimation, startWarningPulse])

  // ── Data loading (unchanged) ────────────────────────────────────────────

  const loadClusters = useCallback(async () => {
    const { data } = await supabase.current
      .from('clusters')
      .select('*')
      .in('status', ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified'])
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
        },
        (payload: RealtimePostgresChangesPayload<Cluster>) => {
          if (
            payload.eventType === 'INSERT' ||
            payload.eventType === 'UPDATE'
          ) {
            const newCluster = payload.new as Cluster
            const showStatuses = ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified']
            if (!showStatuses.includes(newCluster.status)) return
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
        },
        (payload: RealtimePostgresChangesPayload<WarningCluster>) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newWarning = payload.new as WarningCluster
            if (newWarning.status !== 'active' && newWarning.status !== 'all_clear' && newWarning.status !== 'strike_confirmed') return
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
        center: [35.86, 33.87],
        zoom: 8,
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
        startWarningPulse()

        // Fly to coordinates from URL params
        const urlParams = new URLSearchParams(window.location.search)
        const flyLat = urlParams.get('lat')
        const flyLon = urlParams.get('lon')
        const flyZoom = urlParams.get('zoom')
        if (flyLat && flyLon) {
          setTimeout(() => {
            if (map.current) {
              map.current.flyTo({
                center: [parseFloat(flyLon), parseFloat(flyLat)],
                zoom: parseFloat(flyZoom ?? '14'),
                duration: 1500,
              })
            }
          }, 500)
        }
      })
    }
    document.head.appendChild(script)

    const sb = supabase.current

    return () => {
      window.removeEventListener('resize', checkMobile)
      sb.removeAllChannels()
      cancelAnimationFrame(pulseFrameRef.current)
      cancelAnimationFrame(warningPulseRef.current)
      if (map.current) map.current.remove()
    }
  }, [loadClusters, setupRealtimeSubscription, attachMapHandlers, reAddOptionalLayers, startPulseAnimation, startWarningPulse])

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
    // Hide sentinel when switching to a non-sentinel style
    if (styleId !== 'sentinel' && map.current.getLayer('sentinel-layer')) {
      map.current.setLayoutProperty('sentinel-layer', 'visibility', 'none')
    }
    setSentinelVisible(false)
    map.current.setStyle(styleId)
    setMapStyle(styleId)
  }, [])

  const toggleSentinel = useCallback(() => {
    if (!map.current) return
    if (sentinelVisible) {
      // Turn off — hide sentinel layer
      if (map.current.getLayer('sentinel-layer')) {
        map.current.setLayoutProperty('sentinel-layer', 'visibility', 'none')
      }
      setSentinelVisible(false)
    } else {
      // Turn on — add source/layer if needed, show it
      setSentinelVisible(true)
      if (!map.current.getSource('sentinel')) {
        map.current.addSource('sentinel', {
          type: 'raster',
          tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg'],
          tileSize: 256,
          attribution: 'Sentinel-2 / ESA / EOX',
        })
      }
      if (!map.current.getLayer('sentinel-layer')) {
        const firstLayer = map.current.getLayer('cluster-pulse') ? 'cluster-pulse' : undefined
        map.current.addLayer({
          id: 'sentinel-layer',
          type: 'raster',
          source: 'sentinel',
          layout: { visibility: 'visible' },
        }, firstLayer)
      } else {
        map.current.setLayoutProperty('sentinel-layer', 'visibility', 'visible')
      }
    }
  }, [sentinelVisible])

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
  const activeWarnings = warningClusters.filter((w) => w.status === 'active')
  const activeWarningCount = activeWarnings.length
  const bannerWarning = activeWarnings[warningBannerIndex % Math.max(activeWarnings.length, 1)] ?? null
  const showBanner = activeWarningCount > 0 && !warningBannerDismissed
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
        .mapboxgl-popup-content { background: transparent !important; padding: 0 !important; box-shadow: none !important; }
        .mapboxgl-popup-tip { display: none !important; }
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

      {/* Warning banner */}
      {showBanner && bannerWarning && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
          background: 'rgba(249,115,22,0.15)', borderBottom: '1px solid rgba(249,115,22,0.4)',
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, animation: 'pulse-dot 1.4s ease-in-out infinite' }}>
            <path d="M8 2L15 14H1L8 2Z" stroke="#f97316" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          </svg>
          <div
            onClick={() => {
              if (map.current && bannerWarning) {
                map.current.flyTo({ center: [bannerWarning.centroid_lon, bannerWarning.centroid_lat], zoom: 14, duration: 1000 })
                setSelectedWarning(bannerWarning)
                setSelectedCluster(null)
              }
            }}
            style={{ flex: 1, cursor: 'pointer', fontSize: 12, color: '#fdba74', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
          >
            EVACUATION WARNING — {bannerWarning.location_name ?? 'Unknown'} · {bannerWarning.warning_count} reports · tap to view
          </div>
          {activeWarningCount > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button type="button" onClick={() => setWarningBannerIndex((i) => (i - 1 + activeWarningCount) % activeWarningCount)} style={{ background: 'none', border: 'none', color: '#fdba74', fontSize: 14, cursor: 'pointer', padding: 2 }}>←</button>
              <span style={{ fontSize: 10, color: '#fdba74' }}>{(warningBannerIndex % activeWarningCount) + 1}/{activeWarningCount}</span>
              <button type="button" onClick={() => setWarningBannerIndex((i) => (i + 1) % activeWarningCount)} style={{ background: 'none', border: 'none', color: '#fdba74', fontSize: 14, cursor: 'pointer', padding: 2 }}>→</button>
            </div>
          )}
          <button type="button" onClick={() => setWarningBannerDismissed(true)} style={{ background: 'none', border: 'none', color: '#fdba74', fontSize: 16, cursor: 'pointer', padding: '0 4px', flexShrink: 0, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: showBanner ? 38 : 0,
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
          transition: 'top 0.3s',
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
              background: recentCluster?.status === 'official_verified' ? '#a371f7' : '#ef4444',
              animation: 'pulse-dot 1.4s ease-in-out infinite',
            }}
          />
          <span
            style={{
              color: recentCluster?.status === 'official_verified' ? '#a371f7' : '#ef4444',
              fontSize: 10,
              letterSpacing: '0.15em',
              fontWeight: 600,
            }}
          >
            {recentCluster?.status === 'official_verified' ? 'OFFICIAL' : 'LIVE'}
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
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 1 }}>
            {clusters.length} confirmed incident{clusters.length !== 1 ? 's' : ''} · {activeWarningCount} active warning{activeWarningCount !== 1 ? 's' : ''}
          </div>
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
            top: showBanner ? 94 : 56,
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
            transition: 'top 0.3s',
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
            top: isMobile ? (showBanner ? 138 : 100) : (showBanner ? 56 + 38 + 8 : 56 + 8),
            right: 12,
            background: 'rgba(10,10,15,0.9)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 12,
            border: '0.5px solid rgba(255,255,255,0.1)',
            padding: 10,
            zIndex: 5,
            transition: 'top 0.3s',
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
                onClick={() => { changeStyle(s.id) }}
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
                      mapStyle === s.id && !sentinelVisible
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
            {/* Live Sentinel-2 satellite */}
            <button
              type="button"
              onClick={toggleSentinel}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'center',
                gridColumn: '1 / -1',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: 36,
                  borderRadius: 8,
                  background: '#0a1a0a',
                  border: sentinelVisible
                    ? '2px solid #22c55e'
                    : '1px solid rgba(255,255,255,0.2)',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#22c55e',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 500 }}>LIVE</span>
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: '#ffffff',
                  marginTop: 4,
                }}
              >
                Live Sat (5d)
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── PART 2: Layer controls ─────────────────────────────────────── */}
      {(showControls || !isMobile) && (
        <div
          style={{
            position: 'absolute',
            top: isMobile ? (showBanner ? 138 + 268 + 12 : 100 + 268 + 12) : (showBanner ? 56 + 38 + 8 + 268 + 12 : 56 + 8 + 268 + 12),
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
          bottom: 96,
          right: 8,
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 8,
          padding: '8px 12px',
          zIndex: 5,
        }}
      >
        {/* STRIKES section */}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Strikes</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a371f7', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          Officially verified (OCHA/MoPH)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#58a6ff', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          News verified
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          Civilian confirmed
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          AI auto-confirmed
        </div>
        {/* Divider */}
        <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.1)', margin: '8px 0' }} />
        {/* WARNINGS section */}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Warnings</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', flexShrink: 0, marginLeft: 6, marginRight: 6, boxShadow: '0 0 0 2px rgba(249,115,22,0.3)' }} />
          Active evacuation warning
        </div>
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
                  selectedCluster.status === 'official_verified' ? '#1a0e2e'
                    : selectedCluster.status === 'news_verified' ? '#0d1b2e'
                    : selectedCluster.status === 'confirmed' ? '#052e16'
                    : '#431407',
                color:
                  selectedCluster.status === 'official_verified' ? '#a371f7'
                    : selectedCluster.status === 'news_verified' ? '#58a6ff'
                    : selectedCluster.status === 'confirmed' ? '#86efac'
                    : '#fdba74',
                fontSize: 11,
                padding: '3px 9px',
                borderRadius: 20,
                fontWeight: 500,
              }}
            >
              {selectedCluster.status === 'official_verified' ? 'Officially verified'
                : selectedCluster.status === 'news_verified' ? 'News verified'
                : selectedCluster.status === 'confirmed' ? 'Confirmed'
                : 'Auto-confirmed'}
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

          {/* Verified by source */}
          {selectedCluster.source_name && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Verified by</div>
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                color: selectedCluster.status === 'official_verified' ? '#a371f7' : '#58a6ff',
              }}>
                {selectedCluster.source_name}
              </div>
              {selectedCluster.source_url && (
                <div
                  onClick={() => window.open(selectedCluster.source_url!, '_blank')}
                  style={{ fontSize: 11, color: '#58a6ff', cursor: 'pointer', marginTop: 4 }}
                >
                  Read article ↗
                </div>
              )}
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

          {/* Amber triangle header */}
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L29 27H3L16 4Z" stroke="#f97316" strokeWidth="2" fill="none" strokeLinejoin="round" />
            </svg>
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

          {/* Time remaining with urgency */}
          {(() => {
            if (selectedWarning.status === 'all_clear') {
              return <p style={{ fontSize: 13, color: '#22c55e', margin: '0 0 4px 0' }}>All clear reported</p>
            }
            if (!selectedWarning.expires_at) {
              return <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 4px 0' }}>Warning received {timeAgo(selectedWarning.created_at)}</p>
            }
            const msRemaining = new Date(selectedWarning.expires_at).getTime() - Date.now()
            const hoursLeft = msRemaining / 3600000
            const minsLeft = Math.max(0, Math.floor(msRemaining / 60000))
            if (msRemaining <= 0) return <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 4px 0' }}>Expired</p>
            if (hoursLeft > 2) return <p style={{ fontSize: 13, color: '#22c55e', margin: '0 0 4px 0' }}>Active for {Math.floor(hoursLeft)} more hours</p>
            if (hoursLeft >= 1) return <p style={{ fontSize: 13, color: '#f97316', margin: '0 0 4px 0' }}>Expires in {Math.floor(hoursLeft)}h {minsLeft % 60}m</p>
            return <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 4px 0', animation: 'pulse-dot 1.4s ease-in-out infinite' }}>Expires in {minsLeft} minutes</p>
          })()}

          <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', margin: '12px 0' }} />

          {/* Warning type — large pill */}
          <div style={{ marginBottom: 14 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 16px',
              background: 'rgba(249,115,22,0.15)', border: '1px solid #f97316', color: '#fdba74',
              fontSize: 13, fontWeight: 500, borderRadius: 20,
            }}>
              {formatWarningType(selectedWarning.dominant_warning_type)}
            </span>
          </div>

          {/* Report count with progress bar */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Reports</div>
            <div style={{ background: '#1f2937', borderRadius: 2, height: 4, width: '100%', marginBottom: 4 }}>
              <div style={{
                background: selectedWarning.warning_count >= 3 ? '#22c55e' : '#f97316',
                borderRadius: 2, height: 4,
                width: `${Math.min(selectedWarning.warning_count / 3, 1) * 100}%`,
              }} />
            </div>
            <div style={{ fontSize: 13, color: selectedWarning.warning_count >= 3 ? '#22c55e' : '#ffffff' }}>
              {selectedWarning.warning_count >= 3 ? 'Threshold reached — on map' : `${selectedWarning.warning_count} of 3 reports needed`}
            </div>
          </div>

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

          {/* All clear button with vote dots */}
          {selectedWarning.status === 'active' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6, justifyContent: 'center' }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: i < (allClearSent ? selectedWarning.all_clear_votes + 1 : selectedWarning.all_clear_votes) ? '#22c55e' : '#374151',
                  }} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', marginBottom: 6 }}>
                {allClearSent ? 'Your all-clear recorded' : `${selectedWarning.all_clear_votes} / 5 all-clear reports`}
              </div>
              <button type="button" onClick={handleAllClear} disabled={allClearSent} style={{
                width: '100%', height: 48, background: 'transparent',
                border: allClearSent ? '1px solid #6b7280' : '1px solid #22c55e',
                color: allClearSent ? '#6b7280' : '#22c55e',
                borderRadius: 8, fontSize: 14, cursor: allClearSent ? 'default' : 'pointer', boxSizing: 'border-box',
              }}>
                {allClearSent ? 'All clear reported ✓' : 'Report all clear'}
              </button>
            </div>
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
