'use client'

import { useEffect, useRef, useState } from 'react'
import { useConfirm } from '@/lib/ngo-ui'

declare global {
  interface Window { mapboxgl: any }
}

// Operational area editor. An org_admin draws a polygon over their area of
// operations in Lebanon; it saves to ngo_organisations.operational_area as a
// GeoJSON Polygon and re-renders on reload. Drawing is a simple click-to-add
// tool (no mapbox-gl-draw dependency), mirroring app/admin/map.

type Pt = [number, number]
const LEBANON_CENTER: Pt = [35.86, 33.87]

type Polygon = { type: 'Polygon'; coordinates: number[][][] }
// True only for an actual GeoJSON Polygon with a usable ring. Guards against the
// free-text {description} note the column may hold before an area is drawn.
function isPolygon(area: unknown): area is Polygon {
  const a = area as Polygon | null
  return !!a && a.type === 'Polygon' && Array.isArray(a.coordinates) && Array.isArray(a.coordinates[0]) && a.coordinates[0].length >= 4
}

export default function NgoSetupPage() {
  const confirm = useConfirm()
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const map = useRef<any>(null)
  const drawModeRef = useRef(false)
  const pointsRef = useRef<Pt[]>([])

  const [mapLoaded, setMapLoaded] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [points, setPoints] = useState<Pt[]>([])
  const [saved, setSaved] = useState<{ type: 'Polygon'; coordinates: number[][][] } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canEdit = role === 'org_admin'

  // Keep refs in sync so the (once-bound) map click handler reads fresh values.
  useEffect(() => { drawModeRef.current = drawMode }, [drawMode])
  useEffect(() => { pointsRef.current = points }, [points])

  // ── Who am I ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/ngo/auth/check')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRole(d?.role ?? null))
      .catch(() => {})
  }, [])

  // ── Map init ─────────────────────────────────────────────────────────────
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
        center: LEBANON_CENTER,
        zoom: 8,
        attributionControl: false,
      })
      map.current.on('load', () => setMapLoaded(true))

      // Single click handler; behaviour switches on the draw-mode ref.
      map.current.on('click', (e: any) => {
        if (!drawModeRef.current) return
        const pt: Pt = [e.lngLat.lng, e.lngLat.lat]
        setPoints((prev) => [...prev, pt])
      })
    }
    document.head.appendChild(script)

    return () => { if (map.current) map.current.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load saved area ───────────────────────────────────────────────────────
  // Only accept a real GeoJSON Polygon. The column can also hold a free-text
  // {description} note from signup; treating that as a polygon would crash the
  // renderer below (saved.coordinates would be undefined).
  useEffect(() => {
    fetch('/api/ngo/org/area')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (isPolygon(d?.area)) setSaved(d.area) })
      .catch(() => {})
  }, [])

  // ── Render the saved polygon ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const m = map.current
    const data = isPolygon(saved)
      ? { type: 'Feature', geometry: saved, properties: {} }
      : { type: 'FeatureCollection', features: [] }
    if (m.getSource('saved-area')) {
      m.getSource('saved-area').setData(data)
    } else {
      m.addSource('saved-area', { type: 'geojson', data })
      m.addLayer({ id: 'saved-area-fill', type: 'fill', source: 'saved-area', paint: { 'fill-color': '#3fb950', 'fill-opacity': 0.15 } })
      m.addLayer({ id: 'saved-area-line', type: 'line', source: 'saved-area', paint: { 'line-color': '#3fb950', 'line-width': 2 } })
    }
    // Fit to the saved area once.
    if (isPolygon(saved)) {
      const ring = saved.coordinates[0]
      const lons = ring.map((p) => p[0])
      const lats = ring.map((p) => p[1])
      m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, duration: 0 })
    }
  }, [mapLoaded, saved])

  // ── Render in-progress draw preview ───────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const m = map.current
    const feats =
      points.length > 0
        ? [
            { type: 'Feature', geometry: { type: 'LineString', coordinates: [...points, points[0]] }, properties: {} },
            ...points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} })),
          ]
        : []
    const data = { type: 'FeatureCollection', features: feats }
    if (m.getSource('draw-preview')) {
      m.getSource('draw-preview').setData(data)
    } else {
      m.addSource('draw-preview', { type: 'geojson', data })
      m.addLayer({ id: 'draw-line', type: 'line', source: 'draw-preview', paint: { 'line-color': '#58a6ff', 'line-width': 2, 'line-dasharray': [2, 1] }, filter: ['==', '$type', 'LineString'] })
      m.addLayer({ id: 'draw-points', type: 'circle', source: 'draw-preview', paint: { 'circle-radius': 5, 'circle-color': '#58a6ff' }, filter: ['==', '$type', 'Point'] })
    }
  }, [mapLoaded, points])

  function startDraw() {
    setStatus(null)
    setPoints([])
    setDrawMode(true)
  }
  function clearDraw() {
    setPoints([])
    setDrawMode(false)
  }
  function undoPoint() {
    setPoints((prev) => prev.slice(0, -1))
  }

  async function save() {
    if (points.length < 3) {
      setStatus('Add at least 3 points to define an area.')
      return
    }
    const closed: number[][] = [...points, points[0]]
    const polygon = { type: 'Polygon' as const, coordinates: [closed] }
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/ngo/org/area', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: polygon }),
      })
      const data = await res.json()
      if (res.ok) {
        setSaved(polygon)
        setPoints([])
        setDrawMode(false)
        setStatus('Operational area saved.')
      } else {
        setStatus(data.error ?? 'Could not save.')
      }
    } catch {
      setStatus('Could not save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function clearArea() {
    if (!(await confirm({ title: 'Clear the operational area?', body: 'Incidents will no longer be flagged inside/outside it until you draw a new one.', danger: true, confirmLabel: 'Clear' }))) return
    setBusy(true); setStatus(null)
    try {
      const res = await fetch('/api/ngo/org/area', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area: null }) })
      const data = await res.json()
      if (res.ok) { setSaved(null); setPoints([]); setDrawMode(false); setStatus('Operational area cleared.') }
      else setStatus(data.error ?? 'Could not clear.')
    } catch { setStatus('Could not clear. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      <div style={panel}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Operational area</div>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
          {canEdit
            ? 'Draw the polygon covering your area of operations.'
            : 'View only — the operational area is managed by an org admin.'}
        </div>

        {canEdit && (
          <>
            {!drawMode ? (
              <button type="button" onClick={startDraw} style={btn(true)}>
                {saved ? 'Redraw area' : 'Draw area'}
              </button>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#58a6ff', marginBottom: 8 }}>
                  Click the map to add points ({points.length}).
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" onClick={undoPoint} disabled={!points.length} style={{ ...btn(false), flex: 1 }}>Undo</button>
                  <button type="button" onClick={clearDraw} style={{ ...btn(false), flex: 1 }}>Cancel</button>
                </div>
                <button type="button" onClick={save} disabled={busy || points.length < 3} style={{ ...btn(true), opacity: busy || points.length < 3 ? 0.6 : 1 }}>
                  {busy ? 'Saving…' : 'Save area'}
                </button>
              </>
            )}
          </>
        )}

        {saved && !drawMode && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#3fb950' }}>✓ Area defined</div>
            {canEdit && (
              <button type="button" onClick={clearArea} disabled={busy} style={{ ...btn(false), marginTop: 8, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>Clear area</button>
            )}
          </div>
        )}
        {status && <div style={{ fontSize: 12, color: '#e6edf3', marginTop: 10 }}>{status}</div>}
      </div>
    </div>
  )
}

const panel: React.CSSProperties = {
  position: 'absolute', top: 16, left: 16, zIndex: 5, width: 240,
  background: 'rgba(13,17,23,0.95)', border: '1px solid #21262d', borderRadius: 8,
  padding: 14, fontFamily: 'system-ui, sans-serif', color: '#e6edf3',
}
function btn(primary: boolean): React.CSSProperties {
  return {
    width: '100%', height: 36, borderRadius: 6, fontSize: 13, cursor: 'pointer',
    fontFamily: 'system-ui', fontWeight: primary ? 600 : 400,
    background: primary ? '#238636' : 'rgba(255,255,255,0.04)',
    border: primary ? '1px solid #2ea043' : '1px solid #21262d',
    color: primary ? '#fff' : '#8b949e',
  }
}
