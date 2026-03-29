'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { mapboxgl: any }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapCluster {
  id: string
  status: string
  confidence_score: number
  report_count: number
  centroid_lat: number
  centroid_lon: number
  location_name: string | null
  created_at: string
  display_radius_metres: number
  ai_reasoning: string | null
}

interface MapReport {
  id: string
  lat: number
  lon: number
  created_at: string
}

interface DrawZone {
  id: string
  name: string
  zone_type: string
  color: string
  geometry: { type: string; coordinates: number[][][] }
}

interface NewsPin {
  id: string
  title: string
  location_lat: number
  location_lon: number
  source: string
}

interface LayerState {
  confirmed: boolean
  pending: boolean
  discarded: boolean
  heatmap: boolean
  zones: boolean
  news: boolean
  reports_density: boolean
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminMapPage() {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [allClusters, setAllClusters] = useState<MapCluster[]>([])
  const [rawReports, setRawReports] = useState<MapReport[]>([])
  const [zones, setZones] = useState<DrawZone[]>([])
  const [newsPins, setNewsPins] = useState<NewsPin[]>([])
  const [layers, setLayers] = useState<LayerState>({
    confirmed: true,
    pending: true,
    discarded: false,
    heatmap: false,
    zones: true,
    news: true,
    reports_density: false,
  })
  const [drawMode, setDrawMode] = useState(false)
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([])
  const [timeRange, setTimeRange] = useState(30)
  const [selectedFeature, setSelectedFeature] = useState<MapCluster | null>(null)
  const [zoneName, setZoneName] = useState('')
  const [zoneType, setZoneType] = useState('monitoring')
  const [showZoneModal, setShowZoneModal] = useState(false)

  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)

