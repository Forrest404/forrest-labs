'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 'success'
type GpsStatus = 'loading' | 'done' | 'denied' | 'error'
type DistanceBand = 'under_500m' | '500m_1km' | '1km_3km' | 'over_3km'
type EventValue =
  | 'large_explosion'
  | 'shockwave'
  | 'smoke_fire'
  | 'aircraft'
  | 'ground_shook'
  | 'other'

type ReportType = 'strike' | 'warning' | null
type WarningStep = 1 | 2 | 3 | 4 | 'success'
type WarningType = 'official_order' | 'phone_call' | 'leaflet_drop' | 'community_warning' | 'other'

interface StoredReport {
  timestamp: number
  id?: string
}

// ─── i18n ─────────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    step0_strike: 'I heard or saw a strike',
    step0_strike_sub: 'Explosion, shockwave, smoke or fire near me right now',
    step0_warning: 'I received an evacuation warning',
    step0_warning_sub: 'IDF order, phone call, or community warning to leave my area',
    step1_heading: 'Where are you?',
    step1_sub: 'Used only to place your report on the map.',
    step1_finding: 'Finding your location...',
    step1_privacy: 'Approximate only. Your identity is never stored.',
    step1_btn: 'Use this location',
    step1_denied: 'Location access denied.',
    step1_manual: 'Enter your neighbourhood (optional)',
    step2_heading: 'How far away was it?',
    step2_sub: 'Your best guess is fine.',
    dist_very_close: 'Very close', dist_very_close_sub: 'Under 500m',
    dist_close: 'Close', dist_close_sub: '500m – 1km',
    dist_distant: 'Distant', dist_distant_sub: '1 – 3km',
    dist_far: 'Far away', dist_far_sub: 'Over 3km',
    step3_heading: 'What did you experience?',
    step3_sub: 'Select all that apply.',
    event_explosion: 'Large explosion heard',
    event_shockwave: 'Shockwave felt / windows shook',
    event_smoke: 'Smoke or fire visible',
    event_aircraft: 'Aircraft or missiles overhead',
    event_ground: 'Ground shook / debris fell',
    event_other: 'Something else / not sure',
    step4_heading: 'Add a photo or video',
    step4_badge: 'Optional — helps verification',
    step4_upload: 'Tap to add photo or video',
    step4_blur: 'Max 50MB · Faces auto-blurred',
    step4_skip: 'Skip',
    step5_heading: 'Confirm your report',
    step5_anon: 'Your report is anonymous. No name, phone number, or device ID is stored. This report will be combined with others nearby to identify where help is needed.',
    submit_btn: 'Send report',
    submitting: 'Sending...',
    success_heading: 'Report sent',
    success_sub: 'Thank you. Aid organisations can now see activity in this area.',
    success_media_uploading: 'Your photo or video is being reviewed.',
    success_media_done: 'Your photo or video has been submitted for review.',
    btn_view_map: 'View live map',
    btn_share: 'Share this page',
    btn_report_another: 'Report another incident',
    btn_continue: 'Continue',
    btn_back: 'Back',
    btn_remove: 'Remove',
    file_too_large: 'File too large. Max 50MB.',
    err_offline: 'No internet connection. Please check your connection and try again.',
    err_timeout: 'Request timed out. Please try again.',
    err_network: 'Could not reach the server. Please check your connection and try again.',
    err_generic: 'Something went wrong. Please try again.',
    warn_step2_heading: 'How were you warned?',
    warn_official: 'Official IDF order',
    warn_official_sub: 'Posted on X / social media',
    warn_phone: 'Phone call from IDF',
    warn_phone_sub: 'Automated robo-call warning',
    warn_leaflet: 'Leaflet from aircraft',
    warn_leaflet_sub: 'Printed warning dropped overhead',
    warn_community: 'Community warning',
    warn_community_sub: 'Neighbour or group chat',
    warn_other: 'Other / not sure',
    warn_other_sub: 'Something else warned me',
    step0_strike_time: 'Takes 15 seconds',
    step0_warning_time: 'Appears on map in under 2 minutes',
    step0_active_warnings: 'active warnings in your area',
    step0_no_warnings: 'No active warnings',
    copy_warning: 'Copy warning to share',
    copied: 'Copied!',
    warn_step3_heading: 'Any details?',
    warn_step3_sub: 'What did the warning say? What area was mentioned?',
    warn_step3_placeholder: 'e.g. Warning said to evacuate Nabatieh immediately...',
    warn_step4_heading: 'Confirm warning report',
    warn_submit_btn: 'Send warning report',
    warn_success_heading: 'Warning reported',
    warn_success_sub: 'If others in your area report the same warning, it appears on the map immediately.',
    warn_stay_safe: 'Stay safe. Evacuate immediately if you have not already done so.',
    warn_combine: 'Your report will combine with others in your area. 3+ reports = appears on the map immediately.',
    rate_limit_heading: 'Report submitted',
    rate_limit_pre: 'You submitted a report',
    rate_limit_mid: 'ago. You can submit another in',
    rate_limit_min: 'minute',
    rate_limit_mins: 'minutes',
    anon_note: 'Anonymous · No account required',
    live_map: 'Live map →',
    photo_attached: 'Photo attached',
    video_attached: 'Video attached',
    location_found: 'Location found',
    beirut_area: 'Beirut area',
  },
  ar: {
    step0_strike: 'سمعت أو رأيت قصفاً',
    step0_strike_sub: 'انفجار، موجة صدمة، دخان أو نار بالقرب مني',
    step0_warning: 'تلقيت تحذيراً بالإخلاء',
    step0_warning_sub: 'أمر جيش الاحتلال، مكالمة هاتفية، أو تحذير مجتمعي للمغادرة',
    step1_heading: 'أين أنت؟',
    step1_sub: 'يُستخدم فقط لوضع تقريرك على الخريطة.',
    step1_finding: 'جاري البحث عن موقعك...',
    step1_privacy: 'تقريبي فقط. هويتك لا تُخزَّن أبداً.',
    step1_btn: 'استخدام موقعي الحالي',
    step1_denied: 'تم رفض الوصول إلى الموقع.',
    step1_manual: 'أدخل حيك (اختياري)',
    step2_heading: 'كم كانت المسافة؟',
    step2_sub: 'تخمينك الأفضل يكفي.',
    dist_very_close: 'قريب جداً', dist_very_close_sub: 'أقل من 500 متر',
    dist_close: 'قريب', dist_close_sub: '500م – 1كم',
    dist_distant: 'بعيد نسبياً', dist_distant_sub: '1 – 3كم',
    dist_far: 'بعيد جداً', dist_far_sub: 'أكثر من 3كم',
    step3_heading: 'ماذا تعرضت له؟',
    step3_sub: 'اختر كل ما ينطبق.',
    event_explosion: 'سُمع انفجار كبير',
    event_shockwave: 'شُعر بموجة صدمة / اهتزت النوافذ',
    event_smoke: 'دخان أو نار مرئية',
    event_aircraft: 'طائرات أو صواريخ في الأعلى',
    event_ground: 'اهتزت الأرض / سقط الحطام',
    event_other: 'شيء آخر / غير متأكد',
    step4_heading: 'أضف صورة أو فيديو',
    step4_badge: 'اختياري — يساعد في التحقق',
    step4_upload: 'اضغط لإضافة صورة أو فيديو',
    step4_blur: '50 ميغابايت كحد أقصى · الوجوه تُطمس تلقائياً',
    step4_skip: 'تخطي',
    step5_heading: 'تأكيد تقريرك',
    step5_anon: 'تقريرك مجهول الهوية. لا يتم تخزين أي اسم أو رقم هاتف أو معرف جهاز. سيتم دمج هذا التقرير مع آخرين قريبين لتحديد أين تُحتاج المساعدة.',
    submit_btn: 'إرسال التقرير',
    submitting: 'جاري الإرسال...',
    success_heading: 'تم إرسال التقرير',
    success_sub: 'شكراً لك. يمكن لمنظمات الإغاثة الآن رؤية النشاط في منطقتك.',
    success_media_uploading: 'يتم مراجعة الصورة أو الفيديو.',
    success_media_done: 'تم تقديم الصورة أو الفيديو للمراجعة.',
    btn_view_map: 'عرض الخريطة المباشرة',
    btn_share: 'مشاركة هذه الصفحة',
    btn_report_another: 'الإبلاغ عن حادثة أخرى',
    btn_continue: 'متابعة',
    btn_back: 'رجوع',
    btn_remove: 'إزالة',
    file_too_large: 'الملف كبير جداً. الحد الأقصى 50 ميغابايت.',
    err_offline: 'لا يوجد اتصال بالإنترنت. يرجى التحقق من اتصالك والمحاولة مجدداً.',
    err_timeout: 'انتهت مهلة الطلب. يرجى المحاولة مجدداً.',
    err_network: 'تعذر الوصول إلى الخادم. يرجى التحقق من اتصالك والمحاولة مجدداً.',
    err_generic: 'حدث خطأ ما. يرجى المحاولة مجدداً.',
    warn_step2_heading: 'كيف تلقيت التحذير؟',
    warn_official: 'أمر رسمي من جيش الاحتلال',
    warn_official_sub: 'نُشر على وسائل التواصل الاجتماعي',
    warn_phone: 'مكالمة هاتفية من جيش الاحتلال',
    warn_phone_sub: 'مكالمة تحذير آلية',
    warn_leaflet: 'منشورات من الطائرات',
    warn_leaflet_sub: 'منشورات مطبوعة أُسقطت من الأعلى',
    warn_community: 'تحذير مجتمعي',
    warn_community_sub: 'جار أو دردشة جماعية',
    warn_other: 'أخرى / غير متأكد',
    warn_other_sub: 'شيء آخر حذرني',
    step0_strike_time: 'يستغرق 15 ثانية',
    step0_warning_time: 'يظهر على الخريطة في أقل من دقيقتين',
    step0_active_warnings: 'تحذيرات نشطة في منطقتك',
    step0_no_warnings: 'لا توجد تحذيرات نشطة',
    copy_warning: 'نسخ التحذير للمشاركة',
    copied: 'تم النسخ!',
    warn_step3_heading: 'أي تفاصيل؟',
    warn_step3_sub: 'ماذا قال التحذير؟ أي منطقة ذُكرت؟',
    warn_step3_placeholder: 'مثلاً: قال التحذير بإخلاء النبطية فوراً...',
    warn_step4_heading: 'تأكيد تقرير التحذير',
    warn_submit_btn: 'إرسال تقرير التحذير',
    warn_success_heading: 'تم الإبلاغ عن التحذير',
    warn_success_sub: 'إذا أبلغ آخرون في منطقتك عن نفس التحذير، سيظهر على الخريطة فوراً.',
    warn_stay_safe: 'ابق بأمان. أخلِ المكان فوراً إن لم تكن قد فعلت.',
    warn_combine: 'سيُدمج تقريرك مع آخرين في منطقتك. 3 تقارير أو أكثر = يظهر على الخريطة فوراً.',
    rate_limit_heading: 'تم تقديم التقرير',
    rate_limit_pre: 'أرسلت تقريراً منذ',
    rate_limit_mid: '. يمكنك إرسال آخر خلال',
    rate_limit_min: 'دقيقة',
    rate_limit_mins: 'دقائق',
    anon_note: 'مجهول الهوية · لا حساب مطلوب',
    live_map: 'الخريطة المباشرة ←',
    photo_attached: 'صورة مرفقة',
    video_attached: 'فيديو مرفق',
    location_found: 'تم تحديد الموقع',
    beirut_area: 'منطقة بيروت',
  },
  fr: {
    step0_strike: "J'ai entendu ou vu une frappe",
    step0_strike_sub: 'Explosion, onde de choc, fumée ou feu près de moi',
    step0_warning: "J'ai reçu un avertissement d'évacuation",
    step0_warning_sub: 'Ordre IDF, appel téléphonique ou avertissement communautaire',
    step1_heading: 'Où êtes-vous ?',
    step1_sub: 'Utilisé uniquement pour placer votre signalement sur la carte.',
    step1_finding: 'Recherche de votre position...',
    step1_privacy: "Approximatif uniquement. Votre identité n'est jamais stockée.",
    step1_btn: 'Utiliser ma position',
    step1_denied: 'Accès à la position refusé.',
    step1_manual: 'Entrez votre quartier (facultatif)',
    step2_heading: 'À quelle distance était-ce ?',
    step2_sub: 'Votre meilleure estimation suffit.',
    dist_very_close: 'Très proche', dist_very_close_sub: 'Moins de 500m',
    dist_close: 'Proche', dist_close_sub: '500m – 1km',
    dist_distant: 'Éloigné', dist_distant_sub: '1 – 3km',
    dist_far: 'Très éloigné', dist_far_sub: 'Plus de 3km',
    step3_heading: "Qu'avez-vous vécu ?",
    step3_sub: "Sélectionnez tout ce qui s'applique.",
    event_explosion: 'Grande explosion entendue',
    event_shockwave: 'Onde de choc / fenêtres vibrantes',
    event_smoke: 'Fumée ou feu visible',
    event_aircraft: 'Avions ou missiles au-dessus',
    event_ground: 'Sol tremblant / débris tombants',
    event_other: 'Autre chose / pas sûr',
    step4_heading: 'Ajouter une photo ou vidéo',
    step4_badge: 'Facultatif — aide à la vérification',
    step4_upload: 'Appuyez pour ajouter photo ou vidéo',
    step4_blur: '50 Mo max · Visages floutés automatiquement',
    step4_skip: 'Ignorer',
    step5_heading: 'Confirmer votre signalement',
    step5_anon: "Votre signalement est anonyme. Aucun nom, numéro de téléphone ou identifiant d'appareil n'est stocké. Ce signalement sera combiné avec d'autres à proximité.",
    submit_btn: 'Envoyer le signalement',
    submitting: 'Envoi en cours...',
    success_heading: 'Signalement envoyé',
    success_sub: "Merci. Les organisations d'aide peuvent voir l'activité dans votre zone.",
    success_media_uploading: 'Votre photo ou vidéo est en cours de vérification.',
    success_media_done: 'Votre photo ou vidéo a été soumise pour vérification.',
    btn_view_map: 'Voir la carte en direct',
    btn_share: 'Partager cette page',
    btn_report_another: 'Signaler un autre incident',
    btn_continue: 'Continuer',
    btn_back: 'Retour',
    btn_remove: 'Supprimer',
    file_too_large: 'Fichier trop volumineux. Max 50 Mo.',
    err_offline: 'Pas de connexion Internet. Veuillez vérifier et réessayer.',
    err_timeout: 'Délai expiré. Veuillez réessayer.',
    err_network: 'Impossible de joindre le serveur. Veuillez vérifier et réessayer.',
    err_generic: "Quelque chose s'est mal passé. Veuillez réessayer.",
    warn_step2_heading: 'Comment avez-vous été averti ?',
    warn_official: 'Ordre officiel IDF',
    warn_official_sub: 'Publié sur les réseaux sociaux',
    warn_phone: 'Appel téléphonique IDF',
    warn_phone_sub: 'Appel automatique d\'avertissement',
    warn_leaflet: 'Tracts depuis un avion',
    warn_leaflet_sub: 'Avertissement imprimé largué',
    warn_community: 'Avertissement communautaire',
    warn_community_sub: 'Voisin ou groupe de discussion',
    warn_other: 'Autre / pas sûr',
    warn_other_sub: 'Autre chose m\'a averti',
    step0_strike_time: 'Prend 15 secondes',
    step0_warning_time: 'Apparaît sur la carte en moins de 2 minutes',
    step0_active_warnings: 'avertissements actifs dans votre zone',
    step0_no_warnings: 'Aucun avertissement actif',
    copy_warning: 'Copier l\'avertissement',
    copied: 'Copié !',
    warn_step3_heading: 'Des détails ?',
    warn_step3_sub: "Qu'a dit l'avertissement ? Quelle zone ?",
    warn_step3_placeholder: "Ex: L'avertissement demandait d'évacuer Nabatieh...",
    warn_step4_heading: "Confirmer l'avertissement",
    warn_submit_btn: "Envoyer l'avertissement",
    warn_success_heading: 'Avertissement signalé',
    warn_success_sub: "Si d'autres signalent le même avertissement, il apparaît sur la carte immédiatement.",
    warn_stay_safe: 'Restez en sécurité. Évacuez immédiatement si averti.',
    warn_combine: "Votre signalement sera combiné avec d'autres dans votre zone. 3+ signalements = apparaît sur la carte.",
    rate_limit_heading: 'Signalement soumis',
    rate_limit_pre: 'Vous avez soumis un signalement il y a',
    rate_limit_mid: '. Vous pouvez en soumettre un autre dans',
    rate_limit_min: 'minute',
    rate_limit_mins: 'minutes',
    anon_note: 'Anonyme · Aucun compte requis',
    live_map: 'Carte en direct →',
    photo_attached: 'Photo jointe',
    video_attached: 'Vidéo jointe',
    location_found: 'Position trouvée',
    beirut_area: 'Région de Beyrouth',
  },
} as const

