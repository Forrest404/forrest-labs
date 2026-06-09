'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

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
async function qClear() {
  try {
    const db = await openDb()
    await new Promise((res) => { const t = db.transaction('queue', 'readwrite'); t.objectStore('queue').clear(); t.oncomplete = () => res(null); t.onerror = () => res(null) })
  } catch { /* nothing to clear */ }
}

// Device-capture defence (finding H3): wipe everything sensitive this view caches
// locally — the last-known GPS fix and the offline queue (which holds check-in/panic
// payloads with coordinates). Called on logout so a seized phone retains no location
// data. The httpOnly session cookie can only be cleared server-side (online logout).
async function wipeLocalSensitive() {
  try { localStorage.removeItem(LAST_GPS_KEY) } catch { /* storage off */ }
  try { localStorage.removeItem(CHATS_CACHE_KEY) } catch { /* storage off */ }
  await qClear()
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
    checked: 'Checked in', next_due: 'next due', overdue: 'OVERDUE', due_in: 'due in', never_checked_in: 'Not checked in yet — tap to check in', no_checkin: 'no check-in', queued_send: 'Queued — will send when online',
    set_status: 'Set status', standby: 'Standby', deployed: 'Deployed', unavailable: 'Unavailable', status_set: 'Status set', st_offline: 'Offline',
    dispatch: 'DISPATCH', assigned: 'Assigned', en_route: 'En route', on_scene: 'On scene', done: 'Done', advance_to: 'ADVANCE TO',
    onscene_report: 'On-scene report', people_assisted: 'People assisted', services_delivered: 'Services delivered', new_hazards: 'New hazards',
    submit_report: 'Submit report', save_changes: 'Save changes', report_filed: 'On-scene report filed ✓', edit: 'Edit', report_saved: 'On-scene report saved',
    manual_loc: 'Enter location manually (no GPS)', lat: 'lat', lon: 'lon',
    panic: 'PANIC', hold: 'HOLD…', panic_sub: 'press and hold 2 seconds', keep_holding: 'keep holding to send',
    alert_sent_full: 'ALERT SENT', team_notified: 'Your team has been notified.', tap_dismiss: 'tap to dismiss',
    sending_alert: 'Sending alert…', alert_sent_msg: '🆘 Alert sent to your team', alert_sent_silent: '✓ Alert sent (silent)', alert_queued: 'Queued — alert will send when online',
    signed_out: 'Signed out — will sync when back online', sharing_loc: 'Sharing location…',
    open_chat: 'OPEN GROUP CHAT', actions: 'Actions', map: 'Map',
    chats: 'Chats', no_chats: 'No group chats shared with you yet.', chats_trust: 'Opens an external app NOUR doesn’t control. Only join groups you trust.', open: 'Open', team_chat: 'Team', org_chat: 'Organisation', account: 'Account', logged_in_as: 'Logged in as', your_team: 'Your team', team_lead: 'Lead', no_team: 'Not assigned to a team', not_you: 'Not you? Log out', setup_alerts: 'Set up alerts', setup_alerts_sub: 'Get panic & dispatch notifications on your phone', already_setup: 'Already set up — hide', on_duty: 'On duty', off_duty: 'Off duty', off_duty_note: 'Off duty — you get no notifications at all (not even panic or roll call) until you go back on duty. Your own panic button still alerts your team.', off_duty_banner: '🌙 YOU ARE OFF DUTY — no alerts reach you, not even panic or roll call. Your panic button still alerts your team.', broadcasts: 'Broadcasts', no_broadcasts: 'No broadcasts yet.', urgent: 'Urgent', acknowledge: 'Acknowledge', acknowledged: 'Acknowledged',
    silent_mode: 'Silent', alert_active: 'Alert active', help_seen: 'Help has seen this',
    choose_reason: 'What’s happening? (optional)', cancel_false_alarm: 'Cancel — false alarm', confirm_cancel: 'Tap again to confirm', no_gps: 'no location', gps_hint: 'Location unavailable — enable location to share where you are.',
    locked_note: 'Locked — only a responder can resolve this now', cancelled: 'Alert cancelled',
    r_injured: 'Injured', r_under_fire: 'Under fire', r_detained: 'Detained', r_vehicle: 'Vehicle', r_medical: 'Medical', r_moving: 'Unsafe — moving',
  },
  fr: {
    field: 'Terrain', online: 'En ligne', offline: 'Hors ligne — synchro auto', logout: 'Déconnexion',
    server_retry: 'Serveur injoignable — nouvelle tentative…', queued: 'en attente',
    rollcall: 'APPEL — TOUCHEZ SI EN SÉCURITÉ', marked_safe: 'Vous êtes en sécurité ✓',
    check_in: 'JE SUIS SAUF', checkin_sub: 'Je suis sauf · partager ma position', getting_loc: 'Localisation…',
    checked: 'Pointé', next_due: 'prochain', overdue: 'EN RETARD', due_in: 'dans', never_checked_in: 'Pas encore pointé — appuyez pour pointer', no_checkin: 'aucun pointage', queued_send: 'En attente — envoi à la reconnexion',
    set_status: 'Définir le statut', standby: 'En attente', deployed: 'Déployé', unavailable: 'Indisponible', status_set: 'Statut défini', st_offline: 'Hors ligne',
    dispatch: 'MISSION', assigned: 'Assigné', en_route: 'En route', on_scene: 'Sur place', done: 'Terminé', advance_to: 'PASSER À',
    onscene_report: 'Rapport sur place', people_assisted: 'Personnes aidées', services_delivered: 'Services fournis', new_hazards: 'Nouveaux dangers',
    submit_report: 'Envoyer le rapport', save_changes: 'Enregistrer', report_filed: 'Rapport déposé ✓', edit: 'Modifier', report_saved: 'Rapport enregistré',
    manual_loc: 'Saisir la position manuellement (sans GPS)', lat: 'lat', lon: 'lon',
    panic: 'ALERTE', hold: 'MAINTENEZ…', panic_sub: 'maintenez 2 secondes', keep_holding: 'continuez à maintenir',
    alert_sent_full: 'ALERTE ENVOYÉE', team_notified: 'Votre équipe a été alertée.', tap_dismiss: 'touchez pour fermer',
    sending_alert: 'Envoi de l’alerte…', alert_sent_msg: '🆘 Alerte envoyée à votre équipe', alert_sent_silent: '✓ Alerte envoyée (silencieux)', alert_queued: 'En attente — alerte envoyée à la reconnexion',
    signed_out: 'Déconnecté — synchro à la reconnexion', sharing_loc: 'Partage de la position…',
    open_chat: 'OUVRIR LE GROUPE', actions: 'Actions', map: 'Carte',
    chats: 'Groupes', no_chats: 'Aucun groupe partagé pour l’instant.', chats_trust: 'Ouvre une app externe que NOUR ne contrôle pas. Ne rejoignez que des groupes de confiance.', open: 'Ouvrir', team_chat: 'Équipe', org_chat: 'Organisation', account: 'Compte', logged_in_as: 'Connecté en tant que', your_team: 'Votre équipe', team_lead: 'Resp.', no_team: 'Aucune équipe assignée', not_you: 'Pas vous ? Déconnexion', setup_alerts: 'Configurer les alertes', setup_alerts_sub: 'Recevoir les alertes panique et missions sur votre téléphone', already_setup: 'Déjà configuré — masquer', on_duty: 'En service', off_duty: 'Hors service', off_duty_note: 'Hors service — vous ne recevez aucune notification (ni panique ni appel) jusqu’à votre retour en service. Votre propre bouton panique alerte toujours votre équipe.', off_duty_banner: '🌙 VOUS ÊTES HORS SERVICE — aucune alerte ne vous parvient, ni panique ni appel. Votre bouton panique alerte toujours votre équipe.', broadcasts: 'Annonces', no_broadcasts: 'Aucune annonce pour l’instant.', urgent: 'Urgent', acknowledge: 'Accuser réception', acknowledged: 'Reçu',
    silent_mode: 'Silencieux', alert_active: 'Alerte active', help_seen: 'Les secours ont vu',
    choose_reason: 'Que se passe-t-il ? (facultatif)', cancel_false_alarm: 'Annuler — fausse alerte', confirm_cancel: 'Touchez encore pour confirmer', no_gps: 'sans position', gps_hint: 'Position indisponible — activez la localisation pour la partager.',
    locked_note: 'Verrouillé — seul un répondant peut clôturer', cancelled: 'Alerte annulée',
    r_injured: 'Blessé', r_under_fire: 'Sous le feu', r_detained: 'Détenu', r_vehicle: 'Véhicule', r_medical: 'Médical', r_moving: 'En danger — en mouvement',
  },
  ar: {
    field: 'الميدان', online: 'متصل', offline: 'غير متصل — ستتم المزامنة', logout: 'خروج',
    server_retry: 'تعذّر الوصول إلى الخادم — إعادة المحاولة…', queued: 'في الانتظار',
    rollcall: 'نداء التفقّد — اضغط إن كنت بأمان', marked_safe: 'تم تسجيلك بأمان ✓',
    check_in: 'أنا بأمان', checkin_sub: 'أنا بأمان · مشاركة موقعي', getting_loc: 'جارٍ تحديد الموقع…',
    checked: 'سجّلت', next_due: 'التالي', overdue: 'متأخر', due_in: 'خلال', never_checked_in: 'لم تسجّل بعد — اضغط للتسجيل', no_checkin: 'لا تسجيل', queued_send: 'في الانتظار — سيُرسل عند الاتصال',
    set_status: 'تعيين الحالة', standby: 'جاهز', deployed: 'منتشر', unavailable: 'غير متاح', status_set: 'تم تعيين الحالة', st_offline: 'غير متصل',
    dispatch: 'مهمة', assigned: 'مُكلّف', en_route: 'في الطريق', on_scene: 'في الموقع', done: 'منجز', advance_to: 'الانتقال إلى',
    onscene_report: 'تقرير الموقع', people_assisted: 'عدد المستفيدين', services_delivered: 'الخدمات المقدّمة', new_hazards: 'مخاطر جديدة',
    submit_report: 'إرسال التقرير', save_changes: 'حفظ التغييرات', report_filed: 'تم إرسال تقرير الموقع ✓', edit: 'تعديل', report_saved: 'تم حفظ التقرير',
    manual_loc: 'إدخال الموقع يدويًا (بدون GPS)', lat: 'خط العرض', lon: 'خط الطول',
    panic: 'استغاثة', hold: 'استمر بالضغط…', panic_sub: 'اضغط مع الاستمرار ثانيتين', keep_holding: 'استمر بالضغط للإرسال',
    alert_sent_full: 'تم إرسال الاستغاثة', team_notified: 'تم إخطار فريقك.', tap_dismiss: 'اضغط للإغلاق',
    sending_alert: 'جارٍ إرسال الاستغاثة…', alert_sent_msg: '🆘 تم إرسال الاستغاثة إلى فريقك', alert_sent_silent: '✓ تم إرسال الاستغاثة (صامت)', alert_queued: 'في الانتظار — ستُرسل الاستغاثة عند الاتصال',
    signed_out: 'تم تسجيل الخروج — ستتم المزامنة عند الاتصال', sharing_loc: 'جارٍ مشاركة الموقع…',
    open_chat: 'فتح مجموعة الدردشة', actions: 'الإجراءات', map: 'الخريطة',
    chats: 'الدردشات', no_chats: 'لا توجد مجموعات دردشة متاحة لك بعد.', chats_trust: 'يفتح تطبيقًا خارجيًا لا تتحكم به نور. انضمّ فقط إلى المجموعات الموثوقة.', open: 'فتح', team_chat: 'الفريق', org_chat: 'المنظمة', account: 'الحساب', logged_in_as: 'تسجيل الدخول باسم', your_team: 'فريقك', team_lead: 'المسؤول', no_team: 'غير معيّن لفريق', not_you: 'لست أنت؟ تسجيل الخروج', setup_alerts: 'إعداد التنبيهات', setup_alerts_sub: 'استلام تنبيهات الاستغاثة والمهام على هاتفك', already_setup: 'تم الإعداد — إخفاء', on_duty: 'في الخدمة', off_duty: 'خارج الخدمة', off_duty_note: 'خارج الخدمة — لن تصلك أي إشعارات (ولا حتى الاستغاثة أو النداء) حتى تعود إلى الخدمة. زر الاستغاثة الخاص بك ما زال ينبّه فريقك.', off_duty_banner: '🌙 أنت خارج الخدمة — لا تصلك أي تنبيهات، ولا حتى الاستغاثة أو النداء. زر الاستغاثة ما زال ينبّه فريقك.', broadcasts: 'الإعلانات', no_broadcasts: 'لا توجد إعلانات بعد.', urgent: 'عاجل', acknowledge: 'تأكيد الاستلام', acknowledged: 'تم الاستلام',
    silent_mode: 'صامت', alert_active: 'الاستغاثة نشطة', help_seen: 'شاهد المنقذون التنبيه',
    choose_reason: 'ماذا يحدث؟ (اختياري)', cancel_false_alarm: 'إلغاء — إنذار خاطئ', confirm_cancel: 'اضغط مرة أخرى للتأكيد', no_gps: 'بدون موقع', gps_hint: 'الموقع غير متاح — فعِّل تحديد الموقع لمشاركته.',
    locked_note: 'مقفل — لا يمكن إنهاؤه إلا من قبل المنقذ', cancelled: 'تم إلغاء الاستغاثة',
    r_injured: 'مصاب', r_under_fire: 'تحت إطلاق نار', r_detained: 'محتجز', r_vehicle: 'مركبة', r_medical: 'طبي', r_moving: 'غير آمن — يتحرك',
  },
} as const
type Lang = keyof typeof LANG
type LangKey = keyof typeof LANG['en']