  // ── Data fetching ──────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/incidents?filter=all&limit=200').then((r) => r.json()),
      fetch('/api/admin/reports?limit=500').then((r) => r.json()),
      fetch('/api/admin/zones').then((r) => r.json()).catch(() => ({ zones: [] })),
      fetch('/api/admin/news?limit=50').then((r) => r.json()).catch(() => ({ articles: [] })),
    ]).then(([clustersData, reportsData, zonesData, newsData]) => {
      setAllClusters((clustersData as { clusters?: MapCluster[] }).clusters ?? [])
      setRawReports(
        ((reportsData as { reports?: MapReport[] }).reports ?? []).map((r: MapReport) => ({
          id: r.id,
          lat: r.lat,
          lon: r.lon,
          created_at: r.created_at,
        })),
      )
      setZones((zonesData as { zones?: DrawZone[] }).zones ?? [])
      const articles = (newsData as { articles?: NewsPin[] }).articles ?? []
      setNewsPins(articles.filter((a: NewsPin) => a.location_lat && a.location_lon))
    })
  }, [])

  // ── Update map sources ─────────────────────────────────────────────────

  const updateSources = useCallback(() => {
    if (!map.current || !mapLoaded) return
    const m = map.current

    const cutoff = timeRange === 0 ? 0 : Date.now() - timeRange * 86400000
    const filterTime = (dateStr: string) => timeRange === 0 || new Date(dateStr).getTime() >= cutoff

    // Clusters
    const confirmedFeatures = allClusters
      .filter((c) => (c.status === 'confirmed' || c.status === 'auto_confirmed') && filterTime(c.created_at))
      .map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.centroid_lon, c.centroid_lat] },
        properties: { id: c.id, radius: c.display_radius_metres, status: c.status, report_count: c.report_count, confidence: c.confidence_score },
      }))

    const pendingFeatures = allClusters
      .filter((c) => c.status === 'pending_review' && filterTime(c.created_at))
      .map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.centroid_lon, c.centroid_lat] },
        properties: { id: c.id, radius: c.display_radius_metres },
      }))

    const discardedFeatures = allClusters
      .filter((c) => c.status === 'discarded' && filterTime(c.created_at))
      .map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.centroid_lon, c.centroid_lat] },
        properties: { id: c.id },
      }))

    const reportFeatures = rawReports
      .filter((r) => filterTime(r.created_at))
      .map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] },
        properties: {},
      }))

    // Set sources
    const setOrAdd = (sourceId: string, data: object) => {
      const src = m.getSource(sourceId)
      if (src) src.setData(data)
      else m.addSource(sourceId, { type: 'geojson', data })
    }

    setOrAdd('confirmed-clusters', { type: 'FeatureCollection', features: confirmedFeatures })
    setOrAdd('pending-clusters', { type: 'FeatureCollection', features: pendingFeatures })
    setOrAdd('discarded-clusters', { type: 'FeatureCollection', features: discardedFeatures })
    setOrAdd('raw-reports', { type: 'FeatureCollection', features: reportFeatures })

    // Zones
    const zoneFeatures = zones.map((z) => ({
      type: 'Feature' as const,
      geometry: z.geometry,
      properties: { name: z.name, color: z.color, zone_type: z.zone_type },
    }))
    setOrAdd('zones-source', { type: 'FeatureCollection', features: zoneFeatures })

    // News pins
    const newsFeatures = newsPins.map((n) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [n.location_lon, n.location_lat] },
      properties: { title: n.title, source: n.source },
    }))
    setOrAdd('news-pins', { type: 'FeatureCollection', features: newsFeatures })

    // Add layers if not present
    if (!m.getLayer('confirmed-fill')) {
      m.addLayer({ id: 'confirmed-fill', type: 'circle', source: 'confirmed-clusters', paint: { 'circle-radius': 12, 'circle-color': '#f85149', 'circle-opacity': 0.3 } })
      m.addLayer({ id: 'confirmed-dots', type: 'circle', source: 'confirmed-clusters', paint: { 'circle-radius': 5, 'circle-color': '#f85149', 'circle-opacity': 0.9 } })
    }
    if (!m.getLayer('pending-fill')) {
      m.addLayer({ id: 'pending-fill', type: 'circle', source: 'pending-clusters', paint: { 'circle-radius': 10, 'circle-color': '#58a6ff', 'circle-opacity': 0.15 } })
      m.addLayer({ id: 'pending-dots', type: 'circle', source: 'pending-clusters', paint: { 'circle-radius': 4, 'circle-color': '#58a6ff', 'circle-opacity': 0.8, 'circle-stroke-width': 1, 'circle-stroke-color': '#58a6ff' } })
    }
    if (!m.getLayer('discarded-fill')) {
      m.addLayer({ id: 'discarded-fill', type: 'circle', source: 'discarded-clusters', paint: { 'circle-radius': 8, 'circle-color': '#484f58', 'circle-opacity': 0.06 } })
    }
    if (!m.getLayer('reports-heatmap')) {
      m.addLayer({ id: 'reports-heatmap', type: 'heatmap', source: 'raw-reports', paint: { 'heatmap-intensity': 1, 'heatmap-radius': 20, 'heatmap-opacity': 0.6, 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, '#d29922', 0.6, '#f97316', 1, '#f85149'] }, layout: { visibility: 'none' } })
    }
    if (!m.getLayer('reports-dots')) {
      m.addLayer({ id: 'reports-dots', type: 'circle', source: 'raw-reports', paint: { 'circle-radius': 2, 'circle-color': '#d29922', 'circle-opacity': 0.3 }, layout: { visibility: 'none' } })
    }
    if (!m.getLayer('zones-fill')) {
      m.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones-source', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 } })
      m.addLayer({ id: 'zones-outline', type: 'line', source: 'zones-source', paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.5, 'line-width': 1.5 } })
    }
    if (!m.getLayer('news-pins-layer')) {
      m.addLayer({ id: 'news-pins-layer', type: 'circle', source: 'news-pins', paint: { 'circle-radius': 5, 'circle-color': '#a371f7', 'circle-opacity': 0.8 } })
    }

    // Visibility
    const vis = (layerId: string, on: boolean) => {
      if (m.getLayer(layerId)) m.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none')
    }
    vis('confirmed-fill', layers.confirmed)
    vis('confirmed-dots', layers.confirmed)
    vis('pending-fill', layers.pending)
    vis('pending-dots', layers.pending)
    vis('discarded-fill', layers.discarded)
    vis('reports-heatmap', layers.heatmap)
    vis('reports-dots', layers.reports_density)
    vis('zones-fill', layers.zones)
    vis('zones-outline', layers.zones)
    vis('news-pins-layer', layers.news)
  }, [mapLoaded, allClusters, rawReports, zones, newsPins, layers, timeRange])

  useEffect(() => { updateSources() }, [updateSources])

  // ── Map init ───────────────────────────────────────────────────────────

  useEffect(() => {
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
        zoom: 8,
        attributionControl: false,
      })
      map.current.on('load', () => setMapLoaded(true))

      // Click cluster to select
      map.current.on('click', 'confirmed-dots', (e: any) => {
        const id = e.features?.[0]?.properties?.id
        const cluster = allClusters.find((c) => c.id === id)
        if (cluster) setSelectedFeature(cluster)
      })
      map.current.on('click', 'pending-dots', (e: any) => {
        const id = e.features?.[0]?.properties?.id
        const cluster = allClusters.find((c) => c.id === id)
        if (cluster) setSelectedFeature(cluster)
      })
    }
    document.head.appendChild(script)

    return () => { if (map.current) map.current.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Draw mode click handler ────────────────────────────────────────────

  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!drawMode) return

    const handleClick = (e: any) => {
      const point: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      setDrawPoints((prev) => {
        const updated = [...prev, point]
        // Draw preview
        const m = map.current
        const src = m.getSource('draw-preview')
        if (src) {
          src.setData({
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', geometry: { type: 'LineString', coordinates: [...updated, updated[0]] }, properties: {} },
              ...updated.map((p: [number, number]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} })),
            ],
          })
        } else {
          m.addSource('draw-preview', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [
                { type: 'Feature', geometry: { type: 'LineString', coordinates: [...updated, updated[0]] }, properties: {} },
                ...updated.map((p: [number, number]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} })),
              ],
            },
          })
          m.addLayer({ id: 'draw-line', type: 'line', source: 'draw-preview', paint: { 'line-color': '#a371f7', 'line-width': 2 }, filter: ['==', '$type', 'LineString'] })
          m.addLayer({ id: 'draw-points', type: 'circle', source: 'draw-preview', paint: { 'circle-radius': 5, 'circle-color': '#a371f7' }, filter: ['==', '$type', 'Point'] })
        }

        // Close polygon if clicking near first point and 3+ points
        if (updated.length >= 4) {
          const first = updated[0]
          const dx = point[0] - first[0]
          const dy = point[1] - first[1]
          if (Math.sqrt(dx * dx + dy * dy) < 0.005) {
            setShowZoneModal(true)
          }
        }
        return updated
      })
    }

    map.current.on('click', handleClick)
    return () => { if (map.current) map.current.off('click', handleClick) }
  }, [drawMode, mapLoaded])

  // ── Save zone ──────────────────────────────────────────────────────────

  async function saveZone() {
    if (drawPoints.length < 3) return
    const coords = [...drawPoints, drawPoints[0]]
    await fetch('/api/admin/zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: zoneName || 'Untitled zone',
        zone_type: zoneType,
        color: '#3fb950',
        geometry: { type: 'Polygon', coordinates: [coords] },
      }),
    })
    // Cleanup
    setDrawMode(false)
    setDrawPoints([])
    setShowZoneModal(false)
    setZoneName('')
    if (map.current?.getLayer('draw-line')) map.current.removeLayer('draw-line')
    if (map.current?.getLayer('draw-points')) map.current.removeLayer('draw-points')
    if (map.current?.getSource('draw-preview')) map.current.removeSource('draw-preview')
    // Refresh zones
    const res = await fetch('/api/admin/zones').catch(() => null)
    if (res) {
      const data = (await res.json()) as { zones?: DrawZone[] }
      setZones(data.zones ?? [])
    }
  }

  function cancelDraw() {
    setDrawMode(false)
    setDrawPoints([])
    setShowZoneModal(false)
    if (map.current?.getLayer('draw-line')) map.current.removeLayer('draw-line')
    if (map.current?.getLayer('draw-points')) map.current.removeLayer('draw-points')
    if (map.current?.getSource('draw-preview')) map.current.removeSource('draw-preview')
  }

  // ── Toggle helper ──────────────────────────────────────────────────────

  function toggleLayer(key: keyof LayerState) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Approve/Reject ─────────────────────────────────────────────────────

  async function handleApprove() {
    if (!selectedFeature) return
    await fetch('/api/admin/clusters/' + selectedFeature.id + '/approve', { method: 'POST', credentials: 'include' })
    setSelectedFeature(null)
  }

  async function handleReject() {
    if (!selectedFeature) return
    await fetch('/api/admin/clusters/' + selectedFeature.id + '/reject', { method: 'POST', credentials: 'include' })
    setSelectedFeature(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const TIME_OPTIONS = [
    { label: '7d', value: 7 },
    { label: '14d', value: 14 },
    { label: '30d', value: 30 },
    { label: 'All', value: 0 },
  ]

  const LAYER_SECTIONS: { title: string; items: { key: keyof LayerState; dot: string; label: string }[] }[] = [
    {
      title: 'Clusters',
      items: [
        { key: 'confirmed', dot: '#f85149', label: 'Confirmed' },
        { key: 'pending', dot: '#58a6ff', label: 'Pending' },
        { key: 'discarded', dot: '#484f58', label: 'Discarded' },
      ],
    },
    {
      title: 'Reports',
      items: [
        { key: 'heatmap', dot: '#d29922', label: 'Heat density' },
        { key: 'reports_density', dot: '#d29922', label: 'Raw reports' },
      ],
    },
    {
      title: 'Overlays',
      items: [
        { key: 'zones', dot: '#3fb950', label: 'Drawn zones' },
        { key: 'news', dot: '#a371f7', label: 'News pins' },
      ],
    },
  ]

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Map container */}
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {/* Loading */}
      {!mapLoaded && (
        <div style={{ position: 'absolute', inset: 0, background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <span style={{ color: '#484f58', fontSize: 14 }}>Loading map...</span>
        </div>
      )}

      {/* Layer control panel */}
      <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(13,17,23,0.95)', border: '1px solid #21262d', borderRadius: 8, padding: 12, width: 220, zIndex: 5 }}>
        <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Admin layers</div>

        {LAYER_SECTIONS.map((section, si) => (
          <div key={section.title}>
            {si > 0 && <div style={{ borderTop: '1px solid #21262d', margin: '8px 0' }} />}
            <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{section.title}</div>
            {section.items.map((item) => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 28, fontSize: 12, color: '#8b949e', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.dot, flexShrink: 0 }} />
                  {item.label}
                </div>
                <div
                  onClick={() => toggleLayer(item.key)}
                  style={{ width: 28, height: 16, borderRadius: 8, background: layers[item.key] ? '#f85149' : '#21262d', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
                >
                  <span style={{ position: 'absolute', top: 2, left: layers[item.key] ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Time range */}
        <div style={{ borderTop: '1px solid #21262d', margin: '8px 0' }} />
        <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Time range</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {TIME_OPTIONS.map((opt) => (
            <button key={opt.label} type="button" onClick={() => setTimeRange(opt.value)} style={{
              flex: 1, height: 24, fontSize: 11, borderRadius: 4, cursor: 'pointer', fontFamily: 'system-ui',
              background: timeRange === opt.value ? 'rgba(88,166,255,0.1)' : 'transparent',
              border: timeRange === opt.value ? '1px solid rgba(88,166,255,0.3)' : '1px solid #21262d',
              color: timeRange === opt.value ? '#58a6ff' : '#484f58',
            }}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Draw zone */}
        <div style={{ borderTop: '1px solid #21262d', margin: '8px 0' }} />
        <button type="button" onClick={() => drawMode ? cancelDraw() : setDrawMode(true)} style={{
          width: '100%', height: 32,
          background: drawMode ? 'rgba(163,113,247,0.15)' : 'rgba(255,255,255,0.04)',
          border: drawMode ? '1px solid rgba(163,113,247,0.4)' : '1px solid #21262d',
          color: drawMode ? '#a371f7' : '#8b949e',
          borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui',
        }}>
          {drawMode ? 'Cancel drawing' : 'Draw zone +'}
        </button>
      </div>

      {/* Draw mode instruction */}
      {drawMode && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(163,113,247,0.3)', borderRadius: 6, padding: '8px 16px', fontSize: 12, color: '#a371f7', zIndex: 5 }}>
          Click on the map to draw a zone. Click first point to close.
        </div>
      )}

      {/* Zone name modal */}
      {showZoneModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 20, width: 320 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3', marginBottom: 12 }}>Save zone</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>Zone name</div>
            <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="e.g. Hospital buffer zone" style={{ width: '100%', height: 36, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '0 10px', fontSize: 13, color: '#e6edf3', fontFamily: 'system-ui', boxSizing: 'border-box', outline: 'none', marginBottom: 10 }} />
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>Type</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {['monitoring', 'exclusion', 'evacuation'].map((t) => (
                <button key={t} type="button" onClick={() => setZoneType(t)} style={{
                  flex: 1, height: 28, fontSize: 11, borderRadius: 4, cursor: 'pointer', fontFamily: 'system-ui',
                  background: zoneType === t ? 'rgba(63,185,80,0.1)' : 'transparent',
                  border: zoneType === t ? '1px solid rgba(63,185,80,0.3)' : '1px solid #21262d',
                  color: zoneType === t ? '#3fb950' : '#8b949e',
                }}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={cancelDraw} style={{ flex: 1, height: 36, background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }}>Cancel</button>
              <button type="button" onClick={saveZone} style={{ flex: 1, height: 36, background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui', fontWeight: 500 }}>Save zone</button>
            </div>
          </div>
        </div>
      )}

      {/* Selected feature panel */}
      {selectedFeature && (
        <div style={{ position: 'absolute', top: 12, left: 12, width: 300, background: 'rgba(13,17,23,0.97)', border: '1px solid #21262d', borderRadius: 8, padding: 16, zIndex: 5, maxHeight: 'calc(100% - 24px)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>
                {selectedFeature.location_name ?? selectedFeature.centroid_lat.toFixed(3) + ', ' + selectedFeature.centroid_lon.toFixed(3)}
              </div>
              <div style={{ fontSize: 11, color: '#484f58' }}>{timeAgo(selectedFeature.created_at)}</div>
            </div>
            <button type="button" onClick={() => setSelectedFeature(null)} style={{ width: 24, height: 24, background: '#21262d', border: 'none', borderRadius: '50%', color: '#8b949e', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 4, padding: '6px 8px' }}>
              <div style={{ fontSize: 9, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confidence</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: confColour(selectedFeature.confidence_score) }}>{selectedFeature.confidence_score}%</div>
            </div>
            <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 4, padding: '6px 8px' }}>
              <div style={{ fontSize: 9, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reports</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>{selectedFeature.report_count}</div>
            </div>
          </div>

          {selectedFeature.ai_reasoning && (
            <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.5, background: '#161b22', border: '1px solid #21262d', borderRadius: 4, padding: 8, marginBottom: 10 }}>{selectedFeature.ai_reasoning}</div>
          )}

          {selectedFeature.status === 'pending_review' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={handleApprove} style={{ flex: 1, height: 32, background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui' }}>Confirm</button>
              <button type="button" onClick={handleReject} style={{ flex: 1, height: 32, background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui' }}>Reject</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
