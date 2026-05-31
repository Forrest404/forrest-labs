'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

declare global {
  interface Window { mapboxgl: any }
}

// Mobile-first field view for field coordinators. One screen, no menus: identity-forward
// status bar, a dominant CHECK-IN, big STATUS chips, the current assignment (when any), and
// an always-visible fixed PANIC bar. Works offline (IndexedDB queue + SW). Arabic-first RTL,
// with English and French. No heavy deps on the base screen (the map lazy-loads later).

// ── tiny IndexedDB queue (no external lib) ─────────────────────────────────
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('nour-field', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('queue', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function qAdd(item: any) {
  const db = await openDb()
  await new Promise((res, rej) => { const t = db.transaction('queue', 'readwrite'); t.objectStore('queue').put(item); t.oncomplete = () => res(null); t.onerror = () => rej(t.error) })
}
async function qAll(): Promise<any[]> {
  const db = await openDb()
  return new Promise((res) => { const r = db.transaction('queue', 'readonly').objectStore('queue').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]) })
}
async function qDel(id: string) {
  const db = await openDb()
  await new Promise((res) => { const t = db.transaction('queue', 'readwrite'); t.objectStore('queue').delete(id); t.oncomplete = () => res(null); t.onerror = () => res(null) })
}

// Fresh GPS fix. timeoutMs is tunable so a panic can fail fast and fall back to the
// last-known fix rather than make someone in danger wait. On success the fix is cached
// (last-known) — battery-conscious: we only ever read GPS on an explicit action, never
// continuously (no watchPosition).
const LAST_GPS_KEY = 'nour-last-gps'
function cacheGps(lat: number, lon: number) {
  try { localStorage.setItem(LAST_GPS_KEY, JSON.stringify({ lat, lon, at: Date.now() })) } catch { /* storage off */ }
}
function lastKnownGps(): { lat: number; lon: number; at: number } | null {
  try {
    const raw = localStorage.getItem(LAST_GPS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return Number.isFinite(v?.lat) && Number.isFinite(v?.lon) ? v : null
  } catch { return null }
}
function getGps(timeoutMs = 8000): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => { cacheGps(p.coords.latitude, p.coords.longitude); resolve({ lat: p.coords.latitude, lon: p.coords.longitude }) },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    )
  })
}