interface ActivePanic { id: string; created_at: string; silent: boolean; reason: string | null; acknowledged: boolean }
interface FieldState {
  team: { id: string; name: string; type: string; status: string; leader_name?: string | null; group_chat_url?: string | null } | null
  last_check_in: string | null
  active_roll_call: { id: string; message: string | null; answered: boolean } | null
  checkin_window_minutes?: number
  active_panic?: ActivePanic | null
}
const REASONS = ['injured', 'under_fire', 'detained', 'vehicle', 'medical', 'moving'] as const
const CANCEL_WINDOW_S = 10

// Group chats the operator can see (org-scope + their own team), as returned by
// /api/ngo/chat. Cached locally so they're available offline in the field.
interface ChatLink { id: string; label: string; platform: string; url: string; scope: 'org' | 'team'; team_name: string | null; description: string | null }
const CHATS_CACHE_KEY = 'nour-chats'
function chatIcon(p: string): string {
  switch (p) { case 'signal': return '🔵'; case 'whatsapp': return '🟢'; case 'telegram': return '🔷'; default: return '💬' }
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
  const [safeFlash, setSafeFlash] = useState(false) // brief green "marked safe ✓" after a roll-call answer
  const [checkinQueued, setCheckinQueued] = useState(false)
  const [noGps, setNoGps] = useState(false) // last located action got no coordinates (denied / no fix)
  const [cancelArmed, setCancelArmed] = useState(false) // two-tap guard on panic-cancel
  const cancelArmTimer = useRef<any>(null)
  // Per-action busy flags — every async action disables its button + shows a visual change
  // the instant it's tapped, so on a slow/2G link nobody thinks "nothing happened" and taps
  // again (which had let people double-advance a dispatch).
  const [checkingIn, setCheckingIn] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [rollBusy, setRollBusy] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null) // optimistic chip highlight
  const [silent, setSilent] = useState(false) // pre-arm silent mode (no sound/flash/feedback)
  const holdTimer = useRef<any>(null)
  const audioRef = useRef<any>(null)
  const [dispatch, setDispatch] = useState<any>(null)
  const [report, setReport] = useState({ people: '', services: '', hazards: '' })
  const [reportSent, setReportSent] = useState(false)
  const [editingReport, setEditingReport] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  const [who, setWho] = useState<{ name: string; org: string | null } | null>(null)
  const [nowTick, setNowTick] = useState(0) // forces the "next due" line to refresh
  const [tab, setTab] = useState<'actions' | 'map' | 'chats' | 'broadcasts'>('actions')
  const [mapStatus, setMapStatus] = useState<'idle' | 'loading' | 'ready' | 'offline'>('idle')
  const [chatLinks, setChatLinks] = useState<ChatLink[]>([])
  const [offDuty, setOffDuty] = useState(false)
  const [offDutyBusy, setOffDutyBusy] = useState(false)
  const [notifSetupDone, setNotifSetupDone] = useState(true) // assume done until /me says otherwise (avoids a flash)
  const [broadcasts, setBroadcasts] = useState<{ id: string; body: string; urgency: string; created_at: string; sender_name: string; acknowledged_at: string | null }[]>([])
  const [ackBusy, setAckBusy] = useState<string | null>(null)
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)

  // Broadcasts addressed to this worker (read-only; can acknowledge urgent ones). Fetching
  // marks them delivered server-side. Refresh on mount and whenever the tab is opened.
  const loadBroadcasts = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/broadcasts', { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setBroadcasts(d.broadcasts ?? []) }
    } catch { /* offline — keep what we have */ }
  }, [])
  useEffect(() => { loadBroadcasts() }, [loadBroadcasts])
  useEffect(() => { if (tab === 'broadcasts') loadBroadcasts() }, [tab, loadBroadcasts])
  const acknowledge = async (id: string) => {
    setAckBusy(id)
    try {
      const r = await fetch(`/api/ngo/broadcasts/${id}/acknowledge`, { method: 'POST' })
      if (r.ok) setBroadcasts((bs) => bs.map((b) => (b.id === id ? { ...b, acknowledged_at: new Date().toISOString() } : b)))
    } catch { /* ignore */ } finally { setAckBusy(null) }
  }
  const unackedUrgent = broadcasts.filter((b) => b.urgency === 'urgent' && !b.acknowledged_at).length

  // Own availability (off-duty) + whether push setup is done (hides the one-time nudge).
  // While off duty the operator gets NO notifications at all and isn't flagged for missed
  // check-ins; their own panic still alerts the team.
  useEffect(() => {
    fetch('/api/ngo/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.account) { setOffDuty(!!d.account.off_duty); setNotifSetupDone(!!d.account.notif_setup_done) }
    }).catch(() => {})
  }, [])
  // Dismiss the setup nudge — they confirm push is already working. Persists server-side so it
  // stays hidden across devices/reloads.
  const dismissSetup = async () => {
    setNotifSetupDone(true)
    try { await fetch('/api/ngo/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notif_setup_done: true }) }) } catch { /* best effort */ }
  }
  const toggleOffDuty = async () => {
    const next = !offDuty
    setOffDutyBusy(true); setOffDuty(next)
    try {
      const r = await fetch('/api/ngo/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ off_duty: next }) })
      if (!r.ok) setOffDuty(!next) // revert on failure
    } catch { setOffDuty(!next) } finally { setOffDutyBusy(false) }
  }

  // Group chats the operator can access. Hydrate from the local cache first so they
  // show instantly and offline, then refresh from the server when online.
  useEffect(() => {
    try { const c = localStorage.getItem(CHATS_CACHE_KEY); if (c) setChatLinks(JSON.parse(c)) } catch { /* no cache */ }
    fetch('/api/ngo/chat', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.links) return
        setChatLinks(d.links)
        try { localStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(d.links)) } catch { /* quota */ }
      })
      .catch(() => { /* offline — keep cached */ })
  }, [])

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
      try {
        await fetch('/api/ngo/auth/logout', { method: 'POST' })
        await wipeLocalSensitive()              // H3: leave no location data on the device
        window.location.replace('/ngo/login'); return
      } catch { /* fall through to offline path */ }
    }
    // Offline: we can't clear the httpOnly cookie, but we MUST still wipe local
    // sensitive data (last GPS + any queued located payloads). Clearing the queue
    // drops unsynced check-ins by design — on explicit logout, data minimisation wins.
    await wipeLocalSensitive()
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

  // 1s tick drives the live check-in countdown. Cheap UI re-render only — no GPS, no network —
  // and paused while the tab is hidden, so it stays battery-conscious in the field.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setNowTick((n) => n + 1) }, 1000)
    return () => clearInterval(id)
  }, [])

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
    if (checkingIn) return
    setCheckingIn(true)
    setMsg(t('getting_loc'))
    try {
      const { lat, lon } = await resolveCoords()
      const noLoc = lat == null || lon == null
      setNoGps(noLoc && !manual)
      const sent = await send('/api/ngo/safety/check-in', { lat, lon }, 'check-in')
      setCheckinQueued(!sent)
      setMsg(sent ? `${t('checked')} ✓${noLoc ? ` · ${t('no_gps')}` : ''}` : t('queued_send'))
      await loadState()
    } finally { setCheckingIn(false) }
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
    if (!silent) setMsg(t('sending_alert'))
    // Fresh-if-possible, else last-known; the press is the complete action — GPS never blocks it.
    const { lat, lon } = await resolvePanicCoords()
    const body = { lat, lon, silent }
    let sent = false
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try { const r = await fetch('/api/ngo/safety/panic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) sent = true } catch { /* queue */ }
    }
    if (!sent) {
      await qAdd({ id: `panic|${typeof performance !== 'undefined' ? performance.now() : ''}|${Math.round(Math.random() * 1e9)}`, url: '/api/ngo/safety/panic', body, label: 'panic', method: 'POST' })
      refreshQueueCount()
    }
    // Silent mode: NO sound, NO full-screen flash — onlookers must see nothing alarming. But the
    // worker still gets a DISCREET confirmation (a small neutral line) so they know it fired,
    // alongside the subdued 'Alert active · Silent' panel. Non-silent gets the loud flash.
    if (!silent) {
      playAlarm()
      setFlash(true)
      setTimeout(() => setFlash(false), 4000)
      setMsg(sent ? t('alert_sent_msg') : t('alert_queued'))
    } else {
      setMsg(sent ? t('alert_sent_silent') : t('alert_queued'))
    }
    loadState() // surfaces active_panic → reason chips, cancel window, ack feedback
  }

  // Reason chips (tap-only) + false-alarm cancel — act on the worker's active panic.
  async function setPanicReason(reason: string) {
    const ap = state?.active_panic
    if (!ap) return
    const next = ap.reason === reason ? null : reason // tap again to clear
    await fetch(`/api/ngo/safety/panic/${ap.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: next }) })
    loadState()
  }
  async function cancelPanic() {
    const ap = state?.active_panic
    if (!ap) return
    const r = await fetch(`/api/ngo/safety/panic/${ap.id}/cancel`, { method: 'POST' })
    if (r.ok) { setMsg(t('cancelled')); loadState() }
    else { setMsg(t('locked_note')); loadState() }
  }
  // Two-tap guard so a panic is never cancelled by an accidental single tap under stress:
  // first tap arms (auto-disarms after 3s), second tap actually cancels.
  function onCancelTap() {
    if (cancelArmed) {
      if (cancelArmTimer.current) clearTimeout(cancelArmTimer.current)
      setCancelArmed(false)
      cancelPanic()
    } else {
      setCancelArmed(true)
      cancelArmTimer.current = setTimeout(() => setCancelArmed(false), 3000)
    }
  }
  // 1s tick to drive the cancel-window countdown while a panic is active.
  useEffect(() => {
    if (!state?.active_panic) return
    const id = setInterval(() => setNowTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [state?.active_panic])

  async function setStatus(status: string) {
    setPendingStatus(status) // highlight the chosen chip instantly — confirms even offline
    const sent = await send('/api/ngo/safety/status', { status }, 'status')
    setMsg(sent ? `${t('status_set')}: ${t(status as LangKey)} ✓` : t('queued_send'))
    loadState()
  }
  // Clear the optimistic highlight once the server confirms the new status.
  useEffect(() => { if (pendingStatus && state?.team?.status === pendingStatus) setPendingStatus(null) }, [state, pendingStatus])

  async function respondRollCall() {
    if (!state?.active_roll_call || rollBusy) return
    setRollBusy(true)
    setMsg(t('sharing_loc'))
    try {
      const { lat, lon } = await resolveCoords()
      const noLoc = lat == null || lon == null
      setNoGps(noLoc && !manual)
      const sent = await send('/api/ngo/safety/roll-call/respond', { roll_call_id: state.active_roll_call.id, lat, lon }, 'roll-call')
      setMsg(sent ? `${t('marked_safe')}${noLoc ? ` · ${t('no_gps')}` : ''}` : t('queued_send'))
      // Prominent confirmation — a roll-call answer is a safety signal, not a small toast.
      if (sent) { setSafeFlash(true); setTimeout(() => setSafeFlash(false), 2200) }
      await loadState()
    } finally { setRollBusy(false) }
  }

  const NEXT_STATUS: Record<string, string> = { assigned: 'en_route', en_route: 'on_scene', on_scene: 'done' }

  async function advanceDispatch() {
    if (!dispatch || advancing) return
    const next = NEXT_STATUS[dispatch.status]
    if (!next) return
    setAdvancing(true)
    // Optimistic: flip the status locally NOW so the card + button visibly move a step the
    // instant it's tapped (works offline too). Reconciled by loadDispatch below.
    setDispatch((d: any) => (d ? { ...d, status: next } : d))
    try {
      const sent = await send(`/api/ngo/dispatch/${dispatch.id}/advance`, {}, 'advance')
      setMsg(sent ? `${t(next as LangKey)}` : t('queued_send'))
      await loadDispatch()
    } finally { setAdvancing(false) }
  }
  async function submitReport() {
    if (!dispatch || reportBusy) return
    setReportBusy(true)
    try {
      // PUT updates the single report (creates it if none) so edits don't duplicate.
      const sent = await sendPut(`/api/ngo/dispatch/${dispatch.id}/report`, {
        people_assisted: report.people === '' ? null : Number(report.people),
        services: report.services || null,
        new_hazards: report.hazards || null,
      }, 'report')
      setReportSent(true); setEditingReport(false)
      setMsg(sent ? t('report_saved') : t('queued_send'))
    } finally { setReportBusy(false) }
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
  // Time-until-due, ticking. ≥1h: "Hh Mm"; 15–60m: "Xm"; <15m: "M:SS" (seconds, for urgency).
  function fmtCountdown(ms: number): string {
    const s = Math.floor(ms / 1000)
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    if (s >= 900) return `${Math.ceil(s / 60)}m`
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  // The persistent CHECK-IN state, derived from the last check-in + cadence. tone drives colour:
  // neutral (no cadence yet) / ok (plenty of time) / warn (due soon or never checked in) /
  // overdue (past due). Re-evaluated every second via nowTick so the countdown is live.
  function checkInInfo(): { sub: string; tone: 'neutral' | 'ok' | 'warn' | 'overdue'; never: boolean } {
    void nowTick
    if (checkinQueued) return { sub: t('queued_send'), tone: 'neutral', never: false }
    const last = state?.last_check_in
    if (!last) return { sub: t('never_checked_in'), tone: 'warn', never: true }
    const windowMin = state?.checkin_window_minutes ?? 240
    const remaining = new Date(last).getTime() + windowMin * 60000 - Date.now()
    if (remaining <= 0) return { sub: `✓ ${ago(last)} · ${t('overdue')}`, tone: 'overdue', never: false }
    const tone = remaining <= 15 * 60000 ? 'warn' : 'ok'
    return { sub: `✓ ${ago(last)} · ${t('due_in')} ${fmtCountdown(remaining)}`, tone, never: false }
  }

  const rc = state?.active_roll_call
  const showRc = rc && !rc.answered
  const ci = checkInInfo()
  // Tone → colour. Status bar (dark bg) uses these directly; the green check-in button uses
  // light tints below for contrast.
  const toneColor: Record<typeof ci.tone, string> = { neutral: '#8b949e', ok: '#8b949e', warn: '#d29922', overdue: '#f85149' }
  const dispStatusKey = (s: string): LangKey => (['assigned', 'en_route', 'on_scene', 'done'].includes(s) ? (s as LangKey) : 'assigned')

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ ...wrap, paddingBottom: 'calc(196px + env(safe-area-inset-bottom))' }}>
      <style>{`@keyframes nourHoldFill{from{width:0}to{width:100%}}@keyframes nourFlash{0%,100%{background:rgba(248,81,73,0.92)}50%{background:rgba(248,81,73,0.55)}}button:active:not(:disabled){transform:scale(0.97);filter:brightness(1.08)}button:disabled{opacity:0.6}`}</style>

      {/* Full-screen confirmation flash after a panic is sent */}
      {flash && (
        <div style={flashOverlay} onClick={() => setFlash(false)}>
          <div style={{ fontSize: 32, fontWeight: 800 }}>🆘 {t('alert_sent_full')}</div>
          <div style={{ fontSize: 16, marginTop: 8, opacity: 0.95 }}>{t('team_notified')}</div>
          <div style={{ fontSize: 13, marginTop: 18, opacity: 0.8 }}>{t('tap_dismiss')}</div>
        </div>
      )}

      {/* Roll-call answer confirmation — prominent green flash so a worker can't miss that
          their "safe" signal was recorded (matches the weight of the check-in confirmation). */}
      {safeFlash && (
        <div style={safeFlashOverlay} onClick={() => setSafeFlash(false)}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1 }}>✓</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 10 }}>{t('marked_safe')}</div>
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
            <Link href="/ngo/settings" style={{ ...logoutBtn, color: '#8b949e', textDecoration: 'none' }}>{t('account')}</Link>
            <button type="button" onClick={logout} style={logoutBtn}>{t('logout')}</button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ ...connChip, background: online ? 'rgba(63,185,80,0.15)' : 'rgba(210,153,34,0.18)', color: online ? '#3fb950' : '#d29922', border: `1px solid ${online ? 'rgba(63,185,80,0.4)' : 'rgba(210,153,34,0.5)'}` }}>
            <span style={{ fontSize: 14 }}>●</span> {online ? t('online') : t('offline')}{queued > 0 ? ` · ${queued} ${t('queued')}` : ''}
          </span>
          {/* Always shown — even when never checked in — so the worker always knows their state. */}
          <span style={{ fontSize: 13, fontWeight: 600, color: toneColor[ci.tone], textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ci.never ? `⚠ ${t('no_checkin')}` : ci.sub}
          </span>
        </div>
        {online && refreshError && (
          <div style={{ fontSize: 12, color: '#d29922', marginTop: 6 }}>{t('server_retry')}</div>
        )}
        {/* Availability — off-duty makes the operator fully silent (no notifications at all, not
            even panic/roll-call) and exempt from missed-check-in flags. Their own panic still fires. */}
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={toggleOffDuty} disabled={offDutyBusy} style={{
            width: '100%', minHeight: 40, borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui',
            background: offDuty ? 'rgba(210,153,34,0.15)' : 'rgba(63,185,80,0.12)',
            border: `1px solid ${offDuty ? 'rgba(210,153,34,0.5)' : 'rgba(63,185,80,0.45)'}`,
            color: offDuty ? '#d29922' : '#3fb950',
          }}>{offDuty ? `🌙 ${t('off_duty')} — ${t('on_duty')}?` : `🟢 ${t('on_duty')} — ${t('off_duty')}?`}</button>
          {offDuty && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{t('off_duty_note')}</div>}
        </div>
      </div>

      {/* Prominent offline banner — offline is the normal state, not an error */}
      {!online && <div style={offlineBanner}>● {t('offline')}{queued > 0 ? ` · ${queued} ${t('queued')}` : ''}</div>}

      {/* Actions | Map tab switch — actions are the default; the map is secondary and
          lazy-loaded. Panic stays fixed below regardless of the active tab. */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setTab('actions')} style={tabBtn(tab === 'actions')}>{t('actions')}</button>
        <button type="button" onClick={() => setTab('map')} style={tabBtn(tab === 'map')}>🗺 {t('map')}</button>
        <button type="button" onClick={() => setTab('chats')} style={tabBtn(tab === 'chats')}>💬 {t('chats')}{chatLinks.length > 0 ? ` (${chatLinks.length})` : ''}</button>
        <button type="button" onClick={() => setTab('broadcasts')} style={tabBtn(tab === 'broadcasts')}>📢 {t('broadcasts')}{unackedUrgent > 0 ? ` (${unackedUrgent})` : ''}</button>
      </div>

      {tab === 'actions' && (<>
      {/* Identity + team (F-6/F-7). Field phones get shared, so make WHO is signed in and which
          team unmistakable, with a one-tap "not you?" logout. Read-only; team changes are
          leader-only on the dashboard. */}
      <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ fontSize: 11, color: '#8b949e' }}>{t('logged_in_as')}</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#e6edf3' }}>
          {who?.name ?? '—'}{who?.org ? <span style={{ fontSize: 12, fontWeight: 400, color: '#8b949e' }}> · {who.org}</span> : null}
        </div>
        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
          {state?.team
            ? <>{t('your_team')}: <span style={{ color: '#c9d1d9' }}>{state.team.name} · {state.team.type}</span>{state.team.leader_name ? ` · ${t('team_lead')}: ${state.team.leader_name}` : ''}</>
            : t('no_team')}
        </div>
        <button type="button" onClick={logout} style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 12, padding: '6px 0 0', fontFamily: 'system-ui' }}>{t('not_you')}</button>
      </div>

      {/* One-time nudge to set up push alerts (ntfy) — field coordinators are the most
          important recipients, so make the path to setup obvious. Links to /ngo/settings
          (allowed for this role by middleware), where the download + tutorial live. Hidden once
          the user has set up notifications (sent a test push, or dismissed it here). */}
      {!notifSetupDone && (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          <a href="/ngo/settings" style={{ flex: 1, textDecoration: 'none', background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#58a6ff' }}>🔔 {t('setup_alerts')} →</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{t('setup_alerts_sub')}</div>
          </a>
          <button type="button" onClick={dismissSetup} title={t('already_setup')} aria-label={t('already_setup')}
            style={{ flex: '0 0 auto', background: '#161b22', border: '1px solid #21262d', borderRadius: 10, color: '#8b949e', fontSize: 18, cursor: 'pointer', fontFamily: 'system-ui', padding: '0 12px' }}>✓</button>
        </div>
      )}
      {/* Active-panic panel — appears after a panic fires (driven by polled state, so it
          survives reloads + offline→online sync). Reason chips, the false-alarm cancel
          window, and "help has seen this". Subdued in silent mode. */}
      {state?.active_panic && (() => {
        const ap = state.active_panic!
        const left = Math.max(0, Math.ceil(CANCEL_WINDOW_S - (Date.now() - new Date(ap.created_at).getTime()) / 1000))
        return (
          <div style={ap.silent ? panicPanelSilent : panicPanelLoud}>
            <div style={{ fontSize: 15, fontWeight: 700, color: ap.silent ? '#c9d1d9' : '#f85149' }}>
              {ap.silent ? `${t('alert_active')} · ${t('silent_mode')}` : `🆘 ${t('alert_active')}`}
            </div>
            {ap.acknowledged && <div style={{ fontSize: 14, color: '#3fb950', marginTop: 4 }}>✓ {t('help_seen')}</div>}
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 10 }}>{t('choose_reason')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setPanicReason(r)} style={reasonChip(ap.reason === r)}>{t(('r_' + r) as LangKey)}</button>
              ))}
            </div>
            {left > 0
              ? <button type="button" onClick={onCancelTap} style={cancelArmed ? { ...cancelBtn, background: 'rgba(248,81,73,0.25)', borderColor: '#f85149', color: '#fff' } : cancelBtn}>{cancelArmed ? t('confirm_cancel') : `${t('cancel_false_alarm')} · ${left}s`}</button>
              : <div style={{ fontSize: 12, color: '#8b949e', marginTop: 10 }}>{t('locked_note')}</div>}
          </div>
        )
      })()}

      {/* Roll-call prompt */}
      {showRc && (
        <button type="button" onClick={respondRollCall} disabled={rollBusy} style={rollCallBtn}>
          🟢 {rollBusy ? `${t('sharing_loc')}…` : t('rollcall')}
          {rc?.message ? <div style={{ fontSize: 14, fontWeight: 400, marginTop: 6 }}>{rc.message}</div> : null}
        </button>
      )}
      {rc && rc.answered && <div style={{ textAlign: 'center', color: '#3fb950', fontSize: 15, fontWeight: 600 }}>{t('marked_safe')}</div>}

      {/* OFF-DUTY banner — persistent + unmissable above the primary control, so a worker is
          never confused about why nothing is reaching them (off-duty is fully silent). */}
      {offDuty && (
        <div style={{ background: 'rgba(163,113,247,0.16)', border: '1px solid rgba(163,113,247,0.55)', color: '#d2b8ff', borderRadius: 12, padding: '12px 14px', fontSize: 14, fontWeight: 700, lineHeight: 1.35, textAlign: 'center' }}>
          {t('off_duty_banner')}
        </div>
      )}

      {/* CHECK IN — the largest control on the screen */}
      <button type="button" onClick={doCheckIn} disabled={checkingIn} style={checkInBtn}>
        <span style={{ fontSize: 32, fontWeight: 800 }}>{checkingIn ? `${t('getting_loc')}…` : t('check_in')}</span>
        <span style={{ fontSize: 15, fontWeight: 600, opacity: 0.95, color: ci.tone === 'overdue' ? '#ffd7d5' : ci.tone === 'warn' ? '#ffe8b3' : '#fff' }}>{checkingIn ? '' : ci.sub}</span>
      </button>
      {/* Honest GPS warning: the last located action shared no coordinates (denied / no fix). */}
      {noGps && !manual && (
        <div style={{ background: 'rgba(210,153,34,0.14)', border: '1px solid rgba(210,153,34,0.5)', color: '#e3b341', borderRadius: 10, padding: '9px 12px', fontSize: 13, lineHeight: 1.35, textAlign: 'center' }}>
          ⚠ {t('gps_hint')}
        </div>
      )}

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
            <button type="button" onClick={advanceDispatch} disabled={advancing} style={{ ...checkInBtn, height: 64, background: '#1f6feb', borderColor: '#58a6ff', marginTop: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{advancing ? '…' : `${t('advance_to')} ${t(NEXT_STATUS[dispatch.status] as LangKey).toUpperCase()}`}</span>
            </button>
          )}
          {/* On-scene report (3 fields) — fileable/editable once on scene or done */}
          {['on_scene', 'done'].includes(dispatch.status) && (!reportSent || editingReport) && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, color: '#8b949e' }}>{t('onscene_report')}</div>
              <input style={field} inputMode="numeric" placeholder={t('people_assisted')} value={report.people} onChange={(e) => setReport({ ...report, people: e.target.value })} />
              <input style={field} placeholder={t('services_delivered')} value={report.services} onChange={(e) => setReport({ ...report, services: e.target.value })} />
              <input style={field} placeholder={t('new_hazards')} value={report.hazards} onChange={(e) => setReport({ ...report, hazards: e.target.value })} />
              <button type="button" onClick={submitReport} disabled={reportBusy} style={{ ...statusBtn(false), height: 48 }}>{reportBusy ? '…' : (editingReport ? t('save_changes') : t('submit_report'))}</button>
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

      {/* Chats tab — the group chats this operator can access (org-wide + their team),
          as added by the NGO in the dashboard. Cached locally so they open offline. */}
      {tab === 'chats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#d29922', background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.35)', borderRadius: 10, padding: '10px 12px' }}>{t('chats_trust')}</div>
          {chatLinks.length === 0 && <div style={{ fontSize: 14, color: '#8b949e', textAlign: 'center', padding: '24px 0' }}>{t('no_chats')}</div>}
          {chatLinks.map((l) => (
            <div key={l.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 22, lineHeight: '26px' }}>{chatIcon(l.platform)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3' }}>{l.label}</div>
                  {l.description && <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>{l.description}</div>}
                  <div style={{ fontSize: 12, color: '#6e7681', marginTop: 4 }}>{l.scope === 'team' ? `${t('team_chat')}${l.team_name ? ` · ${l.team_name}` : ''}` : t('org_chat')}</div>
                </div>
              </div>
              {/* Tap to open — never auto-open. */}
              <a href={l.url} target="_blank" rel="noreferrer noopener" style={{ ...groupChatBtn, minHeight: 52 }}>💬 {t('open')} ↗</a>
            </div>
          ))}
        </div>
      )}

      {tab === 'broadcasts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {broadcasts.length === 0 && <div style={{ fontSize: 14, color: '#8b949e', textAlign: 'center', padding: '24px 0' }}>{t('no_broadcasts')}</div>}
          {broadcasts.map((b) => {
            const urgent = b.urgency === 'urgent'
            return (
              <div key={b.id} style={{ background: '#161b22', border: `1px solid ${urgent ? 'rgba(248,81,73,0.5)' : '#21262d'}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 16, color: '#e6edf3', whiteSpace: 'pre-wrap', flex: 1 }}>{b.body}</div>
                  {urgent && <span style={{ fontSize: 10, fontWeight: 700, color: '#f85149', border: '1px solid #f85149', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>{t('urgent')}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>{b.sender_name} · {new Date(b.created_at).toLocaleString()}</div>
                {urgent && (
                  b.acknowledged_at
                    ? <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: '#3fb950' }}>✓ {t('acknowledged')}</div>
                    : <button type="button" onClick={() => acknowledge(b.id)} disabled={ackBusy === b.id} style={{ marginTop: 10, width: '100%', minHeight: 48, borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui', background: 'rgba(63,185,80,0.15)', border: '1px solid #3fb950', color: '#3fb950', opacity: ackBusy === b.id ? 0.6 : 1 }}>✓ {t('acknowledge')}</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Fixed PANIC bar — always visible, hard to miss, never scrolls away. A small
          silent toggle sits above it: pre-arm for when being seen/heard is the danger. */}
      <div style={panicBar}>
        <div style={{ width: '100%', maxWidth: 480, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={() => setSilent((s) => !s)} style={silentToggle(silent)} aria-pressed={silent}>
            {silent ? '🔇' : '🔈'} {t('silent_mode')}{silent ? ' ✓' : ''}
          </button>
          <button
            type="button"
            onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold}
            onTouchStart={startHold} onTouchEnd={cancelHold} onTouchCancel={cancelHold}
            onContextMenu={(e) => e.preventDefault()}
            style={{ ...checkInBtn, height: 112, position: 'relative', overflow: 'hidden', background: holding ? '#b62324' : '#da3633', borderColor: '#f85149', boxShadow: '0 -2px 14px rgba(0,0,0,0.55)' }}
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
const safeFlashOverlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#fff', background: 'rgba(35,134,54,0.96)', fontFamily: 'system-ui', cursor: 'pointer' }
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
function silentToggle(active: boolean): React.CSSProperties {
  return { width: '100%', height: 40, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui', pointerEvents: 'auto', background: active ? 'rgba(139,148,158,0.25)' : 'rgba(13,17,23,0.85)', border: active ? '1px solid #8b949e' : '1px solid #21262d', color: active ? '#e6edf3' : '#8b949e' }
}
const panicPanelLoud: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.5)', borderRadius: 12, padding: 14 }
const panicPanelSilent: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 14 }
function reasonChip(active: boolean): React.CSSProperties {
  return { height: 44, padding: '0 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(210,153,34,0.22)' : '#0d1117', border: active ? '2px solid #d29922' : '1px solid #21262d', color: active ? '#d29922' : '#c9d1d9' }
}
const cancelBtn: React.CSSProperties = { width: '100%', height: 48, marginTop: 12, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui', background: 'rgba(255,255,255,0.06)', border: '1px solid #30363d', color: '#e6edf3' }
