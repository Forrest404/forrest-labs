'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

declare global {
  interface Window { mapboxgl: any }
}

// Situation board — the NGO home screen. One map (incidents + own team pins +
// coverage gaps + operational area) plus a collapsible incident feed.
// Reads /api/ngo/board (org-scoped, read-only on clusters) and refreshes on a
// short poll without a full reload. Mirrors the public map's colours.

const STATUS_COLOUR_EXPR = [
  'case',
  ['==', ['get', 'status'], 'official_verified'], '#a371f7',
  ['==', ['get', 'status'], 'news_verified'], '#58a6ff',
  ['==', ['get', 'status'], 'confirmed'], '#ef4444',
  ['==', ['get', 'status'], 'auto_confirmed'], '#f97316',
  '#ef4444',
] as any

const STATUS_HEX: Record<string, string> = {
  official_verified: '#a371f7', news_verified: '#58a6ff', confirmed: '#ef4444', auto_confirmed: '#f97316',
}
const STATUS_LABEL: Record<string, string> = {
  official_verified: 'Official', news_verified: 'News verified', confirmed: 'Confirmed', auto_confirmed: 'Auto',
}
const TEAM_STATUS_COLOUR: Record<string, string> = {
  standby: '#3fb950', deployed: '#d29922', unavailable: '#8b949e', offline: '#484f58',
}

interface CustomIncident {
  id: string; title: string; category: string | null; severity: string; description: string | null
  address: string | null; lat: number; lon: number; created_at: string; covered: boolean
}
const SEVERITY_COLOUR: Record<string, string> = { low: '#58a6ff', medium: '#d29922', high: '#f97316', critical: '#f85149' }
const CATEGORIES = ['medical', 'fire', 'rescue', 'flood', 'shelter', 'security', 'other']

