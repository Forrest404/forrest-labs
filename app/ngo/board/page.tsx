'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

declare global {
  interface Window { mapboxgl: any }
}

// Situation board — the NGO home screen. One map (incidents + own team pins +
// coverage gaps + operational area) plus a collapsible incident feed and an
// urgent banner. Reads /api/ngo/board (org-scoped, read-only on clusters) and
// refreshes every 30s without a full reload. Mirrors the public map's colours.

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
  id: string; cluster_id: string; team_id: string; team_name: string | null; status: string; response_minutes: number | null
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
  const dataRef = useRef<{ incidents: Incident[]; teams: TeamPin[]; area: any; panics: Panic[] } | null>(null)

  const [incidents, setIncidents] = useState<Incident[]>([])
  const [teams, setTeams] = useState<TeamPin[]>([])
  const [panics, setPanics] = useState<Panic[]>([])
  const [rollCall, setRollCall] = useState<RollCall | null>(null)
  const [rcBusy, setRcBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [locNames, setLocNames] = useState<Record<string, string>>({})
  const locNamesRef = useRef<Record<string, string>>({})
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [urgent, setUrgent] = useState<Incident | null>(null)
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [assignFor, setAssignFor] = useState<Incident | null>(null)
  const [rankedTeams, setRankedTeams] = useState<RankedTeam[]>([])
  const [assignNote, setAssignNote] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [recallFor, setRecallFor] = useState<{ id: string; team: string | null } | null>(null)
  const [recallReason, setRecallReason] = useState('')

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

    const set = (id: string, data: any) => { const s = m.getSource(id); if (s) s.setData(data) }
    set('area', areaFC); set('inc-radius', radiusFC); set('inc-dots', dotFC); set('gaps', gapFC); set('teams', teamFC); set('panics', panicFC)
  }, [])

  // ── Fetch board data ───────────────────────────────────────────────────────
  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch('/api/ngo/board')
      if (!res.ok) return
      const data = await res.json()
      const inc: Incident[] = data.incidents ?? []
      const tms: TeamPin[] = data.teams ?? []
      const pnc: Panic[] = data.panics ?? []
      dataRef.current = { incidents: inc, teams: tms, area: data.operational_area, panics: pnc }
      setIncidents(inc)
      setTeams(tms)
      setPanics(pnc)
      setRollCall(data.roll_call ?? null)
      setDispatches(data.dispatches ?? [])
      renderSources()

      // In-area feed → geocode for labels.
      inc.filter((c) => c.inside).forEach((c) => fetchLocationName(c.lat, c.lon, c.id))

      // Urgent banner: official_verified OR confidence >= 85, in-area, newest first.
      const urgentInc = inc.find((c) => c.inside && (c.status === 'official_verified' || c.confidence_score >= 85))
      setUrgent(urgentInc && !dismissedRef.current.has(urgentInc.id) ? urgentInc : null)
    } catch { /* keep last good data */ }
  }, [renderSources, fetchLocationName])

  const dismissedRef = useRef<Set<string>>(new Set())
  useEffect(() => { dismissedRef.current = dismissed }, [dismissed])

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
        const m = map.current
        const empty = { type: 'FeatureCollection', features: [] }
        m.addSource('area', { type: 'geojson', data: empty })
        m.addSource('inc-radius', { type: 'geojson', data: empty })
        m.addSource('inc-dots', { type: 'geojson', data: empty })
        m.addSource('gaps', { type: 'geojson', data: empty })
        m.addSource('teams', { type: 'geojson', data: empty })
        m.addSource('panics', { type: 'geojson', data: empty })

        // Operational area — subtle.
        m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#58a6ff', 'fill-opacity': 0.05 } })
        m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#58a6ff', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.5 } })

        // Coverage-gap glow (behind incident dots) — the key feature.
        m.addLayer({ id: 'gap-glow', type: 'circle', source: 'gaps', paint: { 'circle-radius': 22, 'circle-color': '#f85149', 'circle-opacity': 0.35, 'circle-blur': 0.6 } })

        // Incident radius — opacity emphasises inside vs outside the area.
        m.addLayer({
          id: 'inc-radius-fill', type: 'fill', source: 'inc-radius',
          paint: { 'fill-color': STATUS_COLOUR_EXPR, 'fill-opacity': ['case', ['get', 'inside'], 0.25, 0.04] },
        })
        m.addLayer({
          id: 'inc-radius-line', type: 'line', source: 'inc-radius',
          paint: { 'line-color': STATUS_COLOUR_EXPR, 'line-width': 1.2, 'line-opacity': ['case', ['get', 'inside'], 0.8, 0.2] },
        })
        // Incident dots.
        m.addLayer({
          id: 'inc-dots', type: 'circle', source: 'inc-dots',
          paint: {
            'circle-radius': 7, 'circle-color': STATUS_COLOUR_EXPR,
            'circle-opacity': ['case', ['get', 'inside'], 1, 0.3],
            'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
            'circle-stroke-opacity': ['case', ['get', 'inside'], 0.8, 0.2],
          },
        })
        // Team pins + labels.
        m.addLayer({
          id: 'team-dots', type: 'circle', source: 'teams',
          paint: {
            'circle-radius': 8,
            'circle-color': ['case',
              ['==', ['get', 'status'], 'standby'], TEAM_STATUS_COLOUR.standby,
              ['==', ['get', 'status'], 'deployed'], TEAM_STATUS_COLOUR.deployed,
              ['==', ['get', 'status'], 'unavailable'], TEAM_STATUS_COLOUR.unavailable,
              TEAM_STATUS_COLOUR.offline,
            ],
            'circle-stroke-color': '#0d1117', 'circle-stroke-width': 2,
          },
        })
        m.addLayer({
          id: 'team-labels', type: 'symbol', source: 'teams',
          layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-max-width': 14 },
          paint: { 'text-color': '#e6edf3', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.5 },
        })

        // Panic markers — pulsing red halo + dot + name, drawn on top of everything.
        m.addLayer({ id: 'panic-glow', type: 'circle', source: 'panics', paint: { 'circle-radius': 26, 'circle-color': '#f85149', 'circle-opacity': 0.4, 'circle-blur': 0.5 } })
        m.addLayer({ id: 'panic-dot', type: 'circle', source: 'panics', paint: { 'circle-radius': 9, 'circle-color': '#f85149', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } })
        m.addLayer({
          id: 'panic-label', type: 'symbol', source: 'panics',
          layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-max-width': 14 },
          paint: { 'text-color': '#f85149', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.5 },
        })

        setMapLoaded(true)
      })
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
  async function resolvePanic(panicId: string) {
    const res = await fetch(`/api/ngo/safety/panic/${panicId}/resolve`, { method: 'POST' })
    if (res.ok) fetchBoard()
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

      {/* Urgent banner */}
      {urgent && (
        <div style={banner}>
          <span style={{ fontWeight: 600 }}>⚠ Urgent:</span>{' '}
          {STATUS_LABEL[urgent.status] ?? urgent.status} incident in your area —{' '}
          {locNames[urgent.id] ?? `${urgent.lat.toFixed(3)}, ${urgent.lon.toFixed(3)}`} ({urgent.confidence_score}% confidence)
          <button type="button" onClick={() => setDismissed((s) => new Set(s).add(urgent.id))} style={bannerClose}>✕</button>
        </div>
      )}

      {/* Collapse toggle */}
      <button type="button" onClick={() => setPanelOpen((o) => !o)} style={{ ...toggleBtn, right: panelOpen ? 340 : 12 }}>
        {panelOpen ? '›' : '‹'}
      </button>

      {/* Side panel */}
      {panelOpen && (
        <div style={panel}>
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
                  <button type="button" onClick={() => resolvePanic(p.id)} style={resolveBtn}>Resolve</button>
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
const banner: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, zIndex: 8, padding: '10px 44px 10px 16px',
  background: '#f85149', color: '#fff', fontSize: 13, fontFamily: 'system-ui', textAlign: 'center',
}
const bannerClose: React.CSSProperties = {
  position: 'absolute', top: 8, right: 12, background: 'none', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer',
}
const noteField: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const teamRow: React.CSSProperties = { textAlign: 'left', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: '8px 10px', color: '#e6edf3', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }
const modalBox: React.CSSProperties = { width: 340, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22, fontFamily: 'system-ui', color: '#e6edf3' }