type Lang = keyof typeof STRINGS
type StringKey = keyof typeof STRINGS['en']

// ─── Constants ────────────────────────────────────────────────────────────────

const BEIRUT_LAT = 33.8938
const BEIRUT_LON = 35.5018
const TEN_MINUTES = 10 * 60 * 1000
const MAX_MEDIA_BYTES = 52428800 // 50 MB

const DISTANCE_KEYS: {
  value: DistanceBand
  label: StringKey
  range: StringKey
  r: number
  stroke: string
  strokeWidth: number
}[] = [
  { value: 'under_500m', label: 'dist_very_close', range: 'dist_very_close_sub', r: 10, stroke: '#ef4444', strokeWidth: 2.5 },
  { value: '500m_1km', label: 'dist_close', range: 'dist_close_sub', r: 14, stroke: '#f97316', strokeWidth: 2 },
  { value: '1km_3km', label: 'dist_distant', range: 'dist_distant_sub', r: 18, stroke: '#3b82f6', strokeWidth: 1.5 },
  { value: 'over_3km', label: 'dist_far', range: 'dist_far_sub', r: 22, stroke: '#6b7280', strokeWidth: 1 },
]

const EVENT_KEYS: { value: EventValue; label: StringKey; colour: string }[] = [
  { value: 'large_explosion', label: 'event_explosion', colour: '#ef4444' },
  { value: 'shockwave', label: 'event_shockwave', colour: '#f97316' },
  { value: 'smoke_fire', label: 'event_smoke', colour: '#eab308' },
  { value: 'aircraft', label: 'event_aircraft', colour: '#8b5cf6' },
  { value: 'ground_shook', label: 'event_ground', colour: '#6b7280' },
  { value: 'other', label: 'event_other', colour: '#374151' },
]