// Selectable base map styles.
const MAP_STYLES = [
  { id: 'dark', label: 'Dark', url: 'mapbox://styles/mapbox/dark-v11' },
  { id: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-v9' },
  { id: 'sat-streets', label: 'Satellite + roads', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
] as const

// Add our sources + layers. Idempotent (guards on getSource/getLayer) so it can be
// re-run after a base-style switch, which wipes custom layers.
function setupBoardLayers(m: any) {
  if (!m) return
  const empty = { type: 'FeatureCollection', features: [] }
  const src = (id: string) => { if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: empty }) }
  src('area'); src('inc-radius'); src('inc-dots'); src('gaps'); src('teams'); src('panics'); src('custom-inc')
  const layer = (def: any) => { if (!m.getLayer(def.id)) m.addLayer(def) }

  layer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#58a6ff', 'fill-opacity': 0.05 } })
  layer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#58a6ff', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.5 } })
  layer({ id: 'gap-glow', type: 'circle', source: 'gaps', paint: { 'circle-radius': 22, 'circle-color': '#f85149', 'circle-opacity': 0.35, 'circle-blur': 0.6 } })
  layer({ id: 'inc-radius-fill', type: 'fill', source: 'inc-radius', paint: { 'fill-color': STATUS_COLOUR_EXPR, 'fill-opacity': ['case', ['get', 'inside'], 0.25, 0.04] } })
  layer({ id: 'inc-radius-line', type: 'line', source: 'inc-radius', paint: { 'line-color': STATUS_COLOUR_EXPR, 'line-width': 1.2, 'line-opacity': ['case', ['get', 'inside'], 0.8, 0.2] } })
  layer({ id: 'inc-dots', type: 'circle', source: 'inc-dots', paint: { 'circle-radius': 7, 'circle-color': STATUS_COLOUR_EXPR, 'circle-opacity': ['case', ['get', 'inside'], 1, 0.3], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': ['case', ['get', 'inside'], 0.8, 0.2] } })
  layer({ id: 'team-dots', type: 'circle', source: 'teams', paint: { 'circle-radius': 8, 'circle-color': ['case', ['==', ['get', 'status'], 'standby'], TEAM_STATUS_COLOUR.standby, ['==', ['get', 'status'], 'deployed'], TEAM_STATUS_COLOUR.deployed, ['==', ['get', 'status'], 'unavailable'], TEAM_STATUS_COLOUR.unavailable, TEAM_STATUS_COLOUR.offline], 'circle-stroke-color': '#0d1117', 'circle-stroke-width': 2 } })
  layer({ id: 'team-labels', type: 'symbol', source: 'teams', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-max-width': 14 }, paint: { 'text-color': '#e6edf3', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.5 } })
  // Custom (org-created) incidents — severity-coloured square markers + label; an
  // uncovered one shows an amber ring.
  layer({ id: 'custom-inc-ring', type: 'circle', source: 'custom-inc', filter: ['!', ['get', 'covered']], paint: { 'circle-radius': 16, 'circle-color': '#f97316', 'circle-opacity': 0.3, 'circle-blur': 0.5 } })
  layer({ id: 'custom-inc-dot', type: 'circle', source: 'custom-inc', paint: { 'circle-radius': 8, 'circle-color': ['case', ['==', ['get', 'severity'], 'critical'], SEVERITY_COLOUR.critical, ['==', ['get', 'severity'], 'high'], SEVERITY_COLOUR.high, ['==', ['get', 'severity'], 'low'], SEVERITY_COLOUR.low, SEVERITY_COLOUR.medium], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } })
  layer({ id: 'custom-inc-label', type: 'symbol', source: 'custom-inc', layout: { 'text-field': ['get', 'title'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-max-width': 12 }, paint: { 'text-color': '#e6edf3', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.5 } })
  layer({ id: 'panic-glow', type: 'circle', source: 'panics', paint: { 'circle-radius': 26, 'circle-color': '#f85149', 'circle-opacity': 0.4, 'circle-blur': 0.5 } })
  layer({ id: 'panic-dot', type: 'circle', source: 'panics', paint: { 'circle-radius': 9, 'circle-color': '#f85149', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } })
  layer({ id: 'panic-label', type: 'symbol', source: 'panics', layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-max-width': 14 }, paint: { 'text-color': '#f85149', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.5 } })
}

interface Incident {
  id: string; lat: number; lon: number; status: string; confidence_score: number
  report_count: number; created_at: string; radius_metres: number; inside: boolean; covered: boolean
}
interface TeamPin {
  id: string; name: string; type: string; status: string; lat: number; lon: number; last_seen_at: string | null
}
interface Panic {
  id: string; ngo_user_id: string; name: string; lat: number | null; lon: number | null; created_at: string
}
interface RollCall {
  id: string; created_at: string; message: string | null; safe_count: number; total: number
  members: { id: string; name: string; safe: boolean }[]
}
interface Dispatch {
  id: string; cluster_id: string | null; ngo_incident_id?: string | null; team_id: string; team_name: string | null; status: string; response_minutes: number | null
}
interface RankedTeam {
  id: string; name: string; type: string; status: string; type_match: boolean; distance_km: number | null; busy: boolean
}
const ACTIVE_DISPATCH = ['assigned', 'en_route', 'on_scene']
const DISPATCH_LABEL: Record<string, string> = { assigned: 'Assigned', en_route: 'En route', on_scene: 'On scene', done: 'Done', cancelled: 'Cancelled' }

// Geographic radius (metres) → polygon ring of [lon,lat] (from app/map/page.tsx).
function circlePolygon(lon: number, lat: number, radiusMeters: number, steps = 48): [number, number][] {
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

function timeAgo(iso: string | null): string {
  if (!iso) return 'unknown'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NgoBoardPage() {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const map = useRef<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const dataRef = useRef<{ incidents: Incident[]; teams: TeamPin[]; area: any; panics: Panic[]; customIncidents: CustomIncident[] } | null>(null)

  const [incidents, setIncidents] = useState<Incident[]>([])
  const [teams, setTeams] = useState<TeamPin[]>([])
  const [panics, setPanics] = useState<Panic[]>([])
  const [rollCall, setRollCall] = useState<RollCall | null>(null)
  const [rcBusy, setRcBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [locNames, setLocNames] = useState<Record<string, string>>({})
  const locNamesRef = useRef<Record<string, string>>({})
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [assignFor, setAssignFor] = useState<Incident | null>(null)
  const [rankedTeams, setRankedTeams] = useState<RankedTeam[]>([])
  const [assignNote, setAssignNote] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [recallFor, setRecallFor] = useState<{ id: string; team: string | null } | null>(null)
  const [recallReason, setRecallReason] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [windowDays, setWindowDays] = useState<string>('10') // '10' | '30' | '90' | 'all'
  const daysRef = useRef('10')
  useEffect(() => { daysRef.current = windowDays }, [windowDays])
  const [mapStyle, setMapStyle] = useState<string>('dark')
  const [panicDispatchFor, setPanicDispatchFor] = useState<Panic | null>(null)
  const [panicTeams, setPanicTeams] = useState<{ id: string; name: string; type: string; status: string }[]>([])
  const [panicBusy, setPanicBusy] = useState(false)
  // Custom incidents
  const [customIncidents, setCustomIncidents] = useState<CustomIncident[]>([])
  const [creating, setCreating] = useState(false) // map-pick mode
  const creatingRef = useRef(false)
  useEffect(() => {
    creatingRef.current = creating
    if (map.current?.getCanvas) { try { map.current.getCanvas().style.cursor = creating ? 'crosshair' : '' } catch { /* map not ready */ } }
  }, [creating])
  const [newInc, setNewInc] = useState<{ lat: number; lon: number; address: string; title: string; category: string; severity: string; description: string } | null>(null)
  const [addr, setAddr] = useState('')
  const [incBusy, setIncBusy] = useState(false)
  const [assignIncFor, setAssignIncFor] = useState<CustomIncident | null>(null)
  const [incTeams, setIncTeams] = useState<{ id: string; name: string; type: string; status: string }[]>([])

  function changeMapStyle(id: string) {
    const s = MAP_STYLES.find((x) => x.id === id)
    if (!s || !map.current) return
    setMapStyle(id)
    map.current.setStyle(s.url)
    // setStyle wipes custom layers — re-add them and repaint once the new style loads.
    map.current.once('style.load', () => { setupBoardLayers(map.current); renderSources() })
  }

  useEffect(() => { locNamesRef.current = locNames }, [locNames])

  // ── Reverse geocode (mirrors app/map/page.tsx fetchLocationName) ───────────
  const fetchLocationName = useCallback(async (lat: number, lon: number, id: string) => {
    if (locNamesRef.current[id]) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&types=neighborhood,locality,place`
    try {
      const res = await fetch(url)
      const data = (await res.json()) as { features: { place_name: string }[] }
      const name = data.features?.[0]?.place_name ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`
      setLocNames((p) => (p[id] ? p : { ...p, [id]: name }))
    } catch {
      setLocNames((p) => (p[id] ? p : { ...p, [id]: `${lat.toFixed(3)}, ${lon.toFixed(3)}` }))
    }
  }, [])

  // ── Render all map sources from the latest data ────────────────────────────
  const renderSources = useCallback(() => {
    const m = map.current
    const d = dataRef.current
    if (!m || !d) return

    const radiusFC = {
      type: 'FeatureCollection',
      features: d.incidents.map((c) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [circlePolygon(c.lon, c.lat, c.radius_metres)] },
        properties: { id: c.id, status: c.status, inside: c.inside },
      })),
    }
    const dotFC = {
      type: 'FeatureCollection',
      features: d.incidents.map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        properties: { id: c.id, status: c.status, inside: c.inside },
      })),
    }
    // Coverage gaps: in-area incidents with no active dispatch.
    const gapFC = {
      type: 'FeatureCollection',
      features: d.incidents.filter((c) => c.inside && !c.covered).map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        properties: { id: c.id },
      })),
    }
    const teamFC = {
      type: 'FeatureCollection',
      features: d.teams.map((t) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
        properties: { id: t.id, status: t.status, label: `${t.name} · ${timeAgo(t.last_seen_at)}` },
      })),
    }
    const areaFC = d.area ? { type: 'Feature', geometry: d.area, properties: {} } : { type: 'FeatureCollection', features: [] }
    // Panic markers — only those with a known location.
    const panicFC = {
      type: 'FeatureCollection',
      features: (d.panics ?? []).filter((p) => p.lat != null && p.lon != null).map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { id: p.id, label: `🆘 ${p.name}` },
      })),
    }

    const customFC = {
      type: 'FeatureCollection',
      features: (d.customIncidents ?? []).map((i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [i.lon, i.lat] },
        properties: { id: i.id, title: i.title, severity: i.severity, covered: i.covered },
      })),
    }

    const set = (id: string, data: any) => { const s = m.getSource(id); if (s) s.setData(data) }
    set('area', areaFC); set('inc-radius', radiusFC); set('inc-dots', dotFC); set('gaps', gapFC); set('teams', teamFC); set('panics', panicFC); set('custom-inc', customFC)
  }, [])

  // ── Fetch board data ───────────────────────────────────────────────────────
  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/ngo/board?days=${daysRef.current}`)
      if (!res.ok) { setLoadError(true); setLoaded(true); return }
      const data = await res.json()
      setLoadError(false); setLoaded(true)
      const inc: Incident[] = data.incidents ?? []
      const tms: TeamPin[] = data.teams ?? []
      const pnc: Panic[] = data.panics ?? []
      const cinc: CustomIncident[] = data.custom_incidents ?? []
      dataRef.current = { incidents: inc, teams: tms, area: data.operational_area, panics: pnc, customIncidents: cinc }
      setIncidents(inc)
      setTeams(tms)
      setPanics(pnc)
      setCustomIncidents(cinc)
      setRollCall(data.roll_call ?? null)
      setDispatches(data.dispatches ?? [])
      renderSources()

      // In-area feed → geocode for labels.
      inc.filter((c) => c.inside).forEach((c) => fetchLocationName(c.lat, c.lon, c.id))
    } catch { setLoadError(true); setLoaded(true) /* keep last good data */ }
  }, [renderSources, fetchLocationName])

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
        center: [35.86, 33.87],
        zoom: 8,
        attributionControl: false,
      })
      map.current.on('load', () => {
        setupBoardLayers(map.current)
        setMapLoaded(true)
      })
      // Pick-on-map for a new custom incident.
      map.current.on('click', (e: any) => {
        if (!creatingRef.current) return
        const lat = e.lngLat.lat, lon = e.lngLat.lng
        setCreating(false)
        setNewInc({ lat, lon, address: '', title: '', category: 'medical', severity: 'medium', description: '' })
        reverseForForm(lat, lon)
      })
      map.current.getCanvas().style.cursor = ''
    }
    document.head.appendChild(script)
    return () => { if (map.current) map.current.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live data: poll every 7s, and refetch instantly when the tab regains focus.
  // Independent of the map so the feed / roll-call / panics stay live even before
  // (or without) the map finishing load.
  useEffect(() => {
    fetchBoard()
    const id = setInterval(fetchBoard, 7000)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchBoard() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', fetchBoard)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', fetchBoard)
    }
  }, [fetchBoard])

  // When the map becomes ready, paint the latest data onto it.
  useEffect(() => { if (mapLoaded) renderSources() }, [mapLoaded, renderSources])

  // Pulse the coverage-gap and panic glows.
  useEffect(() => {
    if (!mapLoaded) return
    let t = 0
    const id = setInterval(() => {
      if (!map.current?.getLayer('gap-glow')) return
      t += 0.1
      const o = 0.25 + 0.2 * Math.abs(Math.sin(t))
      map.current.setPaintProperty('gap-glow', 'circle-opacity', o)
      if (map.current.getLayer('panic-glow')) map.current.setPaintProperty('panic-glow', 'circle-opacity', 0.3 + 0.3 * Math.abs(Math.sin(t)))
    }, 100)
    return () => clearInterval(id)
  }, [mapLoaded])

  async function startRollCall() {
    setRcBusy(true)
    try {
      const res = await fetch('/api/ngo/safety/roll-call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (res.ok) fetchBoard()
    } finally { setRcBusy(false) }
  }

  async function openAssign(c: Incident) {
    setAssignFor(c); setAssignNote(''); setRankedTeams([])
    try {
      const res = await fetch(`/api/ngo/dispatch/teams?cluster_id=${c.id}`)
      if (res.ok) setRankedTeams((await res.json()).teams ?? [])
    } catch { /* show empty */ }
  }
  async function assignTeam(teamId: string) {
    if (!assignFor) return
    setAssignBusy(true)
    try {
      const res = await fetch('/api/ngo/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cluster_id: assignFor.id, team_id: teamId, note: assignNote || undefined }) })
      if (res.ok) { setAssignFor(null); fetchBoard() }
    } finally { setAssignBusy(false) }
  }
  function setWindow(v: string) {
    setWindowDays(v); daysRef.current = v; fetchBoard()
  }
  async function resolvePanic(panicId: string) {
    const res = await fetch(`/api/ngo/safety/panic/${panicId}/resolve`, { method: 'POST' })
    if (res.ok) fetchBoard()
  }
  async function openPanicDispatch(p: Panic) {
    setPanicDispatchFor(p); setPanicTeams([]); setPanicBusy(false)
    try {
      const res = await fetch('/api/ngo/teams')
      if (res.ok) setPanicTeams((await res.json()).teams ?? [])
    } catch { /* show empty */ }
  }
  async function sendPanicTeam(teamId: string) {
    if (!panicDispatchFor) return
    setPanicBusy(true)
    try {
      const res = await fetch(`/api/ngo/safety/panic/${panicDispatchFor.id}/dispatch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId }),
      })
      if (res.ok) { setPanicDispatchFor(null); fetchBoard() }
    } finally { setPanicBusy(false) }
  }

  // ── Custom incidents (911-style) ───────────────────────────────────────────
  async function reverseForForm(lat: number, lon: number) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    try {
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&types=address,neighborhood,locality,place`)
      const d = await res.json()
      const name = d.features?.[0]?.place_name ?? ''
      setNewInc((p) => (p ? { ...p, address: name } : p))
    } catch { /* leave blank */ }
  }
  async function geocodeAddress() {
    if (!addr.trim()) return
    setIncBusy(true)
    try {
      const res = await fetch(`/api/ngo/incidents/geocode?q=${encodeURIComponent(addr)}`)
      const d = await res.json()
      if (d.result) setNewInc({ lat: d.result.lat, lon: d.result.lon, address: d.result.label, title: '', category: 'medical', severity: 'medium', description: '' })
    } finally { setIncBusy(false) }
  }
  async function createIncident() {
    if (!newInc || !newInc.title.trim()) return
    setIncBusy(true)
    try {
      const res = await fetch('/api/ngo/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newInc) })
      if (res.ok) { setNewInc(null); setAddr(''); fetchBoard() }
    } finally { setIncBusy(false) }
  }
  async function resolveIncident(id: string) {
    if (!window.confirm('Mark this incident resolved? It leaves the board.')) return
    const res = await fetch(`/api/ngo/incidents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) })
    if (res.ok) fetchBoard()
  }
  async function openAssignIncident(i: CustomIncident) {
    setAssignIncFor(i); setIncTeams([])
    try { const res = await fetch('/api/ngo/teams'); if (res.ok) setIncTeams((await res.json()).teams ?? []) } catch { /* empty */ }
  }
  async function assignIncidentTeam(teamId: string) {
    if (!assignIncFor) return
    setIncBusy(true)
    try {
      const res = await fetch('/api/ngo/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ngo_incident_id: assignIncFor.id, team_id: teamId }) })
      if (res.ok) { setAssignIncFor(null); fetchBoard() }
    } finally { setIncBusy(false) }
  }
  async function confirmRecall() {
    if (!recallFor) return
    const res = await fetch(`/api/ngo/dispatch/${recallFor.id}/recall`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: recallReason }) })
    if (res.ok) { setRecallFor(null); setRecallReason(''); fetchBoard() }
  }
  const activeDispatchFor = (clusterId: string) => dispatches.find((d) => d.cluster_id === clusterId && ACTIVE_DISPATCH.includes(d.status))

  const feed = incidents.filter((c) => c.inside)
  const gapCount = feed.filter((c) => !c.covered).length

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {/* Loading / refresh-error chip (top-left) */}
      {!loaded && <div style={statusChip}>Loading…</div>}
      {loaded && loadError && (
        <div style={{ ...statusChip, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>
          Couldn’t refresh <button type="button" onClick={fetchBoard} style={chipRetry}>Retry</button>
        </div>
      )}

      {/* Base-map style switcher */}
      <div style={styleSwitcher}>
        {MAP_STYLES.map((s) => (
          <button key={s.id} type="button" onClick={() => changeMapStyle(s.id)} style={styleBtn(mapStyle === s.id)}>{s.label}</button>
        ))}
      </div>

      {/* Collapse toggle */}
      <button type="button" onClick={() => setPanelOpen((o) => !o)} style={{ ...toggleBtn, right: panelOpen ? 340 : 12 }}>
        {panelOpen ? '›' : '‹'}
      </button>

      {/* Side panel */}
      {panelOpen && (
        <div style={panel}>
          {/* Custom incidents (911-style) */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Incidents</div>
              <button type="button" onClick={() => { setCreating(true); setAddr('') }} style={rollBtn}>+ New incident</button>
            </div>
            {creating && <div style={{ fontSize: 12, color: '#58a6ff', marginTop: 8 }}>Click the map to place the incident, or type an address below.</div>}
            {creating && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input style={{ ...noteField, flex: 1 }} placeholder="Type an address…" value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') geocodeAddress() }} />
                <button type="button" onClick={geocodeAddress} disabled={incBusy} style={rollBtn}>Find</button>
              </div>
            )}
            {customIncidents.length === 0 && !creating && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 8 }}>No active incidents.</div>}
            {customIncidents.map((i) => {
              const d = dispatches.find((x) => x.ngo_incident_id === i.id && ACTIVE_DISPATCH.includes(x.status))
              return (
                <div key={i.id} style={{ padding: '8px 0', borderBottom: '1px solid #1b2027' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{i.title}</div>
                    <span style={{ fontSize: 10, color: SEVERITY_COLOUR[i.severity] ?? '#8b949e', whiteSpace: 'nowrap' }}>● {i.severity}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                    {[i.category, i.address].filter(Boolean).join(' · ') || `${i.lat.toFixed(3)}, ${i.lon.toFixed(3)}`}
                  </div>
                  {d
                    ? <div style={{ fontSize: 12, color: '#3fb950', marginTop: 6 }}>🚑 {d.team_name} · {DISPATCH_LABEL[d.status] ?? d.status}</div>
                    : <span style={{ fontSize: 11, color: '#f97316' }}>unassigned</span>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {!d && <button type="button" onClick={() => openAssignIncident(i)} style={assignBtn}>Assign</button>}
                    <button type="button" onClick={() => resolveIncident(i.id)} style={{ ...assignBtn, color: '#8b949e', borderColor: '#21262d', background: 'rgba(255,255,255,0.04)' }}>Resolve</button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Active panics — top priority */}
          {panics.length > 0 && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', background: 'rgba(248,81,73,0.08)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f85149' }}>🆘 {panics.length} active panic{panics.length === 1 ? '' : 's'}</div>
              {panics.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, color: '#e6edf3' }}>
                    <strong>{p.name}</strong> · {timeAgo(p.created_at)}
                    <div style={{ color: '#8b949e' }}>{p.lat != null && p.lon != null ? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : 'no location'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => openPanicDispatch(p)} style={{ ...resolveBtn, color: '#58a6ff', borderColor: 'rgba(88,166,255,0.4)', background: 'rgba(88,166,255,0.1)' }}>Send team</button>
                    <button type="button" onClick={() => resolvePanic(p.id)} style={resolveBtn}>Resolve</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Roll call */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Roll call</div>
              <button type="button" onClick={startRollCall} disabled={rcBusy} style={rollBtn}>{rcBusy ? '…' : rollCall ? 'New roll call' : 'Roll call'}</button>
            </div>
            {rollCall ? (
              <>
                <div style={{ fontSize: 12, color: '#8b949e', margin: '8px 0' }}>
                  <span style={{ color: '#3fb950' }}>{rollCall.safe_count} safe</span> / {rollCall.total} · {timeAgo(rollCall.created_at)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {rollCall.members.map((m) => (
                    <span key={m.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: m.safe ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)', color: m.safe ? '#3fb950' : '#f85149' }}>
                      {m.safe ? '✓' : '○'} {m.name}
                    </span>
                  ))}
                  {rollCall.members.length === 0 && <span style={{ fontSize: 11, color: '#8b949e' }}>No field coordinators.</span>}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>No active roll call.</div>
            )}
          </div>

          <div style={{ padding: '14px 16px', borderBottom: '1px solid #21262d' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Incident feed</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
              {feed.length} in your area · {gapCount > 0 ? <span style={{ color: '#f85149' }}>{gapCount} unassigned</span> : 'all assigned'}
            </div>
            {/* Time window — default last 10 days, expand to show older. */}
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {([['10', '10d'], ['30', '30d'], ['90', '90d'], ['all', 'All']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setWindow(v)} style={rangeBtn(windowDays === v)}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {feed.length === 0 && <div style={{ padding: 16, fontSize: 13, color: '#8b949e' }}>No incidents in your operational area.</div>}
            {feed.map((c) => {
              const overdue = !c.covered && Date.now() - new Date(c.created_at).getTime() > 30 * 60000
              return (
                <div key={c.id} style={{ ...feedCard, borderLeft: overdue ? '3px solid #f85149' : '3px solid transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{locNames[c.id] ?? 'Locating…'}</div>
                    <span style={{ fontSize: 10, color: STATUS_HEX[c.status] ?? '#8b949e', whiteSpace: 'nowrap' }}>● {STATUS_LABEL[c.status] ?? c.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                    {c.confidence_score}% · {c.report_count} report{c.report_count === 1 ? '' : 's'} · {timeAgo(c.created_at)}
                    {!c.covered && <span style={{ color: '#f85149' }}> · unassigned</span>}
                  </div>
                  {(() => {
                    const d = activeDispatchFor(c.id)
                    if (d) return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: '#3fb950' }}>
                          🚑 {d.team_name} · {DISPATCH_LABEL[d.status] ?? d.status}
                          {d.response_minutes != null && <span style={{ color: '#8b949e' }}> · {d.response_minutes}m response</span>}
                        </div>
                        <button type="button" onClick={() => { setRecallFor({ id: d.id, team: d.team_name }); setRecallReason('') }} style={{ ...assignBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.35)', background: 'rgba(248,81,73,0.08)' }}>Recall</button>
                      </div>
                    )
                    return <button type="button" onClick={() => openAssign(c)} style={assignBtn}>Assign</button>
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* New custom incident — details form (location already chosen) */}
      {newInc && (
        <div onClick={() => setNewInc(null)} style={modalBackdrop}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, width: 380 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>New incident</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{newInc.address || `${newInc.lat.toFixed(4)}, ${newInc.lon.toFixed(4)}`}</div>
            <input style={noteField} placeholder="Title (what's happening)" value={newInc.title} onChange={(e) => setNewInc({ ...newInc, title: e.target.value })} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <select style={{ ...noteField, flex: 1 }} value={newInc.category} onChange={(e) => setNewInc({ ...newInc, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select style={{ ...noteField, flex: 1 }} value={newInc.severity} onChange={(e) => setNewInc({ ...newInc, severity: e.target.value })}>
                {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <textarea style={{ ...noteField, height: 70, paddingTop: 8, marginTop: 8 }} placeholder="Details for the responding team…" value={newInc.description} onChange={(e) => setNewInc({ ...newInc, description: e.target.value })} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={createIncident} disabled={incBusy || !newInc.title.trim()} style={{ ...assignBtn, flex: 1, opacity: incBusy || !newInc.title.trim() ? 0.6 : 1 }}>{incBusy ? 'Creating…' : 'Create incident'}</button>
              <button type="button" onClick={() => setNewInc(null)} style={{ ...assignBtn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign a team to a custom incident */}
      {assignIncFor && (
        <div onClick={() => setAssignIncFor(null)} style={modalBackdrop}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, width: 360 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Assign a team — {assignIncFor.title}</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{assignIncFor.address || `${assignIncFor.lat.toFixed(4)}, ${assignIncFor.lon.toFixed(4)}`} · team alerted by push + SMS</div>
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {incTeams.length === 0 && <div style={{ fontSize: 13, color: '#8b949e' }}>No teams.</div>}
              {incTeams.map((t) => (
                <button key={t.id} type="button" disabled={incBusy} onClick={() => assignIncidentTeam(t.id)} style={teamRow}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: '#8b949e', marginLeft: 8 }}>{t.type} · {t.status}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAssignIncFor(null)} style={{ ...assignBtn, marginTop: 12 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Send-a-crew-to-panic modal */}
      {panicDispatchFor && (
        <div onClick={() => setPanicDispatchFor(null)} style={modalBackdrop}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, width: 360 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Send a team to {panicDispatchFor.name}</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
              {panicDispatchFor.lat != null && panicDispatchFor.lon != null ? `Last seen ${panicDispatchFor.lat.toFixed(4)}, ${panicDispatchFor.lon.toFixed(4)}` : 'No location reported'} · the team is alerted by push + SMS.
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {panicTeams.length === 0 && <div style={{ fontSize: 13, color: '#8b949e' }}>No teams.</div>}
              {panicTeams.map((t) => (
                <button key={t.id} type="button" disabled={panicBusy} onClick={() => sendPanicTeam(t.id)} style={teamRow}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: '#8b949e', marginLeft: 8 }}>{t.type} · {t.status}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setPanicDispatchFor(null)} style={{ ...assignBtn, marginTop: 12 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Recall modal */}
      {recallFor && (
        <div onClick={() => setRecallFor(null)} style={modalBackdrop}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, width: 340 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Recall {recallFor.team ?? 'team'}?</div>
            <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 12 }}>The team is told to stand down and the incident reopens as a coverage gap.</div>
            <input style={noteField} placeholder="Reason (optional)" value={recallReason} onChange={(e) => setRecallReason(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={confirmRecall} style={{ ...assignBtn, flex: 1, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)', background: 'rgba(248,81,73,0.08)' }}>Recall</button>
              <button type="button" onClick={() => setRecallFor(null)} style={{ ...assignBtn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign modal — teams ranked by type match + proximity */}
      {assignFor && (
        <div onClick={() => setAssignFor(null)} style={modalBackdrop}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, width: 380 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Assign a team</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
              {locNames[assignFor.id] ?? `${assignFor.lat.toFixed(3)}, ${assignFor.lon.toFixed(3)}`}
            </div>
            <input style={noteField} placeholder="Note (optional)" value={assignNote} onChange={(e) => setAssignNote(e.target.value)} />
            <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rankedTeams.length === 0 && <div style={{ fontSize: 13, color: '#8b949e' }}>No teams available.</div>}
              {rankedTeams.map((t) => (
                <button key={t.id} type="button" disabled={assignBusy} onClick={() => assignTeam(t.id)} style={teamRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{t.name} {t.type_match && <span style={{ color: '#3fb950' }}>✓match</span>}</span>
                    <span style={{ color: '#8b949e' }}>{t.distance_km != null ? `${t.distance_km} km` : 'no loc'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                    {t.type} · {t.status}{t.busy && <span style={{ color: '#d29922' }}> · busy</span>}
                  </div>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAssignFor(null)} style={{ ...assignBtn, marginTop: 12 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

const panel: React.CSSProperties = {
  position: 'absolute', top: 0, right: 0, bottom: 0, width: 328, zIndex: 6,
  background: 'rgba(13,17,23,0.95)', borderLeft: '1px solid #21262d',
  display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', color: '#e6edf3',
}
const toggleBtn: React.CSSProperties = {
  position: 'absolute', top: 12, zIndex: 7, width: 28, height: 28, borderRadius: 6,
  background: 'rgba(13,17,23,0.95)', border: '1px solid #21262d', color: '#8b949e', cursor: 'pointer', fontFamily: 'system-ui',
}
const statusChip: React.CSSProperties = { position: 'absolute', top: 12, left: 12, zIndex: 7, fontSize: 12, color: '#8b949e', background: 'rgba(13,17,23,0.95)', border: '1px solid #21262d', borderRadius: 999, padding: '4px 12px', fontFamily: 'system-ui' }
const styleSwitcher: React.CSSProperties = { position: 'absolute', bottom: 12, left: 12, zIndex: 7, display: 'flex', gap: 4, background: 'rgba(13,17,23,0.9)', border: '1px solid #21262d', borderRadius: 8, padding: 4 }
function styleBtn(active: boolean): React.CSSProperties {
  return { height: 26, padding: '0 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui', whiteSpace: 'nowrap', background: active ? 'rgba(88,166,255,0.15)' : 'transparent', border: active ? '1px solid #58a6ff' : '1px solid transparent', color: active ? '#58a6ff' : '#8b949e' }
}
const chipRetry: React.CSSProperties = { marginLeft: 6, background: 'none', border: 'none', color: '#f85149', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }
function rangeBtn(active: boolean): React.CSSProperties {
  return { flex: 1, height: 26, borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(88,166,255,0.15)' : 'rgba(255,255,255,0.04)', border: active ? '1px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }
}
const resolveBtn: React.CSSProperties = { flexShrink: 0, height: 26, padding: '0 10px', background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.4)', color: '#3fb950', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui' }
const rollBtn: React.CSSProperties = {
  height: 28, padding: '0 12px', background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.4)',
  color: '#3fb950', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui',
}
const feedCard: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #21262d' }
const assignBtn: React.CSSProperties = {
  marginTop: 8, height: 28, padding: '0 12px', background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.35)',
  color: '#58a6ff', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui',
}
const noteField: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const teamRow: React.CSSProperties = { textAlign: 'left', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: '8px 10px', color: '#e6edf3', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }
const modalBox: React.CSSProperties = { width: 340, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22, fontFamily: 'system-ui', color: '#e6edf3' }