// ── i18n (en/fr/ar) — same lightweight pattern as app/page.tsx (no library) ──
const LANG = {
  en: {
    field: 'Field', online: 'Online', offline: 'Offline — will sync', logout: 'Log out',
    server_retry: 'Couldn’t reach the server — retrying…', queued: 'queued',
    rollcall: 'ROLL CALL — TAP IF SAFE', marked_safe: 'You’re marked safe ✓',
    check_in: 'CHECK IN', checkin_sub: 'I’m safe · share my location', getting_loc: 'Getting location…',
    checked: 'Checked in', next_due: 'next due', overdue: 'OVERDUE', queued_send: 'Queued — will send when online',
    set_status: 'Set status', standby: 'Standby', deployed: 'Deployed', unavailable: 'Unavailable', status_set: 'Status set', st_offline: 'Offline',
    dispatch: 'DISPATCH', assigned: 'Assigned', en_route: 'En route', on_scene: 'On scene', done: 'Done', advance_to: 'ADVANCE TO',
    onscene_report: 'On-scene report', people_assisted: 'People assisted', services_delivered: 'Services delivered', new_hazards: 'New hazards',
    submit_report: 'Submit report', save_changes: 'Save changes', report_filed: 'On-scene report filed ✓', edit: 'Edit', report_saved: 'On-scene report saved',
    manual_loc: 'Enter location manually (no GPS)', lat: 'lat', lon: 'lon',
    panic: 'PANIC', hold: 'HOLD…', panic_sub: 'press and hold 2 seconds', keep_holding: 'keep holding to send',
    alert_sent_full: 'ALERT SENT', team_notified: 'Your team has been notified.', tap_dismiss: 'tap to dismiss',
    sending_alert: 'Sending alert…', alert_sent_msg: '🆘 Alert sent to your team', alert_queued: 'Queued — alert will send when online',
    signed_out: 'Signed out — will sync when back online', sharing_loc: 'Sharing location…',
    open_chat: 'OPEN GROUP CHAT', actions: 'Actions', map: 'Map',
  },
  fr: {
    field: 'Terrain', online: 'En ligne', offline: 'Hors ligne — synchro auto', logout: 'Déconnexion',
    server_retry: 'Serveur injoignable — nouvelle tentative…', queued: 'en attente',
    rollcall: 'APPEL — TOUCHEZ SI EN SÉCURITÉ', marked_safe: 'Vous êtes en sécurité ✓',
    check_in: 'JE SUIS SAUF', checkin_sub: 'Je suis sauf · partager ma position', getting_loc: 'Localisation…',
    checked: 'Pointé', next_due: 'prochain', overdue: 'EN RETARD', queued_send: 'En attente — envoi à la reconnexion',
    set_status: 'Définir le statut', standby: 'En attente', deployed: 'Déployé', unavailable: 'Indisponible', status_set: 'Statut défini', st_offline: 'Hors ligne',
    dispatch: 'MISSION', assigned: 'Assigné', en_route: 'En route', on_scene: 'Sur place', done: 'Terminé', advance_to: 'PASSER À',
    onscene_report: 'Rapport sur place', people_assisted: 'Personnes aidées', services_delivered: 'Services fournis', new_hazards: 'Nouveaux dangers',
    submit_report: 'Envoyer le rapport', save_changes: 'Enregistrer', report_filed: 'Rapport déposé ✓', edit: 'Modifier', report_saved: 'Rapport enregistré',
    manual_loc: 'Saisir la position manuellement (sans GPS)', lat: 'lat', lon: 'lon',
    panic: 'ALERTE', hold: 'MAINTENEZ…', panic_sub: 'maintenez 2 secondes', keep_holding: 'continuez à maintenir',
    alert_sent_full: 'ALERTE ENVOYÉE', team_notified: 'Votre équipe a été alertée.', tap_dismiss: 'touchez pour fermer',
    sending_alert: 'Envoi de l’alerte…', alert_sent_msg: '🆘 Alerte envoyée à votre équipe', alert_queued: 'En attente — alerte envoyée à la reconnexion',
    signed_out: 'Déconnecté — synchro à la reconnexion', sharing_loc: 'Partage de la position…',
    open_chat: 'OUVRIR LE GROUPE', actions: 'Actions', map: 'Carte',
  },
  ar: {
    field: 'الميدان', online: 'متصل', offline: 'غير متصل — ستتم المزامنة', logout: 'خروج',
    server_retry: 'تعذّر الوصول إلى الخادم — إعادة المحاولة…', queued: 'في الانتظار',
    rollcall: 'نداء التفقّد — اضغط إن كنت بأمان', marked_safe: 'تم تسجيلك بأمان ✓',
    check_in: 'أنا بأمان', checkin_sub: 'أنا بأمان · مشاركة موقعي', getting_loc: 'جارٍ تحديد الموقع…',
    checked: 'سجّلت', next_due: 'التالي', overdue: 'متأخر', queued_send: 'في الانتظار — سيُرسل عند الاتصال',
    set_status: 'تعيين الحالة', standby: 'جاهز', deployed: 'منتشر', unavailable: 'غير متاح', status_set: 'تم تعيين الحالة', st_offline: 'غير متصل',
    dispatch: 'مهمة', assigned: 'مُكلّف', en_route: 'في الطريق', on_scene: 'في الموقع', done: 'منجز', advance_to: 'الانتقال إلى',
    onscene_report: 'تقرير الموقع', people_assisted: 'عدد المستفيدين', services_delivered: 'الخدمات المقدّمة', new_hazards: 'مخاطر جديدة',
    submit_report: 'إرسال التقرير', save_changes: 'حفظ التغييرات', report_filed: 'تم إرسال تقرير الموقع ✓', edit: 'تعديل', report_saved: 'تم حفظ التقرير',
    manual_loc: 'إدخال الموقع يدويًا (بدون GPS)', lat: 'خط العرض', lon: 'خط الطول',
    panic: 'استغاثة', hold: 'استمر بالضغط…', panic_sub: 'اضغط مع الاستمرار ثانيتين', keep_holding: 'استمر بالضغط للإرسال',
    alert_sent_full: 'تم إرسال الاستغاثة', team_notified: 'تم إخطار فريقك.', tap_dismiss: 'اضغط للإغلاق',
    sending_alert: 'جارٍ إرسال الاستغاثة…', alert_sent_msg: '🆘 تم إرسال الاستغاثة إلى فريقك', alert_queued: 'في الانتظار — ستُرسل الاستغاثة عند الاتصال',
    signed_out: 'تم تسجيل الخروج — ستتم المزامنة عند الاتصال', sharing_loc: 'جارٍ مشاركة الموقع…',
    open_chat: 'فتح مجموعة الدردشة', actions: 'الإجراءات', map: 'الخريطة',
  },
} as const
type Lang = keyof typeof LANG
type LangKey = keyof typeof LANG['en']