const WARNING_OPTIONS: { value: WarningType; label: StringKey; sub: StringKey; dotColor: string }[] = [
  { value: 'official_order', label: 'warn_official', sub: 'warn_official_sub', dotColor: '#f97316' },
  { value: 'phone_call', label: 'warn_phone', sub: 'warn_phone_sub', dotColor: '#f97316' },
  { value: 'leaflet_drop', label: 'warn_leaflet', sub: 'warn_leaflet_sub', dotColor: '#f97316' },
  { value: 'community_warning', label: 'warn_community', sub: 'warn_community_sub', dotColor: '#f97316' },
  { value: 'other', label: 'warn_other', sub: 'warn_other_sub', dotColor: '#6b7280' },
]

const EXAMPLE_CHIPS = ['Evacuate south of Litani', 'Leave Nabatieh immediately', 'Clear the area by sunset']

const DISTANCE_LABELS: Record<DistanceBand, string> = {
  under_500m: 'Under 500m away',
  '500m_1km': '500m – 1km away',
  '1km_3km': '1 – 3km away',
  over_3km: 'Over 3km away',
}

function formatWarningType(type: string): string {
  const labels: Record<string, string> = {
    official_order: 'Official IDF order',
    phone_call: 'IDF phone call',
    leaflet_drop: 'Leaflet drop',
    community_warning: 'Community warning',
    other: 'Other',
  }
  return labels[type] ?? type
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function ReportPage() {
  // i18n
  const [lang, setLang] = useState<Lang>('en')
  const t = (key: StringKey): string => STRINGS[lang][key]

  // Report type
  const [reportType, setReportType] = useState<ReportType>(null)

  // Strike navigation
  const [currentStep, setCurrentStep] = useState<Step>(1)

  // Warning navigation
  const [warningStep, setWarningStep] = useState<WarningStep>(1)
  const [warningType, setWarningType] = useState<WarningType | null>(null)
  const [sourceDetail, setSourceDetail] = useState('')

  // Rate limiting
  const [rateLimitMinutesLeft, setRateLimitMinutesLeft] = useState<number | null>(null)
  const [rateLimitMinutesAgo, setRateLimitMinutesAgo] = useState<number>(0)

  // Step 1 — Location (shared by both flows)
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('loading')
  const [lat, setLat] = useState<number>(BEIRUT_LAT)
  const [lon, setLon] = useState<number>(BEIRUT_LON)
  const [locationName, setLocationName] = useState<string>('')
  const [manualLocation, setManualLocation] = useState<string>('')

  // Step 2 — Distance (strike only)
  const [distanceBand, setDistanceBand] = useState<DistanceBand | null>(null)

  // Step 3 — Event types (strike only)
  const [eventTypes, setEventTypes] = useState<EventValue[]>([])

  // Step 4 — Media (strike only)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [mediaSizeError, setMediaSizeError] = useState(false)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [mediaUploadComplete, setMediaUploadComplete] = useState(false)

  // Success screen
  const [shareButtonText, setShareButtonText] = useState('Share')
  const [copyWarningText, setCopyWarningText] = useState('copy')

  // Step 0 — active warning count
  const [activeWarningCount, setActiveWarningCount] = useState<number | null>(null)

  // ── Mount: lang, URL params, rate limit, GPS ─────────────────────────────

  useEffect(() => {
    // Language
    try {
      const saved = localStorage.getItem('fl_lang')
      if (saved === 'ar' || saved === 'fr') setLang(saved)
    } catch { /* ignore */ }

    // URL params
    const params = new URLSearchParams(window.location.search)
    if (params.get('type') === 'warning') {
      setReportType('warning')
    }
  }, [])

  // Fetch active warning count for step 0
  useEffect(() => {
    const sb = createClient()
    sb.from('warning_clusters').select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .then(({ count }) => { setActiveWarningCount(count ?? 0) })
  }, [])

  // Rate limit check
  useEffect(() => {
    try {
      const stored = localStorage.getItem('fl_last_report')
      if (!stored) return
      const parsed: StoredReport = JSON.parse(stored)
      const elapsed = Date.now() - parsed.timestamp
      if (elapsed < TEN_MINUTES) {
        const minsLeft = Math.ceil((TEN_MINUTES - elapsed) / 60000)
        const minsAgo = Math.floor(elapsed / 60000)
        setRateLimitMinutesLeft(minsLeft)
        setRateLimitMinutesAgo(minsAgo)
        setTimeout(() => {
          localStorage.removeItem('fl_last_report')
          window.location.reload()
        }, TEN_MINUTES - elapsed)
      }
    } catch { /* malformed localStorage */ }
  }, [])

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('error'); return }

    let resolved = false
    const fallbackTimer = setTimeout(() => { if (!resolved) setGpsStatus('error') }, 8000)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        resolved = true
        clearTimeout(fallbackTimer)
        const newLat = pos.coords.latitude
        const newLon = pos.coords.longitude
        setLat(newLat)
        setLon(newLon)
        setGpsStatus('done')
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${newLon},${newLat}.json?access_token=${token}`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json() as { features: { place_name: string }[] }
            setLocationName(data.features?.[0]?.place_name ?? '')
          }
        } catch { /* ignore */ }
      },
      (err) => {
        resolved = true
        clearTimeout(fallbackTimer)
        if (err.code === err.PERMISSION_DENIED) setGpsStatus('denied')
        else setGpsStatus('error')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
    return () => clearTimeout(fallbackTimer)
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleEvent = useCallback((val: EventValue) => {
    setEventTypes((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val])
  }, [])

  const handleMediaFile = useCallback((file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_MEDIA_BYTES) { setMediaSizeError(true); return }
    setMediaSizeError(false)
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(file)
    setMediaPreviewUrl(URL.createObjectURL(file))
  }, [mediaPreviewUrl])

  const clearMedia = useCallback(() => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(null)
    setMediaPreviewUrl(null)
    setMediaSizeError(false)
    if (mediaInputRef.current) mediaInputRef.current.value = ''
  }, [mediaPreviewUrl])

  const handleSubmit = useCallback(async () => {
    if (!navigator.onLine) { setSubmitError(t('err_offline')); return }
    setSubmitting(true)
    setSubmitError(null)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    try {
      let sessionId = sessionStorage.getItem('fl_session_id')
      if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem('fl_session_id', sessionId) }
      const reportResponse = await fetch('/api/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ lat, lon, distance_band: distanceBand, event_types: eventTypes, session_id: sessionId }),
      })
      clearTimeout(timeoutId)
      if (!reportResponse.ok) {
        const errorData = (await reportResponse.json()) as { error?: string }
        throw new Error(errorData.error ?? 'Failed to submit report')
      }
      const reportData = (await reportResponse.json()) as { success: boolean; id: string }
      const reportId = reportData.id
      localStorage.setItem('fl_last_report', JSON.stringify({ timestamp: Date.now(), id: reportId }))
      if (mediaFile) {
        setSubmittedReportId(reportId)
        setMediaUploading(true)
        uploadMedia(mediaFile, reportId).catch((err: unknown) => { console.error('Media upload failed:', err); setMediaUploading(false) })
      }
      setCurrentStep('success')
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') setSubmitError(t('err_timeout'))
      else if (error instanceof TypeError) setSubmitError(t('err_network'))
      else setSubmitError(error instanceof Error ? error.message : t('err_generic'))
    } finally { setSubmitting(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, distanceBand, eventTypes, mediaFile, lang])

  const handleWarningSubmit = useCallback(async () => {
    if (!navigator.onLine) { setSubmitError(t('err_offline')); return }
    setSubmitting(true)
    setSubmitError(null)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    try {
      let sessionId = sessionStorage.getItem('fl_session_id')
      if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem('fl_session_id', sessionId) }
      const res = await fetch('/api/warnings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ lat, lon, warning_type: warningType, source_detail: sourceDetail || undefined, session_id: sessionId }),
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? 'Failed to submit warning')
      }
      localStorage.setItem('fl_last_warning', JSON.stringify({ timestamp: Date.now() }))
      setWarningStep('success')
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') setSubmitError(t('err_timeout'))
      else if (error instanceof TypeError) setSubmitError(t('err_network'))
      else setSubmitError(error instanceof Error ? error.message : t('err_generic'))
    } finally { setSubmitting(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, warningType, sourceDetail, lang])

  const uploadMedia = useCallback(async (file: File, reportId: string): Promise<void> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('report_id', reportId)
    const uploadController = new AbortController()
    const uploadTimeoutId = setTimeout(() => uploadController.abort(), 200000)
    let response: Response
    try { response = await fetch('/api/media', { method: 'POST', body: formData, signal: uploadController.signal }) }
    finally { clearTimeout(uploadTimeoutId) }
    if (!response.ok) throw new Error('Media upload failed')
    const data = (await response.json()) as { success: boolean; url: string; faces_detected: number }
    if (data.success) { setMediaUploading(false); setMediaUploadComplete(true) }
  }, [])

  const handleShare = useCallback(async () => {
    const url = window.location.origin + '/report'
    if (navigator.share) {
      try { await navigator.share({ title: 'Forrest Labs', url }) } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(url); setShareButtonText('Link copied ✓'); setTimeout(() => setShareButtonText('Share'), 2000) }
      catch { /* unavailable */ }
    }
  }, [])

  const handleReportAnother = useCallback(() => {
    localStorage.removeItem('fl_last_report')
    localStorage.removeItem('fl_last_warning')
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setReportType(null)
    setCurrentStep(1)
    setWarningStep(1)
    setWarningType(null)
    setSourceDetail('')
    setGpsStatus('loading')
    setLat(BEIRUT_LAT)
    setLon(BEIRUT_LON)
    setLocationName('')
    setManualLocation('')
    setDistanceBand(null)
    setEventTypes([])
    setMediaFile(null)
    setMediaPreviewUrl(null)
    setMediaSizeError(false)
    setSubmitting(false)
    setSubmitError(null)
    setSubmittedReportId(null)
    setMediaUploading(false)
    setMediaUploadComplete(false)
    setRateLimitMinutesLeft(null)
    setShareButtonText('Share')
    // Re-trigger GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setLat(pos.coords.latitude); setLon(pos.coords.longitude); setGpsStatus('done')
          try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${pos.coords.longitude},${pos.coords.latitude}.json?access_token=${token}`)
            if (res.ok) { const data = await res.json() as { features: { place_name: string }[] }; setLocationName(data.features?.[0]?.place_name ?? '') }
          } catch { /* ignore */ }
        },
        (err) => { if (err.code === err.PERMISSION_DENIED) setGpsStatus('denied'); else setGpsStatus('error') },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else { setGpsStatus('error') }
  }, [mediaPreviewUrl])

  const changeLang = useCallback((l: Lang) => {
    setLang(l)
    try { localStorage.setItem('fl_lang', l) } catch { /* ignore */ }
  }, [])

  // ── Derived values ────────────────────────────────────────────────────────

  const effectiveLocationName = locationName || manualLocation || (gpsStatus === 'denied' || gpsStatus === 'error' ? t('beirut_area') : '')
  const step1ButtonEnabled = gpsStatus === 'done' || gpsStatus === 'denied' || gpsStatus === 'error'
  const formattedEventTypes = eventTypes.map((v) => { const l = v.replace(/_/g, ' '); return l.charAt(0).toUpperCase() + l.slice(1) }).join(', ')
  const isImage = mediaFile?.type.startsWith('image') ?? false
  const accentColor = reportType === 'warning' ? '#f97316' : '#ef4444'
  const accentDark = reportType === 'warning' ? '#1a130a' : '#1f0a0a'
  const activeWarnings = warningStep !== 'success' && reportType === 'warning'
  const activeStrike = currentStep !== 'success' && reportType === 'strike'
  const _ = submittedReportId // suppress unused warning

  // ── Language selector component ───────────────────────────────────────────

  const langSelector = (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
      {(['en', 'ar', 'fr'] as Lang[]).map((l) => (
        <button key={l} type="button" onClick={() => changeLang(l)} style={{
          padding: '4px 10px', minHeight: 32, borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
          border: lang === l ? '1px solid #ef4444' : '1px solid #1f2937',
          background: lang === l ? 'rgba(239,68,68,0.15)' : 'transparent',
          color: lang === l ? '#ef4444' : '#4b5563',
        }}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )

  // ── Shared location step JSX ──────────────────────────────────────────────

  const locationStepJSX = (
    nextFn: () => void,
    backFn: (() => void) | null,
  ) => (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>{t('step1_heading')}</h1>
      <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 28, marginTop: 0 }}>{t('step1_sub')}</p>
      {gpsStatus === 'loading' && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 16, animation: 'pulse-fade 1.5s ease-in-out infinite' }}>{t('step1_finding')}</div>
      )}
      {gpsStatus === 'done' && locationName && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: 16, color: '#ffffff', fontWeight: 500 }}>{locationName}</span>
          </div>
          <p style={{ fontSize: 16, color: '#6b7280', margin: 0 }}>{t('step1_privacy')}</p>
        </div>
      )}
      {(gpsStatus === 'denied' || gpsStatus === 'error') && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: '#ef4444', marginBottom: 12, marginTop: 0 }}>{t('step1_denied')}</p>
          <input type="text" placeholder={t('step1_manual')} value={manualLocation} onChange={(e) => setManualLocation(e.target.value)}
            style={{ width: '100%', height: 48, background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#ffffff', fontSize: 16, padding: '0 14px', boxSizing: 'border-box', outline: 'none' }} />
        </div>
      )}
      <button type="button" onClick={nextFn} disabled={!step1ButtonEnabled} style={{
        width: '100%', height: 52, background: step1ButtonEnabled ? accentColor : '#1f2937', color: step1ButtonEnabled ? '#ffffff' : '#6b7280',
        border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: step1ButtonEnabled ? 'pointer' : 'not-allowed', opacity: step1ButtonEnabled ? 1 : 0.5, marginTop: 8,
      }}>{t('step1_btn')}</button>
      {backFn && (
        <button type="button" onClick={backFn} style={{ width: '100%', height: 48, background: 'transparent', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer', marginTop: 4 }}>{t('btn_back')}</button>
      )}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ background: '#0a0a0f', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 200, color: '#ffffff' }}>
      <style>{`
        @keyframes pulse-fade { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 20px 0' }}>
        {/* ── Rate limit ────────────────────────────────────────────────── */}
        {rateLimitMinutesLeft !== null ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 80px)', textAlign: 'center', gap: 16 }}>
            <div style={{ fontSize: 48 }}>⏳</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', margin: 0 }}>{t('rate_limit_heading')}</h1>
            <p style={{ fontSize: 16, color: '#9ca3af', lineHeight: 1.6, maxWidth: 280, margin: 0 }}>
              {t('rate_limit_pre')} {rateLimitMinutesAgo} {rateLimitMinutesAgo !== 1 ? t('rate_limit_mins') : t('rate_limit_min')}{t('rate_limit_mid')} {rateLimitMinutesLeft} {rateLimitMinutesLeft !== 1 ? t('rate_limit_mins') : t('rate_limit_min')}.
            </p>
            <a href="/map" style={{ color: '#ef4444', fontSize: 16, textDecoration: 'none', marginTop: 8 }}>{t('btn_view_map')} →</a>
          </div>

        /* ── Step 0: Report type selection ──────────────────────────────── */
        ) : reportType === null ? (
          <div>
            {langSelector}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
              <span style={{ color: '#ef4444', fontSize: 16, letterSpacing: '0.2em', fontWeight: 500, textTransform: 'uppercase' }}>Forrest Labs</span>
              <a href="/map" style={{ color: '#9ca3af', fontSize: 16, textDecoration: 'none' }}>{t('live_map')}</a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 340, margin: '0 auto' }}>
              {/* Card A — Strike */}
              <div onClick={() => { setReportType('strike'); setCurrentStep(1) }} style={{
                background: '#1a0a0a', border: '1.5px solid #ef4444', borderRadius: 12, padding: 20, cursor: 'pointer', position: 'relative',
                boxShadow: '0 0 20px rgba(239,68,68,0.15)',
              }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ef4444', marginBottom: 12, animation: 'pulse-fade 1.4s ease-in-out infinite' }} />
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#ffffff', margin: '0 0 6px 0' }}>{t('step0_strike')}</h2>
                <p style={{ fontSize: 16, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>{t('step0_strike_sub')}</p>
                <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8, marginBottom: 0 }}>{t('step0_strike_time')}</p>
                <span style={{ position: 'absolute', bottom: 20, right: 20, color: '#ef4444', fontSize: 16, fontWeight: 600 }}>→</span>
              </div>

              {/* Card B — Warning */}
              <div onClick={() => { setReportType('warning'); setWarningStep(1) }} style={{
                background: '#1a130a', border: '1.5px solid #f97316', borderRadius: 12, padding: 20, cursor: 'pointer', position: 'relative',
                boxShadow: '0 0 20px rgba(249,115,22,0.15)',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 12 }}>
                  <path d="M12 3L22 20H2L12 3Z" stroke="#f97316" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
                </svg>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#ffffff', margin: '0 0 6px 0' }}>{t('step0_warning')}</h2>
                <p style={{ fontSize: 16, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>{t('step0_warning_sub')}</p>
                <p style={{ fontSize: 12, color: '#f97316', marginTop: 8, marginBottom: 0 }}>{t('step0_warning_time')}</p>
                <span style={{ position: 'absolute', bottom: 20, right: 20, color: '#f97316', fontSize: 16, fontWeight: 600 }}>→</span>
              </div>
            </div>

            {/* Active warnings indicator */}
            {activeWarningCount !== null && (
              <p style={{ fontSize: 12, color: activeWarningCount > 0 ? '#f97316' : '#4b5563', textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
                {activeWarningCount > 0 ? `${activeWarningCount} ${t('step0_active_warnings')}` : t('step0_no_warnings')}
              </p>
            )}

            <p style={{ fontSize: 16, color: '#4b5563', textAlign: 'center', marginTop: 12 }}>{t('anon_note')}</p>
          </div>

        /* ── Warning success screen ────────────────────────────────────── */
        ) : reportType === 'warning' && warningStep === 'success' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: '#1a130a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 12 l4 4 l8-8" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginTop: 20, marginBottom: 0 }}>{t('warn_success_heading')}</h1>
            <p style={{ fontSize: 16, color: '#9ca3af', textAlign: 'center', maxWidth: 280, lineHeight: 1.6, marginTop: 8, marginBottom: 0 }}>{t('warn_success_sub')}</p>
            <div style={{ background: '#1a130a', border: '1px solid #f97316', borderRadius: 8, padding: 14, marginTop: 20, maxWidth: 320, width: '100%', boxSizing: 'border-box' }}>
              <p style={{ fontSize: 16, color: '#fdba74', margin: 0, lineHeight: 1.6 }}>{t('warn_stay_safe')}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 32, width: '100%', maxWidth: 320 }}>
              <a href={`/map?lat=${lat}&lon=${lon}&zoom=14`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, background: '#f97316', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: 'none', boxSizing: 'border-box' }}>{t('btn_view_map')}</a>
              <button type="button" onClick={async () => {
                const text = `⚠️ Evacuation warning reported near ${effectiveLocationName || 'my area'}. Check live map: ${window.location.origin}/map`
                try { await navigator.clipboard.writeText(text); setCopyWarningText(t('copied')); setTimeout(() => setCopyWarningText('copy'), 2000) } catch { /* ignore */ }
              }} style={{ height: 52, background: 'transparent', border: '1px solid #f97316', color: '#f97316', borderRadius: 8, fontSize: 16, cursor: 'pointer', width: '100%' }}>
                {copyWarningText === 'copy' ? t('copy_warning') : copyWarningText}
              </button>
              <button type="button" onClick={handleShare} style={{ height: 52, background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8, fontSize: 16, cursor: 'pointer', width: '100%' }}>{shareButtonText === 'Share' ? t('btn_share') : shareButtonText}</button>
              <button type="button" onClick={handleReportAnother} style={{ height: 52, background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8, fontSize: 16, cursor: 'pointer', width: '100%' }}>{t('btn_report_another')}</button>
            </div>
          </div>

        /* ── Strike success screen ─────────────────────────────────────── */
        ) : reportType === 'strike' && currentStep === 'success' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: '#052e16', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 12 l4 4 l8-8" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginTop: 20, marginBottom: 0 }}>{t('success_heading')}</h1>
            <p style={{ fontSize: 16, color: '#9ca3af', textAlign: 'center', maxWidth: 280, lineHeight: 1.6, marginTop: 8, marginBottom: 0 }}>{t('success_sub')}</p>
            {mediaUploading && <p style={{ fontSize: 16, color: '#6b7280', marginTop: 12, marginBottom: 0 }}>{t('success_media_uploading')}</p>}
            {mediaUploadComplete && <p style={{ fontSize: 16, color: '#6b7280', marginTop: 12, marginBottom: 0 }}>{t('success_media_done')}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 32, width: '100%', maxWidth: 320 }}>
              <a href="/map" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, background: '#ef4444', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: 600, textDecoration: 'none', boxSizing: 'border-box' }}>{t('btn_view_map')}</a>
              <button type="button" onClick={handleShare} style={{ height: 52, background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8, fontSize: 16, cursor: 'pointer', width: '100%' }}>{shareButtonText === 'Share' ? t('btn_share') : shareButtonText}</button>
              <button type="button" onClick={handleReportAnother} style={{ height: 52, background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8, fontSize: 16, cursor: 'pointer', width: '100%' }}>{t('btn_report_another')}</button>
            </div>
          </div>

        /* ── Warning flow / Strike flow ─────────────────────────────────── */
        ) : (
          <>
            {/* Shared header */}
            {langSelector}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ color: '#ef4444', fontSize: 16, letterSpacing: '0.2em', fontWeight: 500, textTransform: 'uppercase' }}>Forrest Labs</span>
              <a href="/map" style={{ color: '#9ca3af', fontSize: 16, textDecoration: 'none' }}>{t('live_map')}</a>
            </div>

            {/* Progress dots */}
            {reportType === 'warning' ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: i < (warningStep as number) ? '#f97316' : i === (warningStep as number) ? '#ffffff' : '#374151', transition: 'background 0.2s' }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32 }} role="progressbar" aria-valuenow={currentStep as number} aria-valuemin={1} aria-valuemax={5}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: i < (currentStep as number) ? '#ef4444' : i === (currentStep as number) ? '#ffffff' : '#374151', transition: 'background 0.2s' }} />
                ))}
              </div>
            )}

            {/* ── WARNING STEPS ─────────────────────────────────────────── */}
            {activeWarnings && warningStep === 1 && locationStepJSX(
              () => setWarningStep(2),
              () => { setReportType(null); setWarningStep(1) },
            )}

            {activeWarnings && warningStep === 2 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>{t('warn_step2_heading')}</h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, marginTop: 20 }}>
                  {WARNING_OPTIONS.map((opt) => {
                    const selected = warningType === opt.value
                    const iconColor = selected ? '#fb923c' : '#4b5563'
                    const iconMap: Record<WarningType, React.ReactNode> = {
                      official_order: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="5" width="6" height="6" rx="1" stroke={iconColor} strokeWidth="1.5" /><path d="M7 6L14 3V13L7 10" stroke={iconColor} strokeWidth="1.5" strokeLinejoin="round" /></svg>,
                      phone_call: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2C3 2 4 2 5 4C5.5 5 4.5 6 4 6.5C4 6.5 5.5 9 8 10.5C8.5 10 9.5 9 10.5 9.5C12.5 10.5 12.5 11.5 12.5 11.5C12.5 13 11 14 9 13C6 11.5 3.5 8.5 2 5.5C1 3.5 2 2 3 2Z" stroke={iconColor} strokeWidth="1.3" fill="none" /></svg>,
                      leaflet_drop: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="1" width="10" height="14" rx="1.5" stroke={iconColor} strokeWidth="1.3" /><line x1="5.5" y1="5" x2="10.5" y2="5" stroke={iconColor} strokeWidth="1" /><line x1="5.5" y1="8" x2="10.5" y2="8" stroke={iconColor} strokeWidth="1" /><line x1="5.5" y1="11" x2="8.5" y2="11" stroke={iconColor} strokeWidth="1" /></svg>,
                      community_warning: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="4" r="2" stroke={iconColor} strokeWidth="1.2" /><circle cx="10.5" cy="4" r="2" stroke={iconColor} strokeWidth="1.2" /><path d="M1 13C1 10 3 9 5.5 9C6.5 9 7 9.2 7.5 9.5" stroke={iconColor} strokeWidth="1.2" /><path d="M15 13C15 10 13 9 10.5 9C9.5 9 9 9.2 8.5 9.5" stroke={iconColor} strokeWidth="1.2" /></svg>,
                      other: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke={iconColor} strokeWidth="1.3" /><path d="M6 6C6 4.5 7 4 8 4C9 4 10 4.8 10 6C10 7 9 7.3 8 8V9" stroke={iconColor} strokeWidth="1.2" strokeLinecap="round" fill="none" /><circle cx="8" cy="11.5" r="0.7" fill={iconColor} /></svg>,
                    }
                    return (
                      <button key={opt.value} type="button" onClick={() => setWarningType(opt.value)} style={{
                        minHeight: 64, borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', width: '100%', boxSizing: 'border-box',
                        background: selected ? 'rgba(249,115,22,0.1)' : '#0f172a', border: selected ? '1.5px solid #f97316' : '1px solid #1f2937',
                      }}>
                        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{iconMap[opt.value]}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 16, color: '#ffffff' }}>{t(opt.label)}</span>
                          <span style={{ fontSize: 12, color: '#6b7280' }}>{t(opt.sub)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {warningType && (
                  <button type="button" onClick={() => setWarningStep(3)} style={{ width: '100%', height: 52, background: '#f97316', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>{t('btn_continue')}</button>
                )}
                <button type="button" onClick={() => setWarningStep(1)} style={{ width: '100%', height: 48, background: 'transparent', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer' }}>{t('btn_back')}</button>
              </div>
            )}

            {activeWarnings && warningStep === 3 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>{t('warn_step3_heading')}</h1>
                <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 12, marginTop: 0 }}>{t('warn_step3_sub')}</p>
                {/* Example chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {EXAMPLE_CHIPS.map((chip) => (
                    <button key={chip} type="button" onClick={() => setSourceDetail(chip)} style={{
                      background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', color: '#fdba74',
                      borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                    }}>{chip}</button>
                  ))}
                </div>
                <textarea value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} maxLength={200} placeholder={t('warn_step3_placeholder')}
                  style={{ width: '100%', minHeight: 80, background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#ffffff', fontSize: 16, padding: 12, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
                <p style={{ fontSize: 14, color: sourceDetail.length > 170 ? '#ef4444' : sourceDetail.length > 100 ? '#f97316' : '#6b7280', textAlign: 'right', margin: '4px 0 16px 0' }}>{sourceDetail.length} / 200</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button type="button" onClick={() => setWarningStep(4)} style={{ flex: 1, height: 52, background: 'transparent', border: '1px solid #f97316', color: '#f97316', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}>{t('step4_skip')}</button>
                  <button type="button" onClick={() => setWarningStep(4)} style={{ flex: 2, height: 52, background: '#f97316', border: 'none', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>{t('btn_continue')}</button>
                </div>
                <button type="button" onClick={() => setWarningStep(2)} style={{ width: '100%', height: 48, background: 'transparent', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer' }}>{t('btn_back')}</button>
              </div>
            )}

            {activeWarnings && warningStep === 4 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 24, marginTop: 0 }}>{t('warn_step4_heading')}</h1>
                <div style={{ background: '#1a130a', border: '1px solid #f97316', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  <p style={{ fontSize: 16, fontWeight: 500, color: '#ffffff', margin: '0 0 8px 0' }}>{effectiveLocationName || t('beirut_area')}</p>
                  {warningType && <p style={{ fontSize: 16, color: '#fdba74', margin: '0 0 4px 0' }}>{formatWarningType(warningType)}</p>}
                  {sourceDetail && <p style={{ fontSize: 16, color: '#fdba74', margin: '0 0 4px 0' }}>{sourceDetail.length > 100 ? sourceDetail.slice(0, 100) + '…' : sourceDetail}</p>}
                  <p style={{ fontSize: 16, color: '#6b7280', margin: '8px 0 0 0' }}>{t('anon_note')}</p>
                </div>
                <p style={{ fontSize: 16, color: '#6b7280', lineHeight: 1.6, marginBottom: 24, marginTop: 0 }}>{t('warn_combine')}</p>
                <button type="button" onClick={handleWarningSubmit} disabled={submitting} style={{
                  width: '100%', height: 56, background: submitting ? '#9a3412' : '#f97316', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10, boxSizing: 'border-box',
                }}>
                  {submitting ? (<><span style={{ display: 'inline-block', width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid #ffffff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />{t('submitting')}</>) : t('warn_submit_btn')}
                </button>
                {submitError && <p style={{ fontSize: 16, color: '#ef4444', textAlign: 'center', marginTop: 12, lineHeight: 1.5, marginBottom: 0 }}>{submitError}</p>}
                <button type="button" onClick={() => setWarningStep(3)} disabled={submitting} style={{ width: '100%', height: 48, background: 'transparent', border: 'none', color: '#6b7280', fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer' }}>{t('btn_back')}</button>
              </div>
            )}

            {/* ── STRIKE STEPS ──────────────────────────────────────────── */}
            {activeStrike && currentStep === 1 && locationStepJSX(
              () => setCurrentStep(2),
              () => { setReportType(null); setCurrentStep(1) },
            )}

            {activeStrike && currentStep === 2 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>{t('step2_heading')}</h1>
                <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 28, marginTop: 0 }}>{t('step2_sub')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
                  {DISTANCE_KEYS.map((card) => {
                    const selected = distanceBand === card.value
                    const svgSize = (card.r + card.strokeWidth) * 2 + 4
                    return (
                      <div key={card.value} onClick={() => setDistanceBand(card.value)} style={{
                        background: selected ? accentDark : '#111827', border: selected ? `2px solid ${accentColor}` : '1px solid #1f2937',
                        borderRadius: 10, padding: 16, minHeight: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      }}>
                        <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}><circle cx={svgSize / 2} cy={svgSize / 2} r={card.r} fill="none" stroke={card.stroke} strokeWidth={card.strokeWidth} /></svg>
                        <span style={{ fontSize: 16, fontWeight: 500, color: '#ffffff', marginTop: 8, textAlign: 'center' }}>{t(card.label)}</span>
                        <span style={{ fontSize: 16, color: '#9ca3af', marginTop: 2, textAlign: 'center' }}>{t(card.range)}</span>
                      </div>
                    )
                  })}
                </div>
                {distanceBand && <button type="button" onClick={() => setCurrentStep(3)} style={{ width: '100%', height: 52, background: '#ef4444', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>{t('btn_continue')}</button>}
                <button type="button" onClick={() => setCurrentStep(1)} style={{ width: '100%', height: 48, background: 'transparent', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer' }}>{t('btn_back')}</button>
              </div>
            )}

            {activeStrike && currentStep === 3 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>{t('step3_heading')}</h1>
                <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 28, marginTop: 0 }}>{t('step3_sub')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {EVENT_KEYS.map((btn) => {
                    const selected = eventTypes.includes(btn.value)
                    return (
                      <button key={btn.value} type="button" onClick={() => toggleEvent(btn.value)} style={{
                        minHeight: 56, borderRadius: 8, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
                        background: selected ? '#111827' : '#0f172a', border: selected ? '1.5px solid #ef4444' : '1px solid #1f2937', width: '100%', boxSizing: 'border-box',
                      }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: btn.colour, flexShrink: 0 }} />
                        <span style={{ fontSize: 16, color: '#ffffff' }}>{t(btn.label)}</span>
                      </button>
                    )
                  })}
                </div>
                {eventTypes.length > 0 && <button type="button" onClick={() => setCurrentStep(4)} style={{ width: '100%', height: 52, background: '#ef4444', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>{t('btn_continue')}</button>}
                <button type="button" onClick={() => setCurrentStep(2)} style={{ width: '100%', height: 48, background: 'transparent', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer' }}>{t('btn_back')}</button>
              </div>
            )}

            {activeStrike && currentStep === 4 && (
              <div>
                <div style={{ marginBottom: 10 }}>
                  <span style={{ display: 'inline-block', background: '#1e1b4b', color: '#a5b4fc', borderRadius: 20, padding: '3px 10px', fontSize: 16 }}>{t('step4_badge')}</span>
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 6, marginTop: 0 }}>{t('step4_heading')}</h1>
                <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 28, marginTop: 0 }}>&nbsp;</p>
                {!mediaPreviewUrl ? (
                  <div onClick={() => mediaInputRef.current?.click()} style={{ border: '1.5px dashed #374151', borderRadius: 10, minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', background: '#0f172a', marginBottom: 16 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><line x1="12" y1="16" x2="12" y2="4" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /><polyline points="8,8 12,4 16,8" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><line x1="4" y1="20" x2="20" y2="20" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
                    <span style={{ fontSize: 16, color: '#9ca3af' }}>{t('step4_upload')}</span>
                    <span style={{ fontSize: 16, color: '#4b5563' }}>{t('step4_blur')}</span>
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaPreviewUrl} alt="Selected photo" style={{ width: '100%', maxHeight: 160, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <video src={mediaPreviewUrl} style={{ width: '100%', maxHeight: 160, borderRadius: 8, display: 'block' }} controls muted />
                    )}
                    <p style={{ fontSize: 16, color: '#9ca3af', marginTop: 6, marginBottom: 4 }}>{mediaFile && mediaFile.name.length > 30 ? mediaFile.name.slice(0, 30) + '…' : mediaFile?.name}</p>
                    <button type="button" onClick={clearMedia} style={{ fontSize: 16, color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>{t('btn_remove')}</button>
                  </div>
                )}
                {mediaSizeError && <p style={{ fontSize: 16, color: '#ef4444', marginBottom: 12, marginTop: 0 }}>{t('file_too_large')}</p>}
                <input ref={mediaInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={(e) => handleMediaFile(e.target.files?.[0])} />
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button type="button" onClick={() => setCurrentStep(5)} style={{ flex: 1, height: 52, background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}>{t('step4_skip')}</button>
                  <button type="button" onClick={() => setCurrentStep(5)} style={{ flex: 2, height: 52, background: '#ef4444', border: 'none', color: '#ffffff', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>{t('btn_continue')}</button>
                </div>
                <button type="button" onClick={() => setCurrentStep(3)} style={{ width: '100%', height: 48, background: 'transparent', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer' }}>{t('btn_back')}</button>
              </div>
            )}

            {activeStrike && currentStep === 5 && (
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 24, marginTop: 0 }}>{t('step5_heading')}</h1>
                <div style={{ background: '#052e16', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  <p style={{ fontSize: 16, fontWeight: 500, color: '#ffffff', margin: '0 0 8px 0' }}>{effectiveLocationName || t('beirut_area')}</p>
                  {distanceBand && <p style={{ fontSize: 16, color: '#86efac', margin: '0 0 4px 0' }}>{DISTANCE_LABELS[distanceBand]}</p>}
                  {formattedEventTypes && <p style={{ fontSize: 16, color: '#86efac', margin: '0 0 4px 0' }}>{formattedEventTypes}</p>}
                  {mediaFile && <p style={{ fontSize: 16, color: '#86efac', margin: '0' }}>{isImage ? t('photo_attached') : t('video_attached')}</p>}
                </div>
                <p style={{ fontSize: 16, color: '#6b7280', lineHeight: 1.6, marginBottom: 24, marginTop: 0 }}>{t('step5_anon')}</p>
                <button type="button" onClick={handleSubmit} disabled={submitting} style={{
                  width: '100%', height: 56, background: submitting ? '#991b1b' : '#ef4444', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10, boxSizing: 'border-box',
                }}>
                  {submitting ? (<><span style={{ display: 'inline-block', width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid #ffffff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />{t('submitting')}</>) : t('submit_btn')}
                </button>
                {submitError && <p style={{ fontSize: 16, color: '#ef4444', textAlign: 'center', marginTop: 12, lineHeight: 1.5, marginBottom: 0 }}>{submitError}</p>}
                <button type="button" onClick={() => setCurrentStep(4)} disabled={submitting} style={{ width: '100%', height: 48, background: 'transparent', border: 'none', color: '#6b7280', fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer' }}>{t('btn_back')}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
