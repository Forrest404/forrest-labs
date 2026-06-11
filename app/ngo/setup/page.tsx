'use client'

import { useEffect, useRef, useState } from 'react'
import { useConfirm } from '@/lib/ngo-ui'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'

const LANG = {
  en: { title: 'Operational area', desc_edit: 'Draw the polygon covering your area of operations.', desc_view: 'View only — the operational area is managed by an org admin.', draw: 'Draw area', redraw: 'Redraw area', click_add: 'Click the map to add points', undo: 'Undo', cancel: 'Cancel', saving: 'Saving…', save: 'Save area', defined: '✓ Area defined', clear: 'Clear area', e_min: 'Add at least 3 points to define an area.', saved_msg: 'Operational area saved.', e_save: 'Could not save.', e_save_retry: 'Could not save. Please try again.', cleared_msg: 'Operational area cleared.', e_clear: 'Could not clear.', e_clear_retry: 'Could not clear. Please try again.', confirm_clear_title: 'Clear the operational area?', confirm_clear_body: 'Incidents will no longer be flagged inside/outside it until you draw a new one.', confirm_clear: 'Clear', search_ph: 'Find a place — anywhere in the world', set_base: 'Set as our base location', base_saved: 'Base location saved — your maps open here now.', e_base: 'Could not save the base location.', base_prefix: 'Base:' },
  fr: { title: 'Zone opérationnelle', desc_edit: 'Dessinez le polygone couvrant votre zone d’opérations.', desc_view: 'Lecture seule — la zone opérationnelle est gérée par un administrateur.', draw: 'Dessiner la zone', redraw: 'Redessiner la zone', click_add: 'Cliquez sur la carte pour ajouter des points', undo: 'Annuler le point', cancel: 'Annuler', saving: 'Enregistrement…', save: 'Enregistrer la zone', defined: '✓ Zone définie', clear: 'Effacer la zone', e_min: 'Ajoutez au moins 3 points pour définir une zone.', saved_msg: 'Zone opérationnelle enregistrée.', e_save: 'Échec de l’enregistrement.', e_save_retry: 'Échec de l’enregistrement. Réessayez.', cleared_msg: 'Zone opérationnelle effacée.', e_clear: 'Échec de l’effacement.', e_clear_retry: 'Échec de l’effacement. Réessayez.', confirm_clear_title: 'Effacer la zone opérationnelle ?', confirm_clear_body: 'Les incidents ne seront plus signalés dans/hors zone jusqu’à ce que vous en dessiniez une nouvelle.', confirm_clear: 'Effacer', search_ph: 'Trouver un lieu — partout dans le monde', set_base: 'Définir comme notre base', base_saved: 'Base enregistrée — vos cartes s’ouvrent ici désormais.', e_base: 'Impossible d’enregistrer la base.', base_prefix: 'Base :' },
  ar: { title: 'منطقة العمليات', desc_edit: 'ارسم المضلّع الذي يغطي منطقة عملياتك.', desc_view: 'للعرض فقط — يدير منطقة العمليات مسؤول المنظمة.', draw: 'رسم المنطقة', redraw: 'إعادة رسم المنطقة', click_add: 'انقر على الخريطة لإضافة نقاط', undo: 'تراجع', cancel: 'إلغاء', saving: 'جارٍ الحفظ…', save: 'حفظ المنطقة', defined: '✓ تم تحديد المنطقة', clear: 'مسح المنطقة', e_min: 'أضف 3 نقاط على الأقل لتحديد منطقة.', saved_msg: 'تم حفظ منطقة العمليات.', e_save: 'تعذّر الحفظ.', e_save_retry: 'تعذّر الحفظ. حاول مرة أخرى.', cleared_msg: 'تم مسح منطقة العمليات.', e_clear: 'تعذّر المسح.', e_clear_retry: 'تعذّر المسح. حاول مرة أخرى.', confirm_clear_title: 'مسح منطقة العمليات؟', confirm_clear_body: 'لن تُصنَّف الحوادث داخل/خارج المنطقة حتى ترسم واحدة جديدة.', confirm_clear: 'مسح', search_ph: 'ابحث عن مكان — في أي مكان في العالم', set_base: 'تعيين كمقرّنا', base_saved: 'تم حفظ المقر — تفتح خرائطك هنا الآن.', e_base: 'تعذّر حفظ المقر.', base_prefix: 'المقر:' },
} as const

