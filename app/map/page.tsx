'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/realtime-js'

// ─── Global declaration for CDN-loaded Mapbox ─────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { mapboxgl: any }
}

// Escape dynamic text before interpolating into Mapbox popup HTML (setHTML).
// Prevents stored values from being rendered as live markup.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

interface NewsArticle {
  id: string
  source: string
  title: string
  url: string
  published_at: string | null
  fetched_at: string
  summary: string | null
  location_name: string | null
  location_lat: number | null
  location_lon: number | null
  event_type: string | null
  casualty_count: number | null
  ai_relevance: number | null
  linked_cluster_id: string | null
}

const NEWS_SOURCE_STYLES: Record<string, { bg: string; color: string }> = {
  'Al Jazeera': { bg: 'rgba(248,81,73,0.12)', color: '#f85149' },
  BBC: { bg: 'rgba(88,166,255,0.12)', color: '#58a6ff' },
  Reuters: { bg: 'rgba(63,185,80,0.12)', color: '#3fb950' },
  'UN OCHA': { bg: 'rgba(163,113,247,0.12)', color: '#a371f7' },
}

const NEWS_EVENT_COLORS: Record<string, string> = {
  airstrike: '#ef4444',
  evacuation: '#f97316',
  casualties: '#ef4444',
  warning: '#f97316',
  ground_operation: '#a371f7',
}

// ─── Time-travel timeline constants ──────────────────────────────────────────

const START_DATE = new Date('2026-03-22T00:00:00Z')
const END_DATE = new Date()

const KEY_EVENTS: { date: Date; label: string; color: string }[] = [
  { date: new Date('2026-03-22T00:00:00Z'), label: 'Ground ops begin',    color: '#d29922' },
  { date: new Date('2026-04-08T14:00:00Z'), label: 'Op Eternal Darkness', color: '#f85149' },
  { date: new Date('2026-04-16T20:00:00Z'), label: 'Ceasefire',           color: '#3fb950' },
]

// ─── Filter options ──────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000
const TIME_RANGES = [
  { id: '10d', label: 'Last 10d', ms: 10 * DAY_MS },
  { id: '30d', label: 'Last 30d', ms: 30 * DAY_MS },
  { id: '90d', label: 'Last 90d', ms: 90 * DAY_MS },
] as const
type TimeRangeId = (typeof TIME_RANGES)[number]['id'] | 'all'

const OPERATION_PERIODS = [
  { id: 'ground_ops',          label: 'Ground ops phase',    start: KEY_EVENTS[0].date, end: KEY_EVENTS[1].date as Date | null },
  { id: 'op_eternal_darkness', label: 'Op Eternal Darkness', start: KEY_EVENTS[1].date, end: KEY_EVENTS[2].date as Date | null },
  { id: 'after_ceasefire',     label: 'After ceasefire',     start: KEY_EVENTS[2].date, end: null as Date | null },
] as const
type OperationId = (typeof OPERATION_PERIODS)[number]['id'] | 'all'

const EVENT_TYPE_OPTIONS = [
  { id: 'airstrike',        label: 'Airstrike' },
  { id: 'ground_operation', label: 'Ground op' },
  { id: 'evacuation',       label: 'Evacuation' },
  { id: 'casualties',       label: 'Casualties' },
  { id: 'warning',          label: 'Warning' },
] as const
type EventTypeId = (typeof EVENT_TYPE_OPTIONS)[number]['id'] | 'all'

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

// ─── Time-travel helpers ─────────────────────────────────────────────────────

function dateToPercent(date: Date): number {
  const total = END_DATE.getTime() - START_DATE.getTime()
  const pos = date.getTime() - START_DATE.getTime()
  return Math.max(0, Math.min(100, (pos / total) * 100))
}

function percentToDate(pct: number): Date {
  const total = END_DATE.getTime() - START_DATE.getTime()
  return new Date(START_DATE.getTime() + (pct / 100) * total)
}

function formatScrubDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatScrubTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC'
}

// ─── Map page ─────────────────────────────────────────────────────────────────

// Public-map UI strings (EN/FR/AR). Shared language pref key 'fl_lang' with the rest of the
// site. The basemap labels themselves are localised separately via map.setLanguage().
type MapLang = 'en' | 'fr' | 'ar'
const MAP_STRINGS: Record<MapLang, Record<string, string>> = {
  en: {
    search_ph: 'Search a place in Lebanon…', clear: 'Clear search', locate: 'Find my location',
    geo_unavailable: 'Location isn’t available on this device.',
    geo_failed: 'Couldn’t get your location. Check location permission.',
    report: 'Report incident', report_short: 'Report', news: 'News', live: 'LIVE', official: 'OFFICIAL',
    legend_strikes: 'Strikes', legend_warnings: 'Warnings',
    st_official: 'Officially verified', st_news: 'News verified', st_civilian: 'Civilian confirmed', st_auto: 'AI auto-confirmed',
    warn_active: 'Active evacuation', warn_clear: 'All clear reported',
    list: 'List', incidents: 'Incidents', no_incidents: 'No incidents match the current filters.', reports: 'reports', updated: 'updated',
    alerts_btn: 'Alerts', alerts_title: 'Area alerts', alerts_desc: 'Get a push when a verified incident or evacuation warning appears in your area.',
    alerts_centre: 'Using the map’s current centre — pan the map or use “find my location” to set your area.',
    radius_label: 'Alert radius', subscribe: 'Subscribe', subscribing: 'Subscribing…',
    alerts_ready: 'Subscription ready', alerts_howto: 'Open this link on your phone to get alerts — it uses the free ntfy app, no account needed:',
    copy_link: 'Copy link', copied: 'Copied ✓', open_link: 'Open', done: 'Done', alerts_err: 'Could not subscribe. Please try again.', km: 'km',
    emergency_help: 'Emergency help', how_it_works: 'How it works',
  },
  fr: {
    search_ph: 'Rechercher un lieu au Liban…', clear: 'Effacer', locate: 'Ma position',
    geo_unavailable: 'La localisation n’est pas disponible sur cet appareil.',
    geo_failed: 'Impossible d’obtenir votre position. Vérifiez l’autorisation de localisation.',
    report: 'Signaler', report_short: 'Signaler', news: 'Actus', live: 'EN DIRECT', official: 'OFFICIEL',
    legend_strikes: 'Frappes', legend_warnings: 'Avertissements',
    st_official: 'Vérifié officiellement', st_news: 'Vérifié par les médias', st_civilian: 'Confirmé par des civils', st_auto: 'Auto-confirmé (IA)',
    warn_active: 'Évacuation active', warn_clear: 'Fin d’alerte signalée',
    list: 'Liste', incidents: 'Incidents', no_incidents: 'Aucun incident ne correspond aux filtres actuels.', reports: 'signalements', updated: 'mis à jour',
    alerts_btn: 'Alertes', alerts_title: 'Alertes de zone', alerts_desc: 'Recevez une notification quand un incident vérifié ou un avertissement d’évacuation apparaît dans votre zone.',
    alerts_centre: 'Centre actuel de la carte — déplacez la carte ou utilisez « ma position » pour définir votre zone.',
    radius_label: 'Rayon d’alerte', subscribe: 'S’abonner', subscribing: 'Abonnement…',
    alerts_ready: 'Abonnement prêt', alerts_howto: 'Ouvrez ce lien sur votre téléphone pour recevoir les alertes — via l’app gratuite ntfy, sans compte :',
    copy_link: 'Copier le lien', copied: 'Copié ✓', open_link: 'Ouvrir', done: 'Terminé', alerts_err: 'Échec de l’abonnement. Réessayez.', km: 'km',
    emergency_help: 'Aide d’urgence', how_it_works: 'Comment ça marche',
  },
  ar: {
    search_ph: 'ابحث عن مكان في لبنان…', clear: 'مسح', locate: 'موقعي',
    geo_unavailable: 'الموقع غير متاح على هذا الجهاز.',
    geo_failed: 'تعذّر تحديد موقعك. تحقّق من إذن الموقع.',
    report: 'الإبلاغ عن حادثة', report_short: 'إبلاغ', news: 'الأخبار', live: 'مباشر', official: 'رسمي',
    legend_strikes: 'الضربات', legend_warnings: 'التحذيرات',
    st_official: 'مؤكد رسمياً', st_news: 'مؤكد إخبارياً', st_civilian: 'مؤكد من المدنيين', st_auto: 'مؤكد آلياً (ذكاء اصطناعي)',
    warn_active: 'إخلاء نشط', warn_clear: 'تم الإبلاغ عن انتهاء الخطر',
    list: 'قائمة', incidents: 'الحوادث', no_incidents: 'لا توجد حوادث مطابقة للمرشّحات الحالية.', reports: 'بلاغات', updated: 'آخر تحديث',
    alerts_btn: 'تنبيهات', alerts_title: 'تنبيهات المنطقة', alerts_desc: 'احصل على إشعار عند ظهور حادثة مؤكدة أو تحذير إخلاء في منطقتك.',
    alerts_centre: 'يُستخدم مركز الخريطة الحالي — حرّك الخريطة أو استخدم «موقعي» لتحديد منطقتك.',
    radius_label: 'نطاق التنبيه', subscribe: 'اشترك', subscribing: 'جارٍ الاشتراك…',
    alerts_ready: 'تم تجهيز الاشتراك', alerts_howto: 'افتح هذا الرابط على هاتفك لتصلك التنبيهات — عبر تطبيق ntfy المجاني، دون حساب:',
    copy_link: 'نسخ الرابط', copied: 'تم النسخ ✓', open_link: 'فتح', done: 'تم', alerts_err: 'تعذّر الاشتراك. حاول مرة أخرى.', km: 'كم',
    emergency_help: 'مساعدة طارئة', how_it_works: 'كيف يعمل',
  },
}