interface FieldState {
  team: { id: string; name: string; type: string; status: string; group_chat_url?: string | null } | null
  last_check_in: string | null
  active_roll_call: { id: string; message: string | null; answered: boolean } | null
  checkin_window_minutes?: number
}

export default function NgoFieldPage() {
  const [lang, setLang] = useState<Lang>('ar')
  const t = useCallback((k: LangKey): string => LANG[lang][k] ?? LANG.en[k], [lang])
  const isRtl = lang === 'ar'

  const [online, setOnline] = useState(true)
  const [state, setState] = useState<FieldState | null>(null)
  const [queued, setQueued] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [manLat, setManLat] = useState('')
  const [manLon, setManLon] = useState('')
  const [holding, setHolding] = useState(false)
  const [flash, setFlash] = useState(false)
  const [checkinQueued, setCheckinQueued] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null) // optimistic chip highlight
  const holdTimer = useRef<any>(null)
  const audioRef = useRef<any>(null)
  const [dispatch, setDispatch] = useState<any>(null)
  const [report, setReport] = useState({ people: '', services: '', hazards: '' })
  const [reportSent, setReportSent] = useState(false)
  const [editingReport, setEditingReport] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  const [who, setWho] = useState<{ name: string; org: string | null } | null>(null)
  const [nowTick, setNowTick] = useState(0) // forces the "next due" line to refresh
  const [tab, setTab] = useState<'actions' | 'map'>('actions')
  const [mapStatus, setMapStatus] = useState<'idle' | 'loading' | 'ready' | 'offline'>('idle')
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)

  // Language: reuse the site-wide fl_lang; default Arabic (Arabic-first).
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fl_lang')
      if (saved === 'en' || saved === 'fr' || saved === 'ar') setLang(saved)
    } catch { /* storage off */ }
  }, [])
  const changeLang = (l: Lang) => { setLang(l); try { localStorage.setItem('fl_lang', l) } catch { /* */ } }

  // Send now, or queue if offline / on failure. Method defaults to POST.
  const send = useCallback(async (url: string, body: any, label: string, method = 'POST'): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (res.ok) return true
      } catch { /* fall through to queue */ }
    }
    const id = `${url}|${label}|${typeof performance !== 'undefined' ? performance.now() : ''}|${Math.round(Math.random() * 1e9)}`
    await qAdd({ id, url, body, label, method })
    refreshQueueCount()
    return false
  }, [])
  const sendPut = useCallback((url: string, body: any, label: string) => send(url, body, label, 'PUT'), [send])

  const refreshQueueCount = useCallback(() => { qAll().then((q) => setQueued(q.length)).catch(() => {}) }, [])

  const flushQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const items = await qAll()
    for (const it of items) {
      try {
        const res = await fetch(it.url, { method: it.method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it.body) })
        if (res.ok) await qDel(it.id)
      } catch { /* stays queued */ }
    }
    refreshQueueCount()
  }, [refreshQueueCount])

  const loadState = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/safety/field')
      if (r.ok) { setState(await r.json()); setRefreshError(false) }
      else setRefreshError(true)
    } catch { setRefreshError(true) /* offline — last state kept */ }
  }, [])

  const loadWho = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/auth/check')
      if (r.status === 401) { window.location.replace('/ngo/login'); return }
      if (r.ok) { const d = await r.json(); setWho({ name: d?.name ?? 'Signed in', org: d?.org_name ?? null }) }
    } catch { /* offline */ }
  }, [])

  // Offline-graceful logout: clear server-side if online; otherwise queue the
  // logout and sign out locally, flushing when back online.
  async function logout() {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try { await fetch('/api/ngo/auth/logout', { method: 'POST' }); window.location.replace('/ngo/login'); return } catch { /* fall through */ }
    }
    await qAdd({ id: `logout|${typeof performance !== 'undefined' ? performance.now() : ''}|${Math.round(Math.random() * 1e9)}`, url: '/api/ngo/auth/logout', body: {}, label: 'logout', method: 'POST' })
    setMsg(t('signed_out'))
    setTimeout(() => window.location.replace('/ngo/login'), 700)
  }

  const loadDispatch = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/dispatch/mine')
      if (r.ok) { const d = (await r.json()).dispatch; setDispatch(d); if (d?.has_report) setReportSent(true) }
    } catch { /* offline */ }
  }, [])

  // Boot: register SW, set online listeners, first load, polling.
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/ngo-sw.js', { scope: '/ngo/field' }).catch(() => {})
    const setOn = () => { setOnline(true); flushQueue(); loadState(); loadDispatch() }
    const setOff = () => setOnline(false)
    const onVisible = () => { if (document.visibilityState === 'visible') { loadState(); loadDispatch(); flushQueue() } }
    setOnline(navigator.onLine)
    window.addEventListener('online', setOn)
    window.addEventListener('offline', setOff)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    refreshQueueCount(); flushQueue(); loadState(); loadDispatch(); loadWho()
    // 5s — the roll-call "tap if safe" prompt must surface fast; also refreshes "next due".
    const id = setInterval(() => { loadState(); flushQueue(); loadDispatch(); setNowTick((n) => n + 1) }, 5000)
    return () => {
      window.removeEventListener('online', setOn); window.removeEventListener('offline', setOff)
      window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [flushQueue, loadState, loadDispatch, loadWho, refreshQueueCount])

  async function resolveCoords(): Promise<{ lat: number | null; lon: number | null }> {
    if (manual) {
      const lat = parseFloat(manLat), lon = parseFloat(manLon)
      return { lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null }
    }
    const g = await getGps()
    return { lat: g?.lat ?? null, lon: g?.lon ?? null }
  }

  // Panic location: never block the alert on a GPS fix. If the worker explicitly set a
  // manual location, honour it; otherwise try a FAST fresh fix (~4s) and fall back to the
  // last-known cached fix, then to nothing. The panic fires regardless of the outcome.
  async function resolvePanicCoords(): Promise<{ lat: number | null; lon: number | null }> {
    if (manual) {
      const lat = parseFloat(manLat), lon = parseFloat(manLon)
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon }
    }
    const fresh = await getGps(4000)
    if (fresh) return fresh
    const last = lastKnownGps()
    return last ? { lat: last.lat, lon: last.lon } : { lat: null, lon: null }
  }

  // Lazy map: Mapbox GL loads ONLY when the Map tab is opened, so the base screen stays
  // light for 2G. Shows the worker's own position + their assignment pin. Offline (or if
  // the library can't load) it degrades to a coordinates + "open in phone maps" panel.
  function initMap() {
    if (!mapEl.current || mapRef.current || !window.mapboxgl) return
    const own = lastKnownGps()
    const center: [number, number] = own ? [own.lon, own.lat]
      : (dispatch?.lon != null && dispatch?.lat != null) ? [dispatch.lon, dispatch.lat]
      : [35.86, 33.87] // Lebanon
    const m = new window.mapboxgl.Map({
      container: mapEl.current, style: 'mapbox://styles/mapbox/dark-v11',
      center, zoom: own || dispatch?.lon != null ? 13 : 8, attributionControl: false,
    })
    mapRef.current = m
    m.on('load', () => {
      if (own) new window.mapboxgl.Marker({ color: '#58a6ff' }).setLngLat([own.lon, own.lat]).addTo(m)
      if (dispatch?.lat != null && dispatch?.lon != null) new window.mapboxgl.Marker({ color: '#da3633' }).setLngLat([dispatch.lon, dispatch.lat]).addTo(m)
      setMapStatus('ready')
    })
  }
  useEffect(() => {
    if (tab !== 'map') return
    if (mapRef.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine && !window.mapboxgl) { setMapStatus('offline'); return }
    if (window.mapboxgl) { setMapStatus('loading'); initMap(); return }
    setMapStatus('loading')
    if (!document.getElementById('mbx-css')) {
      const l = document.createElement('link'); l.id = 'mbx-css'; l.rel = 'stylesheet'
      l.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css'; document.head.appendChild(l)
    }
    const s = document.createElement('script')
    s.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js'
    s.onload = () => { window.mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN; initMap() }
    s.onerror = () => setMapStatus('offline')
    document.body.appendChild(s)
    return () => { /* keep the map instance across tab toggles */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dispatch])
  // Tear the map down on unmount.
  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }, [])

  async function doCheckIn() {
    setMsg(t('getting_loc'))
    const { lat, lon } = await resolveCoords()
    const sent = await send('/api/ngo/safety/check-in', { lat, lon }, 'check-in')
    setCheckinQueued(!sent)
    setMsg(sent ? `${t('checked')} ✓` : t('queued_send'))
    loadState()
  }

  // Short two-tone alarm via Web Audio (no asset needed). Triggered by the user's
  // press, so the audio context is allowed to start.
  function playAlarm() {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      const ctx = audioRef.current ?? new Ctx()
      audioRef.current = ctx
      if (ctx.state === 'suspended') ctx.resume()
      const beep = (at: number, freq: number) => {
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.type = 'square'; o.frequency.value = freq
        o.connect(g); g.connect(ctx.destination)
        const tm = ctx.currentTime + at
        g.gain.setValueAtTime(0.0001, tm)
        g.gain.exponentialRampToValueAtTime(0.3, tm + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, tm + 0.28)
        o.start(tm); o.stop(tm + 0.3)
      }
      beep(0, 880); beep(0.32, 1175); beep(0.64, 880)
    } catch { /* audio not available — visual flash still fires */ }
  }

  async function doPanic() {
    setMsg(t('sending_alert'))
    // Fresh-if-possible, else last-known; the press is the complete action — GPS never blocks it.
    const { lat, lon } = await resolvePanicCoords()
    const sent = await send('/api/ngo/safety/panic', { lat, lon }, 'panic')
    playAlarm()
    setFlash(true)
    setTimeout(() => setFlash(false), 4000)
    setMsg(sent ? t('alert_sent_msg') : t('alert_queued'))
  }

  async function setStatus(status: string) {
    setPendingStatus(status) // highlight the chosen chip instantly — confirms even offline
    const sent = await send('/api/ngo/safety/status', { status }, 'status')
    setMsg(sent ? `${t('status_set')}: ${t(status as LangKey)} ✓` : t('queued_send'))
    loadState()
  }
  // Clear the optimistic highlight once the server confirms the new status.
  useEffect(() => { if (pendingStatus && state?.team?.status === pendingStatus) setPendingStatus(null) }, [state, pendingStatus])

  async function respondRollCall() {
    if (!state?.active_roll_call) return
    setMsg(t('sharing_loc'))
    const { lat, lon } = await resolveCoords()
    const sent = await send('/api/ngo/safety/roll-call/respond', { roll_call_id: state.active_roll_call.id, lat, lon }, 'roll-call')
    setMsg(sent ? t('marked_safe') : t('queued_send'))
    loadState()
  }

  const NEXT_STATUS: Record<string, string> = { assigned: 'en_route', en_route: 'on_scene', on_scene: 'done' }

  async function advanceDispatch() {
    if (!dispatch) return
    const next = NEXT_STATUS[dispatch.status]
    const sent = await send(`/api/ngo/dispatch/${dispatch.id}/advance`, {}, 'advance')
    setMsg(sent ? `${t(next as LangKey)}` : t('queued_send'))
    loadDispatch()
  }
  async function submitReport() {
    if (!dispatch) return
    // PUT updates the single report (creates it if none) so edits don't duplicate.
    const sent = await sendPut(`/api/ngo/dispatch/${dispatch.id}/report`, {
      people_assisted: report.people === '' ? null : Number(report.people),
      services: report.services || null,
      new_hazards: report.hazards || null,
    }, 'report')
    setReportSent(true); setEditingReport(false)
    setMsg(sent ? t('report_saved') : t('queued_send'))
  }
  function startEditReport() {
    const r = dispatch?.report
    setReport({ people: r?.people_assisted != null ? String(r.people_assisted) : '', services: r?.services ?? '', hazards: r?.new_hazards ?? '' })
    setEditingReport(true)
  }

  // Panic press-and-hold (2s) to avoid misfire.
  const startHold = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.() // stop text selection / drag on press
    setHolding(true)
    holdTimer.current = setTimeout(() => { setHolding(false); doPanic() }, 2000)
  }
  const cancelHold = () => { setHolding(false); if (holdTimer.current) clearTimeout(holdTimer.current) }

  // Relative minutes/hours/days label (digits stay Western — readable in every language here).
  function ago(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 1) return '<1m'
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
  }
  function hhmm(d: Date): string { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

  // The persistent CHECK-IN subtitle + tone, derived from the last check-in + cadence.
  function checkInInfo(): { sub: string; overdue: boolean } {
    void nowTick // re-evaluate on the 5s tick
    if (checkinQueued) return { sub: t('queued_send'), overdue: false }
    const last = state?.last_check_in
    if (!last) return { sub: t('checkin_sub'), overdue: false }
    const windowMin = state?.checkin_window_minutes ?? 240
    const due = new Date(new Date(last).getTime() + windowMin * 60000)
    const overdue = Date.now() > due.getTime()
    const sub = overdue
      ? `✓ ${ago(last)} · ${t('overdue')}`
      : `✓ ${ago(last)} · ${t('next_due')} ${hhmm(due)}`
    return { sub, overdue }
  }

  const rc = state?.active_roll_call
  const showRc = rc && !rc.answered
  const ci = checkInInfo()
  const dispStatusKey = (s: string): LangKey => (['assigned', 'en_route', 'on_scene', 'done'].includes(s) ? (s as LangKey) : 'assigned')

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ ...wrap, paddingBottom: 'calc(150px + env(safe-area-inset-bottom))' }}>
      <style>{`@keyframes nourHoldFill{from{width:0}to{width:100%}}@keyframes nourFlash{0%,100%{background:rgba(248,81,73,0.92)}50%{background:rgba(248,81,73,0.55)}}`}</style>

      {/* Full-screen confirmation flash after a panic is sent */}
      {flash && (
        <div style={flashOverlay} onClick={() => setFlash(false)}>
          <div style={{ fontSize: 32, fontWeight: 800 }}>🆘 {t('alert_sent_full')}</div>
          <div style={{ fontSize: 16, marginTop: 8, opacity: 0.95 }}>{t('team_notified')}</div>
          <div style={{ fontSize: 13, marginTop: 18, opacity: 0.8 }}>{t('tap_dismiss')}</div>
        </div>
      )}

      {/* ── Thin sticky status bar — identity, connection, time-since-check-in, lang, logout ── */}
      <div style={statusBar}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {who?.name ?? 'NOUR'} <span style={{ color: '#3fb950', fontWeight: 600 }}>· {t('field')}</span>
            </div>
            {state?.team && (
              <div style={{ fontSize: 12, color: '#8b949e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {state.team.name} · {state.team.type} · {state.team.status === 'offline' ? t('st_offline') : (t(state.team.status as LangKey) ?? state.team.status)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ display: 'flex', border: '1px solid #21262d', borderRadius: 8, overflow: 'hidden' }}>
              {(['en', 'fr', 'ar'] as Lang[]).map((l) => (
                <button key={l} type="button" onClick={() => changeLang(l)} style={langBtn(lang === l)}>{l === 'ar' ? 'ع' : l.toUpperCase()}</button>
              ))}
            </div>
            <button type="button" onClick={logout} style={logoutBtn}>{t('logout')}</button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ ...connChip, background: online ? 'rgba(63,185,80,0.15)' : 'rgba(210,153,34,0.18)', color: online ? '#3fb950' : '#d29922', border: `1px solid ${online ? 'rgba(63,185,80,0.4)' : 'rgba(210,153,34,0.5)'}` }}>
            <span style={{ fontSize: 14 }}>●</span> {online ? t('online') : t('offline')}{queued > 0 ? ` · ${queued} ${t('queued')}` : ''}
          </span>
          {state?.last_check_in && (
            <span style={{ fontSize: 13, fontWeight: 600, color: ci.overdue ? '#f85149' : '#8b949e' }}>
              ✓ {ago(state.last_check_in)}
            </span>
          )}
        </div>
        {online && refreshError && (
          <div style={{ fontSize: 12, color: '#d29922', marginTop: 6 }}>{t('server_retry')}</div>
        )}
      </div>

      {/* Prominent offline banner — offline is the normal state, not an error */}
      {!online && <div style={offlineBanner}>● {t('offline')}{queued > 0 ? ` · ${queued} ${t('queued')}` : ''}</div>}

      {/* Actions | Map tab switch — actions are the default; the map is secondary and
          lazy-loaded. Panic stays fixed below regardless of the active tab. */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setTab('actions')} style={tabBtn(tab === 'actions')}>{t('actions')}</button>
        <button type="button" onClick={() => setTab('map')} style={tabBtn(tab === 'map')}>🗺 {t('map')}</button>
      </div>

      {tab === 'actions' && (<>
      {/* Roll-call prompt */}
      {showRc && (
        <button type="button" onClick={respondRollCall} style={rollCallBtn}>
          🟢 {t('rollcall')}
          {rc?.message ? <div style={{ fontSize: 14, fontWeight: 400, marginTop: 6 }}>{rc.message}</div> : null}
        </button>
      )}
      {rc && rc.answered && <div style={{ textAlign: 'center', color: '#3fb950', fontSize: 15, fontWeight: 600 }}>{t('marked_safe')}</div>}

      {/* CHECK IN — the largest control on the screen */}
      <button type="button" onClick={doCheckIn} style={checkInBtn}>
        <span style={{ fontSize: 32, fontWeight: 800 }}>{t('check_in')}</span>
        <span style={{ fontSize: 15, fontWeight: 600, opacity: 0.95, color: ci.overdue ? '#ffd7d5' : '#fff' }}>{ci.sub}</span>
      </button>

      {/* STATUS */}
      <div>
        <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 6 }}>{t('set_status')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['standby', 'deployed', 'unavailable'].map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} style={statusBtn((pendingStatus ?? state?.team?.status) === s)}>{t(s as LangKey)}</button>
          ))}
        </div>
      </div>

      {/* Active dispatch */}
      {dispatch && (
        <div style={dispatchCard}>
          <div style={{ fontSize: 12, color: '#d29922', fontWeight: 700 }}>
            {t('dispatch')} · {t(dispStatusKey(dispatch.status))}{dispatch.severity ? ` · ${String(dispatch.severity).toUpperCase()}` : ''}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{dispatch.title ?? (dispatch.hazard ? `${dispatch.hazard} — ` : '') + (dispatch.location_name ?? '')}</div>
          {dispatch.title && (dispatch.hazard || dispatch.location_name) && (
            <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>{[dispatch.hazard, dispatch.location_name].filter(Boolean).join(' · ')}</div>
          )}
          {dispatch.description && <div style={{ fontSize: 14, color: '#e6edf3', marginTop: 6 }}>{dispatch.description}</div>}
          {dispatch.note && <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>{dispatch.note}</div>}
          {dispatch.map_link && <a href={dispatch.map_link} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: '#58a6ff', display: 'inline-block', marginTop: 6 }}>{t('map')} ↗</a>}
          {NEXT_STATUS[dispatch.status] && (
            <button type="button" onClick={advanceDispatch} style={{ ...checkInBtn, height: 64, background: '#1f6feb', borderColor: '#58a6ff', marginTop: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{t('advance_to')} {t(NEXT_STATUS[dispatch.status] as LangKey).toUpperCase()}</span>
            </button>
          )}
          {/* On-scene report (3 fields) — fileable/editable once on scene or done */}
          {['on_scene', 'done'].includes(dispatch.status) && (!reportSent || editingReport) && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, color: '#8b949e' }}>{t('onscene_report')}</div>
              <input style={field} inputMode="numeric" placeholder={t('people_assisted')} value={report.people} onChange={(e) => setReport({ ...report, people: e.target.value })} />
              <input style={field} placeholder={t('services_delivered')} value={report.services} onChange={(e) => setReport({ ...report, services: e.target.value })} />
              <input style={field} placeholder={t('new_hazards')} value={report.hazards} onChange={(e) => setReport({ ...report, hazards: e.target.value })} />
              <button type="button" onClick={submitReport} style={{ ...statusBtn(false), height: 48 }}>{editingReport ? t('save_changes') : t('submit_report')}</button>
            </div>
          )}
          {reportSent && !editingReport && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 13, color: '#3fb950' }}>{t('report_filed')}</span>
              <button type="button" onClick={startEditReport} style={{ ...statusBtn(false), height: 34, flex: '0 0 auto', padding: '0 14px' }}>{t('edit')}</button>
            </div>
          )}
        </div>
      )}

      {/* Group chat — one tap to the team's Signal/WhatsApp/Telegram group */}
      {state?.team?.group_chat_url && (
        <a href={state.team.group_chat_url} target="_blank" rel="noreferrer" style={groupChatBtn}>
          💬 {t('open_chat')}
        </a>
      )}

      {/* GPS source toggle + manual entry */}
      <div style={{ fontSize: 13, color: '#8b949e' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} style={{ width: 20, height: 20 }} />
          {t('manual_loc')}
        </label>
        {manual && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input style={field} inputMode="decimal" placeholder={t('lat')} value={manLat} onChange={(e) => setManLat(e.target.value)} />
            <input style={field} inputMode="decimal" placeholder={t('lon')} value={manLon} onChange={(e) => setManLon(e.target.value)} />
          </div>
        )}
      </div>

      {msg && <div style={msgBox}>{msg}</div>}
      </>)}

      {/* Map tab — own position + assignment; lazy Mapbox, offline-graceful */}
      {tab === 'map' && (
        <div style={{ position: 'relative' }}>
          <div ref={mapEl} style={mapBox} />
          {mapStatus !== 'ready' && (
            <div style={mapOverlay}>
              {mapStatus === 'loading' && <div style={{ color: '#8b949e', fontSize: 14 }}>{t('map')}…</div>}
              {mapStatus === 'offline' && (() => {
                const own = lastKnownGps()
                const ownLink = own ? `https://www.google.com/maps?q=${own.lat},${own.lon}` : null
                return (
                  <>
                    <div style={{ color: '#d29922', fontSize: 15, fontWeight: 700 }}>● {t('offline')}</div>
                    {own && <div style={{ color: '#c9d1d9', fontSize: 15 }}>{own.lat.toFixed(4)}, {own.lon.toFixed(4)}</div>}
                    {ownLink && <a href={ownLink} target="_blank" rel="noreferrer" style={{ ...groupChatBtn, maxWidth: 300 }}>🧭 {t('map')} ↗</a>}
                    {dispatch?.map_link && <a href={dispatch.map_link} target="_blank" rel="noreferrer" style={{ ...groupChatBtn, maxWidth: 300, color: '#58a6ff', borderColor: 'rgba(88,166,255,0.45)', background: 'rgba(88,166,255,0.12)' }}>{t('dispatch')} ↗</a>}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Fixed PANIC bar — always visible, hard to miss, never scrolls away. */}
      <div style={panicBar}>
        <button
          type="button"
          onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold}
          onTouchStart={startHold} onTouchEnd={cancelHold} onTouchCancel={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
          style={{ ...checkInBtn, maxWidth: 480, height: 112, position: 'relative', overflow: 'hidden', pointerEvents: 'auto', background: holding ? '#b62324' : '#da3633', borderColor: '#f85149', boxShadow: '0 -2px 14px rgba(0,0,0,0.55)' }}
        >
          <span style={{ fontSize: 30, fontWeight: 800 }}>{holding ? t('hold') : `🆘 ${t('panic')}`}</span>
          <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.92 }}>{holding ? t('keep_holding') : t('panic_sub')}</span>
          {/* Progress bar fills over the 2s hold. */}
          {holding && (
            <div style={{ position: 'absolute', insetInlineStart: 0, bottom: 0, height: 10, background: 'rgba(255,255,255,0.9)', animation: 'nourHoldFill 2s linear forwards' }} />
          )}
        </button>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }
// Sticky status bar — edge-to-edge (negative margins cancel the wrap padding).
const statusBar: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 20, background: 'rgba(13,17,23,0.97)', borderBottom: '1px solid #21262d', padding: '10px 16px', margin: '-16px -16px 0' }
const connChip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 999 }
function langBtn(active: boolean): React.CSSProperties {
  return { minWidth: 34, height: 34, padding: '0 8px', border: 'none', background: active ? '#1f6feb' : 'transparent', color: active ? '#fff' : '#8b949e', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui' }
}
const logoutBtn: React.CSSProperties = { height: 34, padding: '0 12px', background: 'rgba(255,255,255,0.05)', color: '#8b949e', border: '1px solid #21262d', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
// CHECK-IN is the dominant element: tall, high-contrast green, big text.
const checkInBtn: React.CSSProperties = { width: '100%', minHeight: 150, border: '1px solid #2ea043', borderRadius: 16, color: '#fff', background: '#238636', cursor: 'pointer', fontFamily: 'system-ui', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }
// Fixed footer holding the PANIC button. Centered to the page width (max 480) and
// padded for the device home-bar so the control is always reachable without scrolling.
const panicBar: React.CSSProperties = {
  position: 'fixed', insetInlineStart: 0, insetInlineEnd: 0, bottom: 0, zIndex: 40,
  display: 'flex', justifyContent: 'center',
  padding: '10px 16px calc(10px + env(safe-area-inset-bottom))',
  background: 'linear-gradient(to top, #0d1117 70%, rgba(13,17,23,0))',
  pointerEvents: 'none',
}
const flashOverlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#fff', fontFamily: 'system-ui', animation: 'nourFlash 0.7s ease-in-out infinite', cursor: 'pointer' }
const rollCallBtn: React.CSSProperties = { width: '100%', padding: '18px', background: '#1f6feb', border: '1px solid #58a6ff', color: '#fff', borderRadius: 14, fontSize: 19, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui' }
function statusBtn(active: boolean): React.CSSProperties {
  return { flex: 1, height: 56, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(88,166,255,0.18)' : '#161b22', border: active ? '2px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#c9d1d9' }
}
const field: React.CSSProperties = { flex: 1, height: 48, padding: '0 12px', boxSizing: 'border-box', background: '#161b22', border: '1px solid #21262d', borderRadius: 8, color: '#e6edf3', fontSize: 15, outline: 'none', fontFamily: 'system-ui' }
const msgBox: React.CSSProperties = { textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#e6edf3', background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '12px' }
const dispatchCard: React.CSSProperties = { background: '#161b22', border: '1px solid #d29922', borderRadius: 12, padding: 14 }
const groupChatBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 56, background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.45)', color: '#3fb950', borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: 'none', fontFamily: 'system-ui', boxSizing: 'border-box' }
const offlineBanner: React.CSSProperties = { background: 'rgba(210,153,34,0.15)', border: '1px solid rgba(210,153,34,0.5)', color: '#d29922', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontWeight: 700, textAlign: 'center' }
function tabBtn(active: boolean): React.CSSProperties {
  return { flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(88,166,255,0.18)' : '#161b22', border: active ? '2px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }
}
const mapBox: React.CSSProperties = { width: '100%', height: 'calc(100dvh - 300px)', minHeight: 300, borderRadius: 12, overflow: 'hidden', background: '#161b22', border: '1px solid #21262d' }
const mapOverlay: React.CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, textAlign: 'center' }