declare global {
  interface Window { mapboxgl: any }
}

// Operational area editor. An org_admin draws a polygon over their area of
// operations — anywhere in the world; it saves to ngo_organisations.operational_area
// as a GeoJSON Polygon and re-renders on reload. Drawing is a simple click-to-add
// tool (no mapbox-gl-draw dependency), mirroring app/admin/map. The map centres on
// the org's BASE location (set at signup / via the search here); the Lebanon centre
// is only the last-resort fallback for legacy orgs with neither base nor polygon.

type Pt = [number, number]
const FALLBACK_CENTER: Pt = [35.86, 33.87] // legacy fallback (pre-worldwide orgs)

interface OrgBase { lat: number; lon: number; zoom: number | null; label: string | null }
interface PlaceHit { lat: number; lon: number; label: string }
async function searchPlaces(q: string, bias: OrgBase | null): Promise<PlaceHit[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || !q.trim()) return []
  try {
    const prox = bias ? `&proximity=${bias.lon},${bias.lat}` : ''
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q.trim())}.json` +
      `?access_token=${token}&limit=5&types=country,region,place,locality,neighborhood${prox}`
    const res = await fetch(url)
    const data = (await res.json()) as { features?: { center: [number, number]; place_name: string }[] }
    return (data.features ?? []).map((f) => ({ lon: f.center[0], lat: f.center[1], label: f.place_name }))
  } catch { return [] }
}

type Polygon = { type: 'Polygon'; coordinates: number[][][] }
// True only for an actual GeoJSON Polygon with a usable ring. Guards against the
// free-text {description} note the column may hold before an area is drawn.
function isPolygon(area: unknown): area is Polygon {
  const a = area as Polygon | null
  return !!a && a.type === 'Polygon' && Array.isArray(a.coordinates) && Array.isArray(a.coordinates[0]) && a.coordinates[0].length >= 4
}

export default function NgoSetupPage() {
  const confirm = useConfirm()
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
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

  // Org base location (worldwide onboarding) + place search.
  const [base, setBase] = useState<OrgBase | null>(null)
  const baseRef = useRef<OrgBase | null>(null)
  useEffect(() => { baseRef.current = base }, [base])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<PlaceHit[]>([])
  const [picked, setPicked] = useState<PlaceHit | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // ── Org base location ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/ngo/org')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const o = d?.org
        if (o && o.base_lat != null && o.base_lon != null) {
          setBase({ lat: o.base_lat, lon: o.base_lon, zoom: o.base_zoom ?? null, label: o.base_label ?? null })
        }
      })
      .catch(() => {})
  }, [])

  // Centre on the base once both the map and the base are known — unless a saved
  // polygon exists (its fitBounds wins; it's the more specific signal).
  const centredRef = useRef(false)
  useEffect(() => {
    if (!mapLoaded || !map.current || centredRef.current || !base || isPolygon(saved)) return
    centredRef.current = true
    map.current.jumpTo({ center: [base.lon, base.lat], zoom: base.zoom ?? 9 })
  }, [mapLoaded, base, saved])

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
      // Base if it already loaded; legacy Lebanon fallback otherwise (the centring
      // effect above corrects as soon as the base arrives).
      const b = baseRef.current
      map.current = new window.mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: b ? [b.lon, b.lat] : FALLBACK_CENTER,
        zoom: b ? (b.zoom ?? 9) : 8,
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
      setStatus(t('e_min'))
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
        setStatus(t('saved_msg'))
      } else {
        setStatus(data.error ?? t('e_save'))
      }
    } catch {
      setStatus(t('e_save_retry'))
    } finally {
      setBusy(false)
    }
  }

  function onQuery(v: string) {
    setQuery(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!v.trim()) { setHits([]); return }
    searchTimer.current = setTimeout(async () => setHits(await searchPlaces(v, baseRef.current)), 350)
  }
  function pickPlace(h: PlaceHit) {
    setPicked(h); setQuery(h.label); setHits([])
    if (map.current) map.current.flyTo({ center: [h.lon, h.lat], zoom: 10 })
  }
  async function saveBase() {
    if (!picked) return
    setBusy(true); setStatus(null)
    try {
      const res = await fetch('/api/ngo/org', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_lat: picked.lat, base_lon: picked.lon, base_zoom: 10, base_label: picked.label.slice(0, 120) }),
      })
      if (res.ok) {
        setBase({ lat: picked.lat, lon: picked.lon, zoom: 10, label: picked.label })
        setPicked(null)
        setStatus(t('base_saved'))
      } else setStatus(t('e_base'))
    } catch { setStatus(t('e_base')) }
    finally { setBusy(false) }
  }

  async function clearArea() {
    if (!(await confirm({ title: t('confirm_clear_title'), body: t('confirm_clear_body'), danger: true, confirmLabel: t('confirm_clear') }))) return
    setBusy(true); setStatus(null)
    try {
      const res = await fetch('/api/ngo/org/area', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area: null }) })
      const data = await res.json()
      if (res.ok) { setSaved(null); setPoints([]); setDrawMode(false); setStatus(t('cleared_msg')) }
      else setStatus(data.error ?? t('e_clear'))
    } catch { setStatus(t('e_clear_retry')) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%' }} dir={isRtl ? 'rtl' : 'ltr'}>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      <div style={panel}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t('title')}</div>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
          {canEdit ? t('desc_edit') : t('desc_view')}
        </div>

        {/* Worldwide place search — find your city before drawing; org_admin can pin it as the base. */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t('search_ph')}
            style={{ width: '100%', height: 34, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 12, fontFamily: 'system-ui', outline: 'none' }}
          />
          {hits.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, overflow: 'hidden', marginTop: 4 }}>
              {hits.map((h) => (
                <button key={h.label} type="button" onClick={() => pickPlace(h)}
                  style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid #1b2027', color: '#e6edf3', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.label}
                </button>
              ))}
            </div>
          )}
          {canEdit && picked && (
            <button type="button" onClick={saveBase} disabled={busy} style={{ ...btn(false), marginTop: 6, color: '#58a6ff', borderColor: 'rgba(88,166,255,0.4)' }}>
              📍 {t('set_base')}
            </button>
          )}
          {base?.label && !picked && (
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t('base_prefix')} {base.label}
            </div>
          )}
        </div>

        {canEdit && (
          <>
            {!drawMode ? (
              <button type="button" onClick={startDraw} style={btn(true)}>
                {saved ? t('redraw') : t('draw')}
              </button>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#58a6ff', marginBottom: 8 }}>
                  {t('click_add')} ({points.length}).
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" onClick={undoPoint} disabled={!points.length} style={{ ...btn(false), flex: 1 }}>{t('undo')}</button>
                  <button type="button" onClick={clearDraw} style={{ ...btn(false), flex: 1 }}>{t('cancel')}</button>
                </div>
                <button type="button" onClick={save} disabled={busy || points.length < 3} style={{ ...btn(true), opacity: busy || points.length < 3 ? 0.6 : 1 }}>
                  {busy ? t('saving') : t('save')}
                </button>
              </>
            )}
          </>
        )}

        {saved && !drawMode && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#3fb950' }}>{t('defined')}</div>
            {canEdit && (
              <button type="button" onClick={clearArea} disabled={busy} style={{ ...btn(false), marginTop: 8, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>{t('clear')}</button>
            )}
          </div>
        )}
        {status && <div style={{ fontSize: 12, color: '#e6edf3', marginTop: 10 }}>{status}</div>}
      </div>
    </div>
  )
}

const panel: React.CSSProperties = {
  position: 'absolute', top: 16, insetInlineStart: 16, zIndex: 5, width: 240,
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