export default function MapPage() {
  // ── Existing state ───────────────────────────────────────────────────────
  const [mapLoaded, setMapLoaded] = useState(false)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRangeId>('10d')
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed'>('all')
  const [operationFilter, setOperationFilter] = useState<OperationId>('all')
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeId>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [locationNames, setLocationNames] = useState<Record<string, string>>({})
  const [isMobile, setIsMobile] = useState(false)
  // Measured top-bar height: on mobile the centre summary stacks up to 3 lines, so the
  // bar is taller than the old hardcoded 56px — the search row + its buttons were then
  // positioned over the bar's right-side controls. We measure and offset from the real
  // height instead.
  const topBarRef = useRef<HTMLDivElement>(null)
  const [headerH, setHeaderH] = useState(56)
  const [showFullReasoning, setShowFullReasoning] = useState(false)
  const [shareLabel, setShareLabel] = useState('Share this alert')

  // ── Search / locate state ─────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ name: string; lat: number; lon: number }[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const userMarker = useRef<any>(null)

  // ── Area-alert subscription state ──────────────────────────────────────────
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [alertArea, setAlertArea] = useState<{ lat: number; lon: number } | null>(null)
  const [alertRadius, setAlertRadius] = useState(5000)
  const [alertBusy, setAlertBusy] = useState(false)
  const [alertErr, setAlertErr] = useState<string | null>(null)
  const [alertResult, setAlertResult] = useState<{ topic: string; subscribe_url: string } | null>(null)
  const [alertCopied, setAlertCopied] = useState(false)

  // ── Freshness indicator ───────────────────────────────────────────────────
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [, setFreshTick] = useState(0) // 1s tick keeps the "updated Xs ago" label live

  // ── Language (shared 'fl_lang'); basemap labels localised via map.setLanguage() ───────────
  const [lang, setLang] = useState<MapLang>('en')
  const langRef = useRef<MapLang>('en')
  useEffect(() => { langRef.current = lang }, [lang])
  const isRtl = lang === 'ar'
  const t = useCallback((k: string) => MAP_STRINGS[lang]?.[k] ?? MAP_STRINGS.en[k] ?? k, [lang])
  useEffect(() => {
    try { const s = localStorage.getItem('fl_lang'); if (s === 'en' || s === 'fr' || s === 'ar') setLang(s) } catch { /* storage off */ }
  }, [])
  const changeLang = useCallback((l: MapLang) => {
    setLang(l)
    try { localStorage.setItem('fl_lang', l) } catch { /* storage off */ }
    try { map.current?.setLanguage(l) } catch { /* setLanguage unsupported on this style/version */ }
  }, [])
  // Re-apply when the language state settles (e.g. read from storage on mount, once style ready).
  useEffect(() => {
    try { map.current?.setLanguage(lang) } catch { /* ignore */ }
  }, [lang])

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

  // ── News feed state ────────────────────────────────────────────────────
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [newsOpen, setNewsOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [newsLoading, setNewsLoading] = useState(true)

  // ── Time-travel state ─────────────────────────────────────────────────
  const [timeEnabled, setTimeEnabled] = useState(false)
  const [scrubDate, setScrubDate] = useState<Date>(END_DATE)
  const [isPlaying, setIsPlaying] = useState(false)
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // ── Deep-link target parsed once on mount (consumed below, after fetchLocationName) ──
  const pendingDeepLink = useRef<{ type: 'incident' | 'warning'; id: string } | null>(null)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const inc = p.get('incident')
    const wrn = p.get('warning')
    if (inc) pendingDeepLink.current = { type: 'incident', id: inc }
    else if (wrn) pendingDeepLink.current = { type: 'warning', id: wrn }
  }, [])

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

  // Live "updated Xs ago" for the freshness label (from a ms timestamp set on each data refresh).
  function freshAgo(ms: number): string {
    const s = Math.floor((Date.now() - ms) / 1000)
    if (s < 5) return 'just now'
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`
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

  // Open the deep-linked incident/warning panel once its data has loaded (?incident=/?warning=).
  useEffect(() => {
    const dl = pendingDeepLink.current
    if (!dl || !mapLoaded) return
    if (dl.type === 'incident') {
      const c = clusters.find((x) => x.id === dl.id)
      if (!c) return // not loaded yet (or filtered/unknown) — retry on the next data change
      pendingDeepLink.current = null
      setSelectedWarning(null)
      setSelectedCluster(c)
      fetchLocationName(c.centroid_lat, c.centroid_lon, c.id)
      if (map.current) map.current.flyTo({ center: [c.centroid_lon, c.centroid_lat], zoom: 14, duration: 1200 })
    } else {
      const w = warningClusters.find((x) => x.id === dl.id)
      if (!w) return
      pendingDeepLink.current = null
      setSelectedCluster(null)
      setSelectedWarning(w)
      if (map.current) map.current.flyTo({ center: [w.centroid_lon, w.centroid_lat], zoom: 14, duration: 1200 })
    }
  }, [clusters, warningClusters, mapLoaded, fetchLocationName])

  // Forward geocode (place/address search) — bounded to Lebanon so results are local. Reuses the
  // same public Mapbox token already used for reverse geocoding (no new secret/route).
  const runSearch = useCallback(async (q: string) => {
    const query = q.trim()
    if (query.length < 2) { setSearchResults([]); return }
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?access_token=${token}&country=lb&bbox=35.10,33.05,36.62,34.69&limit=5&language=en,ar&types=place,locality,neighborhood,address,poi`
    try {
      const res = await fetch(url)
      const data = await res.json() as { features?: { place_name: string; center: [number, number] }[] }
      setSearchResults((data.features ?? []).map((f) => ({ name: f.place_name, lon: f.center[0], lat: f.center[1] })))
    } catch { setSearchResults([]) }
  }, [])

  // Debounce the search so we don't hit the geocoder on every keystroke.
  useEffect(() => {
    if (!searchOpen) return
    const id = setTimeout(() => { runSearch(searchQuery) }, 300)
    return () => clearTimeout(id)
  }, [searchQuery, searchOpen, runSearch])

  const flyToResult = useCallback((r: { name: string; lat: number; lon: number }) => {
    if (map.current) map.current.flyTo({ center: [r.lon, r.lat], zoom: 13, duration: 1200 })
    setSearchQuery(r.name)
    setSearchResults([])
    setSearchOpen(false)
  }, [])

  // "Near me" — recenter on the user's GPS and drop a marker. Battery-light: a one-shot fix,
  // never continuous tracking. Fails gracefully (denied / unavailable / timeout).
  const locateMe = useCallback(() => {
    setGeoError(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGeoError(t('geo_unavailable')); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const { latitude, longitude } = pos.coords
        if (!map.current || !window.mapboxgl) return
        map.current.flyTo({ center: [longitude, latitude], zoom: 14, duration: 1200 })
        try { userMarker.current?.remove() } catch { /* ignore */ }
        userMarker.current = new window.mapboxgl.Marker({ color: '#58a6ff' }).setLngLat([longitude, latitude]).addTo(map.current)
      },
      () => { setLocating(false); setGeoError(t('geo_failed')) },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }, [t])

  // Open the area-alert modal seeded with the map's current centre as the chosen area.
  const openAlerts = useCallback(() => {
    let area = { lat: 33.8938, lon: 35.5018 }
    try { const c = map.current?.getCenter?.(); if (c) area = { lat: c.lat, lon: c.lng } } catch { /* map not ready */ }
    setAlertArea(area); setAlertResult(null); setAlertErr(null); setAlertCopied(false); setAlertsOpen(true)
  }, [])

  // Landing entry point: /map?alerts=1 opens the area-alert modal once the map has settled
  // (so getCenter() reflects any ?lat/lon deep-link rather than the default centre).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get('alerts')) return
    const id = setTimeout(() => openAlerts(), 700)
    return () => clearTimeout(id)
  }, [openAlerts])

  const subscribeAlerts = useCallback(async () => {
    if (!alertArea || alertBusy) return
    setAlertBusy(true); setAlertErr(null)
    try {
      const res = await fetch('/api/alerts/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: alertArea.lat, lon: alertArea.lon, radius_metres: alertRadius, lang }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.topic) setAlertResult({ topic: d.topic, subscribe_url: d.subscribe_url })
      else setAlertErr(d.error ?? t('alerts_err'))
    } catch { setAlertErr(t('alerts_err')) } finally { setAlertBusy(false) }
  }, [alertArea, alertRadius, alertBusy, lang, t])

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
          ['==', ['get', 'status'], 'confirmed'], '#ef4444',
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
          ['==', ['get', 'status'], 'confirmed'], '#ef4444',
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
          ['==', ['get', 'status'], 'confirmed'], '#ef4444',
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
        .setHTML(`<div style="background:#1a130a;border:1px solid #f97316;border-radius:6px;padding:5px 10px;font-size:12px;color:#fdba74">${escapeHtml(name)}</div>`)
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
      .limit(500)

    const rows = (data ?? []) as Cluster[]
    setClusters(rows)
    updateMapSource(rows)

    // Also load warning clusters
    const { data: warnData } = await supabase.current
      .from('warning_clusters')
      .select('*')
      .in('status', ['active', 'all_clear'])
      .order('created_at', { ascending: false })
      .limit(200)

    const warnRows = (warnData ?? []) as WarningCluster[]
    setWarningClusters(warnRows)
    updateWarningSource(warnRows)
    setLastUpdated(Date.now())
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
            setLastUpdated(Date.now())
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
            setLastUpdated(Date.now())
          }
        }
      )
      .subscribe()
  }, [updateMapSource, updateWarningSource])

  // 1s tick keeps the "updated Xs ago" freshness label live (paused when the tab is hidden).
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setFreshTick((n) => n + 1) }, 1000)
    return () => clearInterval(id)
  }, [])

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

  // ── Time-travel play / stop ────────────────────────────────────────────

  const stopPlay = useCallback(() => {
    setIsPlaying(false)
    if (playRef.current) {
      clearInterval(playRef.current)
      playRef.current = null
    }
  }, [])

  const startPlay = useCallback(() => {
    setIsPlaying(true)
    setScrubDate((prev) => (prev.getTime() >= END_DATE.getTime() ? new Date(START_DATE) : prev))
    playRef.current = setInterval(() => {
      setScrubDate((prev) => {
        const next = new Date(prev.getTime() + 86400000)
        if (next.getTime() >= END_DATE.getTime()) {
          if (playRef.current) { clearInterval(playRef.current); playRef.current = null }
          setIsPlaying(false)
          return END_DATE
        }
        return next
      })
    }, 600)
  }, [])

  useEffect(() => () => {
    if (playRef.current) clearInterval(playRef.current)
  }, [])

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
        try { map.current.setLanguage(langRef.current) } catch { /* keep style default */ }
      })

      map.current.on('load', () => {
        setMapLoaded(true)
        try { map.current.setLanguage(langRef.current) } catch { /* keep style default */ }
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

  // ── The clusters currently shown on the map (filters + time-travel). Shared by the map
  //    source AND the incident list so the two always match. ────────────────────────────────
  const visibleClusters = useMemo(() => {
    const now = Date.now()
    const scrubMs = scrubDate.getTime()
    const timeWindow = TIME_RANGES.find((r) => r.id === timeRange)
    const period = OPERATION_PERIODS.find((p) => p.id === operationFilter)
    return clusters.filter((c) => {
      const t = new Date(c.created_at).getTime()
      if (timeEnabled && t > scrubMs) return false
      if (timeWindow && now - t > timeWindow.ms) return false
      if (statusFilter === 'confirmed' && c.status !== 'confirmed') return false
      if (period) {
        if (t < period.start.getTime()) return false
        if (period.end && t >= period.end.getTime()) return false
      }
      if (eventTypeFilter !== 'all' && !c.dominant_event_types?.includes(eventTypeFilter)) return false
      return true
    })
  }, [clusters, timeRange, statusFilter, operationFilter, eventTypeFilter, scrubDate, timeEnabled])

  // ── Effect 2: filter → map source ──────────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.getSource('clusters-dots')) return
    updateMapSource(visibleClusters)
  }, [visibleClusters, updateMapSource])

  // ── Effect 3: reset panel state when selection changes ────────────────

  useEffect(() => {
    setShowFullReasoning(false)
    setShareLabel('Share this alert')
  }, [selectedCluster])

  useEffect(() => {
    setAllClearSent(false)
  }, [selectedWarning])

  // ── News feed fetch ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/news?limit=40')
        const data = (await res.json()) as { articles?: NewsArticle[] }
        if (!cancelled) setArticles(data.articles ?? [])
      } catch {
        if (!cancelled) setArticles([])
      } finally {
        if (!cancelled) setNewsLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

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
    // Deep-link to the OPEN incident/warning so the recipient lands on it (the id opens the
    // panel once data loads; lat/lon/zoom fly there immediately, even before data arrives).
    let url = window.location.origin + '/map'
    if (selectedCluster) {
      url += `?incident=${selectedCluster.id}&lat=${selectedCluster.centroid_lat}&lon=${selectedCluster.centroid_lon}&zoom=14`
    } else if (selectedWarning) {
      url += `?warning=${selectedWarning.id}&lat=${selectedWarning.centroid_lat}&lon=${selectedWarning.centroid_lon}&zoom=14`
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: 'NOUR — Live Map', url })
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
  }, [selectedCluster, selectedWarning])

  // Open an incident from the list — mirrors the map-dot click (select + fly + load name).
  const selectFromList = useCallback((c: Cluster) => {
    setSelectedWarning(null)
    setSelectedCluster(c)
    fetchLocationName(c.centroid_lat, c.centroid_lon, c.id)
    if (map.current) map.current.flyTo({ center: [c.centroid_lon, c.centroid_lat], zoom: 14, duration: 1200 })
    if (isMobile) setListOpen(false)
  }, [fetchLocationName, isMobile])

  const STATUS_HEX: Record<string, string> = { official_verified: '#a371f7', news_verified: '#58a6ff', confirmed: '#ef4444', auto_confirmed: '#f97316' }
  const statusKey = (s: string) => (s === 'official_verified' ? 'st_official' : s === 'news_verified' ? 'st_news' : s === 'confirmed' ? 'st_civilian' : 'st_auto')

  // ── Derived values ────────────────────────────────────────────────────

  const recentCluster = clusters[0] ?? null
  const activeWarnings = warningClusters.filter((w) => w.status === 'active')
  const activeWarningCount = activeWarnings.length
  const bannerWarning = activeWarnings[warningBannerIndex % Math.max(activeWarnings.length, 1)] ?? null
  const showBanner = activeWarningCount > 0 && !warningBannerDismissed
  // Where the top-of-map overlays (search, controls) start on mobile: below the banner
  // (38px) + the actual measured top-bar height + an 8px gap.
  const mobileTop = (showBanner ? 38 : 0) + headerH + 8

  // Keep headerH in sync with the top bar's real rendered height (summary line count,
  // banner toggle, viewport changes all affect it).
  useEffect(() => {
    const el = topBarRef.current
    if (!el) return
    const measure = () => setHeaderH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isMobile, showBanner])
  const visibleCount = timeEnabled
    ? clusters.filter((c) => new Date(c.created_at).getTime() <= scrubDate.getTime()).length
    : clusters.length
  const isSatelliteStyle =
    mapStyle === 'mapbox://styles/mapbox/satellite-v9' ||
    mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12'
  const roadsDisabled = !isSatelliteStyle
  const roadsOn = mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12'
  const satelliteOn = isSatelliteStyle

  // ── Filter helpers ────────────────────────────────────────────────────

  const activeFilterCount = [timeRange, statusFilter, operationFilter, eventTypeFilter].filter((v) => v !== 'all').length

  const resetFilters = () => {
    setTimeRange('all')
    setStatusFilter('all')
    setOperationFilter('all')
    setEventTypeFilter('all')
  }

  const filterPillStyle = (active: boolean) => ({
    background: active ? 'rgba(239,68,68,0.2)' : 'rgba(10,10,15,0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: active ? '0.5px solid #ef4444' : '0.5px solid rgba(255,255,255,0.15)',
    color: active ? '#ef4444' : 'rgba(255,255,255,0.6)',
    padding: '5px 10px',
    borderRadius: 14,
    fontSize: 11,
    cursor: 'pointer',
    minHeight: isMobile ? 36 : 32,
    whiteSpace: 'nowrap' as const,
  })

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
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
          NOUR
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
              <button type="button" onClick={() => setWarningBannerIndex((i) => (i - 1 + activeWarningCount) % activeWarningCount)} style={{ background: 'none', border: 'none', color: '#fdba74', fontSize: 14, cursor: 'pointer', padding: 2, minWidth: 32, minHeight: 32 }}>←</button>
              <span style={{ fontSize: 10, color: '#fdba74' }}>{(warningBannerIndex % activeWarningCount) + 1}/{activeWarningCount}</span>
              <button type="button" onClick={() => setWarningBannerIndex((i) => (i + 1) % activeWarningCount)} style={{ background: 'none', border: 'none', color: '#fdba74', fontSize: 14, cursor: 'pointer', padding: 2, minWidth: 32, minHeight: 32 }}>→</button>
            </div>
          )}
          <button type="button" onClick={() => setWarningBannerDismissed(true)} style={{ background: 'none', border: 'none', color: '#fdba74', fontSize: 16, cursor: 'pointer', padding: '0 8px', flexShrink: 0, lineHeight: 1, minWidth: 32, minHeight: 32 }}>×</button>
        </div>
      )}

      {/* Top bar */}
      <div
        ref={topBarRef}
        style={{
          position: 'absolute',
          top: showBanner ? 38 : 0,
          left: 0,
          right: 0,
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          padding: isMobile ? '8px 10px' : '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 12,
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
            {recentCluster?.status === 'official_verified' ? t('official') : t('live')}
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
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            {timeEnabled && (
              <span style={{
                background: 'rgba(210,153,34,0.1)',
                border: '1px solid rgba(210,153,34,0.2)',
                color: '#d29922',
                fontSize: 10,
                fontWeight: 500,
                padding: '2px 7px',
                borderRadius: 20,
                whiteSpace: 'nowrap',
              }}>
                time travel mode
              </span>
            )}
            <span>
              {visibleCount} confirmed incident{visibleCount !== 1 ? 's' : ''} · {activeWarningCount} active warning{activeWarningCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {recentCluster
              ? `${locationNames[recentCluster.id] ?? 'Loading location...'} · ${recentCluster.report_count} reports · ${timeAgo(recentCluster.created_at)}`
              : 'Monitoring active — no confirmed incidents'}
            {lastUpdated && <span style={{ color: 'rgba(255,255,255,0.4)' }}> · {t('updated')} {freshAgo(lastUpdated)}</span>}
          </div>
        </div>

        {/* Incident list button */}
        <button
          type="button"
          onClick={() => { setListOpen((v) => !v); setNewsOpen(false) }}
          aria-label={`Toggle incident list, ${visibleClusters.length} incidents`}
          aria-pressed={listOpen}
          style={{
            background: listOpen ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.08)',
            border: listOpen ? '0.5px solid rgba(239,68,68,0.4)' : '0.5px solid rgba(255,255,255,0.15)',
            color: listOpen ? '#ef4444' : '#ffffff',
            minWidth: isMobile ? 44 : undefined,
            minHeight: isMobile ? 44 : 36,
            padding: isMobile ? '0 10px' : '7px 12px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: 'system-ui',
            touchAction: 'manipulation',
          }}
        >
          <svg width={isMobile ? 16 : 12} height={isMobile ? 16 : 12} viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="2" cy="3" r="1.2" fill="currentColor" /><path d="M5 3h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="2" cy="7" r="1.2" fill="currentColor" /><path d="M5 7h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="2" cy="11" r="1.2" fill="currentColor" /><path d="M5 11h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span style={{ display: isMobile ? 'none' : 'inline' }}>{t('list')}</span>
        </button>

        {/* News feed button */}
        <button
          type="button"
          onClick={() => { setNewsOpen((v) => !v); setListOpen(false) }}
          aria-label={`Toggle intelligence feed${articles.length > 0 ? `, ${articles.length} articles` : ''}`}
          style={{
            background: newsOpen ? 'rgba(88,166,255,0.18)' : 'rgba(255,255,255,0.08)',
            border: newsOpen ? '0.5px solid rgba(88,166,255,0.4)' : '0.5px solid rgba(255,255,255,0.15)',
            color: newsOpen ? '#58a6ff' : '#ffffff',
            minWidth: isMobile ? 44 : undefined,
            minHeight: isMobile ? 44 : 36,
            padding: isMobile ? '0 10px' : '7px 12px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: 'system-ui',
            touchAction: 'manipulation',
          }}
        >
          <svg width={isMobile ? 16 : 12} height={isMobile ? 16 : 12} viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3.5 5h7M3.5 7.5h7M3.5 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span style={{ display: isMobile ? 'none' : 'inline' }}>{t('news')}</span>
          {articles.length > 0 && (
            <span style={{
              background: '#ef4444',
              color: '#ffffff',
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 10,
              minWidth: 16,
              textAlign: 'center',
              lineHeight: '14px',
            }}>
              {articles.length > 99 ? '99+' : articles.length}
            </span>
          )}
        </button>

        {/* Language toggle (shared 'fl_lang'; also switches the basemap labels) */}
        <div style={{ display: 'flex', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          {(['en', 'fr', 'ar'] as MapLang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => changeLang(l)}
              aria-label={`Language: ${l === 'ar' ? 'Arabic' : l === 'fr' ? 'French' : 'English'}`}
              aria-pressed={lang === l}
              style={{
                background: lang === l ? 'rgba(239,68,68,0.25)' : 'transparent',
                color: lang === l ? '#fff' : 'rgba(255,255,255,0.6)',
                border: 'none', cursor: 'pointer', fontFamily: 'system-ui',
                fontSize: 11, fontWeight: 600, padding: isMobile ? '0 7px' : '0 8px',
                minHeight: isMobile ? 44 : 36, lineHeight: 1,
              }}
            >{l === 'ar' ? 'ع' : l.toUpperCase()}</button>
          ))}
        </div>

        {/* Report button */}
        <a
          href="/report"
          style={{
            background: '#ef4444',
            color: '#ffffff',
            padding: isMobile ? '0 12px' : '7px 14px',
            minHeight: isMobile ? 44 : 36,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {isMobile ? t('report_short') : t('report')}
        </a>
      </div>

      {/* ── Search a place + "find my location" (top-left) ──────────────── */}
      <div
        style={{
          position: 'absolute',
          top: isMobile ? mobileTop : (showBanner ? 56 + 38 + 8 : 56 + 8),
          left: 12,
          width: isMobile ? 'calc(100vw - 64px)' : 280,
          maxWidth: 'calc(100vw - 24px)',
          zIndex: 6,
          display: isMobile && newsOpen ? 'none' : 'flex',
          flexDirection: 'column',
          gap: 6,
          transition: 'top 0.3s',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); setGeoError(null) }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults[0]) flyToResult(searchResults[0])
                else if (e.key === 'Escape') { setSearchOpen(false); setSearchResults([]) }
              }}
              placeholder={t('search_ph')}
              aria-label={t('search_ph')}
              style={{
                width: '100%', boxSizing: 'border-box', height: 38, padding: '0 30px 0 12px',
                background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', fontSize: 14,
                fontFamily: 'system-ui', outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false) }}
                aria-label={t('clear')}
                style={{ position: 'absolute', right: 2, top: 4, width: 30, height: 30, borderRadius: 6, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18, lineHeight: '30px' }}
              >×</button>
            )}
          </div>
          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            aria-label={t('locate')}
            title={t('locate')}
            style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '0.5px solid rgba(255,255,255,0.15)', color: locating ? '#8b949e' : '#58a6ff', cursor: locating ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
              <line x1="8" y1="0.5" x2="8" y2="3" stroke="currentColor" strokeWidth="1.4" />
              <line x1="8" y1="13" x2="8" y2="15.5" stroke="currentColor" strokeWidth="1.4" />
              <line x1="0.5" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.4" />
              <line x1="13" y1="8" x2="15.5" y2="8" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={openAlerts}
            aria-label={t('alerts_title')}
            title={t('alerts_title')}
            style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '0.5px solid rgba(255,255,255,0.15)', color: '#f59e0b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 1.6a3.4 3.4 0 0 0-3.4 3.4c0 3.2-1.3 4.2-1.3 4.2h9.4s-1.3-1-1.3-4.2A3.4 3.4 0 0 0 8 1.6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M6.7 12.4a1.4 1.4 0 0 0 2.6 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 10, overflow: 'hidden' }}>
            {searchResults.map((r, i) => (
              <button
                key={`${r.lat},${r.lon},${i}`}
                type="button"
                onClick={() => flyToResult(r)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderTop: i ? '0.5px solid rgba(255,255,255,0.07)' : 'none', color: '#e6edf3', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }}
              >{r.name}</button>
            ))}
          </div>
        )}
        {geoError && <div style={{ background: 'rgba(248,81,73,0.15)', border: '0.5px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>{geoError}</div>}
      </div>

      {/* ── Mobile controls toggle button ──────────────────────────────── */}
      {isMobile && (
        <button
          type="button"
          onClick={() => setShowControls((v) => !v)}
          aria-label="Toggle map controls"
          style={{
            position: 'absolute',
            top: mobileTop,
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

      {/* ── Map controls: style switcher + layers. On mobile both live in ONE
           right-aligned scrollable column bounded to the viewport, so the second
           panel can never sit off the bottom of a short phone; desktop keeps the
           original absolute layout via display:contents. Visual-only — same
           toggles and handlers. */}
      {(showControls || !isMobile) && (
        <div style={isMobile
          ? { position: 'absolute', top: mobileTop + 46, right: 12, bottom: 12, zIndex: 5, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, maxWidth: 'calc(100vw - 24px)', pointerEvents: 'none' }
          : { display: 'contents' }}>
        <div
          style={{
            position: isMobile ? 'static' : 'absolute',
            top: isMobile ? undefined : (showBanner ? 56 + 38 + 8 : 56 + 8),
            right: isMobile ? undefined : 12,
            flexShrink: 0,
            pointerEvents: 'auto',
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

      {/* ── PART 2: Layer controls ─────────────────────────────────────── */}
        <div
          style={{
            position: isMobile ? 'static' : 'absolute',
            top: isMobile ? undefined : (showBanner ? 56 + 38 + 8 + 268 + 12 : 56 + 8 + 268 + 12),
            right: isMobile ? undefined : 12,
            flexShrink: 0,
            pointerEvents: 'auto',
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
          bottom: 36,
          left: 8,
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 8,
          padding: '8px 12px',
          zIndex: 5,
          display: isMobile && (timeEnabled || filtersOpen) ? 'none' : undefined,
        }}
      >
        {/* STRIKES section */}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{t('legend_strikes')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a371f7', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          {t('st_official')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#58a6ff', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          {t('st_news')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          {t('st_civilian')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          {t('st_auto')}
        </div>
        {/* Divider */}
        <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.1)', margin: '8px 0' }} />
        {/* WARNINGS section */}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{t('legend_warnings')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', flexShrink: 0, marginLeft: 6, marginRight: 6, boxShadow: '0 0 0 2px rgba(249,115,22,0.3)' }} />
          {t('warn_active')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, marginLeft: 6, marginRight: 6 }} />
          {t('warn_clear')}
        </div>
        {/* Help links */}
        <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.1)', margin: '8px 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <a href="/resources" style={{ fontSize: 11, color: '#f85149', textDecoration: 'none' }}>{t('emergency_help')} →</a>
          <a href="/methodology" style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>{t('how_it_works')} →</a>
        </div>
      </div>

      {/* Filter bar (collapsed) */}
      <div
        style={{
          position: 'absolute',
          bottom: isMobile ? (timeEnabled ? 208 : 84) : (timeEnabled ? 168 : 76),
          left: isMobile ? 'auto' : '50%',
          right: isMobile ? 12 : 'auto',
          transform: isMobile ? 'none' : 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 5,
          transition: 'bottom 0.25s ease',
        }}
      >
        {!timeEnabled && (
          <button
            type="button"
            onClick={() => {
              setTimeEnabled(true)
              setScrubDate(END_DATE)
            }}
            style={{
              ...filterPillStyle(false),
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              touchAction: 'manipulation',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 4v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Time travel
          </button>
        )}
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          style={filterPillStyle(filtersOpen || activeFilterCount > 0)}
        >
          Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            style={filterPillStyle(false)}
          >
            Reset
          </button>
        )}
      </div>

      {/* Filter sheet (expanded) */}
      {filtersOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? (timeEnabled ? 252 : 128) : (timeEnabled ? 212 : 120),
            left: isMobile ? 'auto' : '50%',
            right: isMobile ? 12 : 'auto',
            transform: isMobile ? 'none' : 'translateX(-50%)',
            width: isMobile ? 'min(300px, calc(100vw - 24px))' : 'min(440px, calc(100vw - 24px))',
            background: 'rgba(10,10,15,0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 12,
            padding: 12,
            zIndex: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxHeight: '55vh',
            overflowY: 'auto',
            transition: 'bottom 0.25s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.3 }}>
              Filters
            </span>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              aria-label="Close filters"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.55)',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          {(
            [
              {
                label: 'Time',
                value: timeRange,
                set: (id: TimeRangeId) => setTimeRange(id),
                options: [{ id: 'all' as const, label: 'All' }, ...TIME_RANGES.map((r) => ({ id: r.id, label: r.label }))],
              },
              {
                label: 'Status',
                value: statusFilter,
                set: (id: 'all' | 'confirmed') => setStatusFilter(id),
                options: [
                  { id: 'all' as const, label: 'All' },
                  { id: 'confirmed' as const, label: 'Confirmed only' },
                ],
              },
              {
                label: 'Operation',
                value: operationFilter,
                set: (id: OperationId) => setOperationFilter(id),
                options: [{ id: 'all' as const, label: 'All' }, ...OPERATION_PERIODS.map((p) => ({ id: p.id, label: p.label }))],
              },
              {
                label: 'Event type',
                value: eventTypeFilter,
                set: (id: EventTypeId) => setEventTypeFilter(id),
                options: [{ id: 'all' as const, label: 'All' }, ...EVENT_TYPE_OPTIONS.map((e) => ({ id: e.id, label: e.label }))],
              },
            ] as const
          ).map((group) => (
            <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.45)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.7,
                }}
              >
                {group.label}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {group.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => (group.set as (id: string) => void)(opt.id)}
                    style={filterPillStyle(group.value === opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              style={{
                ...filterPillStyle(false),
                alignSelf: 'flex-start',
                marginTop: 4,
              }}
            >
              Reset all
            </button>
          )}
        </div>
      )}

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
                    : selectedCluster.status === 'confirmed' ? '#450a0a'
                    : '#431407',
                color:
                  selectedCluster.status === 'official_verified' ? '#a371f7'
                    : selectedCluster.status === 'news_verified' ? '#58a6ff'
                    : selectedCluster.status === 'confirmed' ? '#fca5a5'
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

      {/* ── Area-alert subscription modal ──────────────────────────────── */}
      {alertsOpen && (
        <div onClick={() => setAlertsOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'} style={{ width: 380, maxWidth: '100%', background: '#0f0f16', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: 20, color: '#e6edf3', fontFamily: 'system-ui' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>🔔 {t('alerts_title')}</div>
              <button type="button" onClick={() => setAlertsOpen(false)} aria-label={t('done')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
            </div>
            {!alertResult ? (
              <>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>{t('alerts_desc')}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>{t('alerts_centre')}{alertArea ? ` (${alertArea.lat.toFixed(3)}, ${alertArea.lon.toFixed(3)})` : ''}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>{t('radius_label')}</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {[2000, 5000, 10000].map((r) => (
                    <button key={r} type="button" onClick={() => setAlertRadius(r)} style={{ flex: 1, minHeight: 40, borderRadius: 8, cursor: 'pointer', fontFamily: 'system-ui', fontSize: 13, fontWeight: 600, background: alertRadius === r ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)', border: `0.5px solid ${alertRadius === r ? '#f59e0b' : 'rgba(255,255,255,0.15)'}`, color: alertRadius === r ? '#f59e0b' : 'rgba(255,255,255,0.7)' }}>{r / 1000} {t('km')}</button>
                  ))}
                </div>
                {alertErr && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>{alertErr}</div>}
                <button type="button" onClick={subscribeAlerts} disabled={alertBusy} style={{ width: '100%', minHeight: 46, borderRadius: 10, background: '#f59e0b', border: 'none', color: '#1a1a1a', fontSize: 15, fontWeight: 700, cursor: alertBusy ? 'default' : 'pointer', fontFamily: 'system-ui', opacity: alertBusy ? 0.7 : 1 }}>{alertBusy ? t('subscribing') : t('subscribe')}</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#3fb950', marginBottom: 6 }}>✓ {t('alerts_ready')}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>{t('alerts_howto')}</div>
                <div style={{ background: '#0a0a0f', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 10px', fontSize: 12, wordBreak: 'break-all', color: '#58a6ff', marginBottom: 10 }}>{alertResult.subscribe_url}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={alertResult.subscribe_url} target="_blank" rel="noreferrer noopener" style={{ flex: 1, textAlign: 'center', minHeight: 44, lineHeight: '44px', borderRadius: 10, background: '#f59e0b', color: '#1a1a1a', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>{t('open_link')}</a>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(alertResult.subscribe_url).then(() => { setAlertCopied(true); setTimeout(() => setAlertCopied(false), 2000) }).catch(() => {}) }} style={{ flex: 1, minHeight: 44, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontFamily: 'system-ui', fontSize: 14, fontWeight: 600 }}>{alertCopied ? t('copied') : t('copy_link')}</button>
                </div>
                <button type="button" onClick={() => setAlertsOpen(false)} style={{ width: '100%', marginTop: 10, minHeight: 40, borderRadius: 10, background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontFamily: 'system-ui', fontSize: 13 }}>{t('done')}</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Incident list drawer ───────────────────────────────────────── */}
      {listOpen && isMobile && (
        <div
          onClick={() => setListOpen(false)}
          style={{ position: 'absolute', top: mobileTop, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 14, touchAction: 'none' }}
        />
      )}
      <aside
        aria-hidden={!listOpen}
        aria-label={t('incidents')}
        style={{
          position: 'absolute',
          top: isMobile ? mobileTop : (showBanner ? 38 : 0),
          bottom: 0,
          left: 0,
          width: isMobile ? 'min(94vw, 420px)' : 380,
          maxWidth: '100vw',
          background: 'rgba(10,10,15,0.97)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRight: '0.5px solid rgba(255,255,255,0.08)',
          transform: listOpen ? 'translateX(0)' : 'translateX(-110%)',
          transition: 'transform 0.28s ease, top 0.3s',
          zIndex: 15,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          boxShadow: listOpen ? '4px 0 24px rgba(0,0,0,0.35)' : 'none',
        }}
      >
        <div style={{ padding: isMobile ? '14px 14px 12px' : '14px 16px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#ef4444', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase' }}>{t('incidents')}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{visibleClusters.length}{lastUpdated ? ` · ${t('updated')} ${freshAgo(lastUpdated)}` : ''}</div>
          </div>
          <button type="button" onClick={() => setListOpen(false)} aria-label="Close list" style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', flexShrink: 0, fontSize: 18, lineHeight: '30px' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {visibleClusters.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{t('no_incidents')}</div>}
          {visibleClusters.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectFromList(c)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: isRtl ? 'right' : 'left',
                background: selectedCluster?.id === c.id ? 'rgba(239,68,68,0.10)' : 'transparent', border: 'none',
                borderBottom: '0.5px solid rgba(255,255,255,0.06)', padding: '12px 14px', cursor: 'pointer', fontFamily: 'system-ui',
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_HEX[c.status] ?? '#8b949e', flexShrink: 0, marginTop: 4 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', color: '#e6edf3', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {locationNames[c.id] ?? (c.dominant_event_types?.[0] ? formatEventType(c.dominant_event_types[0]) : `${c.centroid_lat.toFixed(3)}, ${c.centroid_lon.toFixed(3)}`)}
                </span>
                <span style={{ display: 'block', color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 }}>
                  {t(statusKey(c.status))} · {c.report_count} {t('reports')} · {timeAgo(c.created_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Intelligence feed drawer ───────────────────────────────────── */}
      {newsOpen && isMobile && (
        <div
          onClick={() => setNewsOpen(false)}
          style={{
            position: 'absolute',
            top: mobileTop,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 14,
            touchAction: 'none',
          }}
        />
      )}
      <aside
        aria-hidden={!newsOpen}
        aria-label="Intelligence feed"
        style={{
          position: 'absolute',
          top: isMobile ? mobileTop : (showBanner ? 38 : 0),
          bottom: 0,
          left: 0,
          width: isMobile ? 'min(94vw, 420px)' : 380,
          maxWidth: '100vw',
          background: 'rgba(10,10,15,0.97)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRight: '0.5px solid rgba(255,255,255,0.08)',
          transform: newsOpen ? 'translateX(0)' : 'translateX(-110%)',
          transition: 'transform 0.28s ease, top 0.3s',
          zIndex: 15,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          boxShadow: newsOpen ? '4px 0 24px rgba(0,0,0,0.35)' : 'none',
        }}
      >
        <div style={{
          padding: isMobile ? '14px 14px 12px' : '14px 16px 12px',
          borderBottom: '0.5px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#58a6ff', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 2 }}>
              INTELLIGENCE FEED
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              Articles on the war from trusted sources
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNewsOpen(false)}
            aria-label="Close news feed"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.12)',
              color: '#ffffff',
              fontSize: 22,
              cursor: 'pointer',
              lineHeight: 1,
              width: 44,
              height: 44,
              minWidth: 44,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              touchAction: 'manipulation',
            }}
          >
            ×
          </button>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          padding: isMobile
            ? '12px 14px calc(20px + env(safe-area-inset-bottom))'
            : '12px 14px 16px',
        }}>
          {newsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                background: '#161b22',
                borderRadius: 8,
                height: 110,
                marginBottom: 10,
                animation: 'pulse-dot 1.5s ease-in-out infinite',
              }} />
            ))
          ) : articles.length === 0 ? (
            <div style={{ padding: '32px 12px', textAlign: 'center', fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
              No articles yet.<br />The feed updates every few minutes.
            </div>
          ) : (
            articles.map((article) => {
              const src = NEWS_SOURCE_STYLES[article.source] ?? {
                bg: 'rgba(139,148,158,0.12)', color: '#9ca3af',
              }
              const accent = article.event_type
                ? NEWS_EVENT_COLORS[article.event_type] ?? '#6b7280'
                : '#6b7280'
              const dateStr = article.published_at ?? article.fetched_at
              return (
                <a
                  key={article.id}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    background: '#12161d',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10,
                    padding: isMobile ? 14 : 12,
                    marginBottom: 10,
                    textDecoration: 'none',
                    color: 'inherit',
                    minHeight: 48,
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                      background: src.bg, color: src.color, letterSpacing: '0.04em',
                    }}>
                      {article.source}
                    </span>
                    {article.event_type && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                        background: `${accent}22`, color: accent, textTransform: 'capitalize',
                      }}>
                        {article.event_type.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      {timeAgo(dateStr)}
                    </span>
                  </div>
                  <div style={{
                    fontSize: isMobile ? 16 : 14,
                    fontWeight: 500,
                    color: '#e6edf3',
                    lineHeight: 1.4,
                    marginBottom: 6,
                  }}>
                    {article.title}
                  </div>
                  {article.summary && (
                    <div style={{
                      fontSize: isMobile ? 14 : 12.5,
                      color: '#9ca3af',
                      lineHeight: 1.55,
                      marginBottom: 8,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical' as const,
                    }}>
                      {article.summary}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', rowGap: 4 }}>
                    {article.location_name && (
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        📍 {article.location_name}
                      </span>
                    )}
                    {article.casualty_count != null && article.casualty_count > 0 && (
                      <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>
                        {article.casualty_count} casualties reported
                      </span>
                    )}
                    {article.linked_cluster_id && (
                      <span style={{ fontSize: 11, color: '#22c55e' }}>
                        ↔ Linked to confirmed incident
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: '#58a6ff', fontWeight: 500 }}>Read ↗</span>
                  </div>
                </a>
              )
            })
          )}
        </div>
      </aside>

      {/* ── Time-travel timeline (expanded scrubber) ─────────────────── */}
      {timeEnabled && (
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 48px)',
            maxWidth: 900,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(13,17,23,0.92)',
              border: '1px solid #21262d',
              borderRadius: 10,
              padding: isMobile ? '10px 12px' : '12px 16px',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              pointerEvents: 'auto',
            }}
          >
            {/* Top row: date + count + controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
                gap: 12,
                flexWrap: isMobile ? 'wrap' : 'nowrap',
                rowGap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
                <span
                  style={{
                    fontSize: isMobile ? 14 : 15,
                    fontWeight: 600,
                    color: '#e6edf3',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatScrubDate(scrubDate)}
                </span>
                <span style={{ fontSize: 11, color: '#484f58', marginLeft: 6 }}>
                  {formatScrubTime(scrubDate)}
                </span>
                <span
                  style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 20,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#ef4444',
                    marginLeft: 10,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {visibleCount} strike{visibleCount !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
                  onClick={() => (isPlaying ? stopPlay() : startPlay())}
                  style={{
                    width: isMobile ? 40 : 32,
                    height: isMobile ? 40 : 32,
                    borderRadius: '50%',
                    border: '1px solid #21262d',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#e6edf3',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                  }}
                >
                  {isPlaying ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="2" y="1" width="3" height="10" rx="1" fill="currentColor" />
                      <rect x="7" y="1" width="3" height="10" rx="1" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <polygon points="2,1 11,6 2,11" fill="currentColor" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Reset to today and exit time travel"
                  onClick={() => {
                    stopPlay()
                    setScrubDate(END_DATE)
                    setTimeEnabled(false)
                  }}
                  style={{
                    width: isMobile ? 40 : 32,
                    height: isMobile ? 40 : 32,
                    borderRadius: '50%',
                    border: '1px solid #21262d',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#e6edf3',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M10 6A4 4 0 1 1 6 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                    <path d="M6 0l2 2.5L5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrubber row */}
            <div style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
              {/* Track */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: 4,
                  background: '#21262d',
                  borderRadius: 2,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              />
              {/* Progress fill */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  height: 4,
                  background: 'linear-gradient(to right, #d29922, #f85149)',
                  borderRadius: 2,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: `${dateToPercent(scrubDate)}%`,
                  pointerEvents: 'none',
                }}
              />
              {/* Key event markers */}
              {KEY_EVENTS.map((ev) => {
                const near = Math.abs(scrubDate.getTime() - ev.date.getTime()) <= 12 * 3600 * 1000
                return (
                  <div
                    key={ev.label}
                    title={ev.label}
                    style={{
                      position: 'absolute',
                      left: `${dateToPercent(ev.date)}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      zIndex: 2,
                      pointerEvents: 'none',
                    }}
                  >
                    {near && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 14,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'rgba(13,17,23,0.9)',
                          border: `1px solid ${ev.color}`,
                          borderRadius: 4,
                          padding: '3px 7px',
                          fontSize: 10,
                          fontWeight: 500,
                          color: ev.color,
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                        }}
                      >
                        {ev.label}
                      </div>
                    )}
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: ev.color,
                        border: '2px solid rgba(13,17,23,0.8)',
                      }}
                    />
                  </div>
                )
              })}
              {/* Thumb */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: `${dateToPercent(scrubDate)}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'white',
                  border: '2px solid #f85149',
                  cursor: isPlaying ? 'grabbing' : 'grab',
                  zIndex: 3,
                  boxShadow: '0 0 0 3px rgba(248,81,73,0.15)',
                  pointerEvents: 'none',
                }}
              />
              {/* Invisible range input over the full track */}
              <input
                type="range"
                min={0}
                max={1000}
                step={1}
                value={Math.round(dateToPercent(scrubDate) * 10)}
                onChange={(e) => {
                  stopPlay()
                  const pct = parseInt(e.target.value, 10) / 10
                  setScrubDate(percentToDate(pct))
                }}
                aria-label="Scrub timeline date"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                  zIndex: 4,
                  margin: 0,
                }}
              />
            </div>

            {/* Date labels row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 6,
                fontSize: 10,
                color: '#484f58',
                pointerEvents: 'none',
              }}
            >
              <span>22 Mar</span>
              <span style={{ color: 'rgba(248,81,73,0.6)' }}>Apr 8 — Op Eternal Darkness</span>
              <span>Today</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
