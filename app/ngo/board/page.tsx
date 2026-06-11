'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useNewPanicAlert } from '@/lib/use-new-panic-alert'
import { useConfirm, useToast } from '@/lib/ngo-ui'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'
import { StatusPill, ModalShell, TeamPicker, RecallDialog, type PickableTeam } from '@/lib/ngo-dispatch-ui'

const BLANG = {
  en: {
    st_official_verified: 'Official', st_news_verified: 'News verified', st_confirmed: 'Confirmed', st_auto_confirmed: 'Auto',
    disp_assigned: 'Assigned', disp_en_route: 'En route', disp_on_scene: 'On scene', disp_done: 'Done', disp_cancelled: 'Cancelled',
    'style_dark': 'Dark', 'style_streets': 'Streets', 'style_satellite': 'Satellite', 'style_sat-streets': 'Satellite + roads',
    legend: 'Legend', leg_incidents: 'Incidents', leg_teams: 'Teams', leg_markers: 'Markers', leg_confirmed: 'Confirmed', leg_auto: 'Auto-confirmed', leg_news: 'News verified', leg_official: 'Official', leg_standby: 'Standby', leg_deployed: 'Deployed', leg_unavailable: 'Unavailable', leg_off_duty: 'Off duty', leg_panic: '🆘 Panic / unassigned', leg_worker: 'Worker / facility open',
    loading: 'Loading…', offline: 'Offline', cant_refresh: 'Couldn’t refresh', updated: 'updated', retry: 'Retry', workers: 'Workers', facilities: 'Facilities', search_ph: 'Search a place…', locate: 'Find my location',
    ps_active: 'active panic', ps_active_pl: 'active panics', ps_unack: 'unacknowledged', ps_all_ack: 'all acknowledged', ps_tap: 'tap to respond',
    assign: 'Assign', dismiss: 'Dismiss', recall: 'Recall', resolve: 'Resolve', acknowledge: 'Acknowledge', call: 'Call', send_team: 'Send team', locate_btn: 'Locate', unassigned: 'unassigned', last_known: 'Last known', no_location: 'No location', ack_by: 'Acknowledged by', not_acked: 'Not yet acknowledged', updated_w: 'Updated', last_seen: 'Last seen', duress: 'duress', reports: 'reports', report: 'report',
    inc_title: 'Incidents', new_incident: '+ New incident', click_map: 'Click the map to place the incident, or type an address below.', type_address: 'Type an address…', find: 'Find', no_active_inc: 'No active incidents.',
    silent: 'silent', last_known_lc: 'last known', no_location_lc: 'no location',
    rc_title: 'Roll call', rc_new: 'New roll call', rc_start: 'Roll call', rc_of: 'of', rc_safe: 'safe', awaiting: 'awaiting', unsafe: 'unsafe', rc_none: 'No active roll call.', rc_all_off: 'All field coordinators off duty.', rc_no_fc: 'No field coordinators.', rc_off_exempt: '🌙 Off duty (exempt):',
    feed_title: 'Incident feed', in_area: 'in your area', all_assigned: 'all assigned', range_all: 'All', no_in_area: 'No incidents in your operational area.', locating: 'Locating…', response: 'response',
    handled: 'Handled', nothing_handled: 'Nothing handled yet. Dismissed incidents and those a team completed appear here.', completed: '✓ Completed', dismissed_w: 'Dismissed', resolved_w: '✓ Resolved', incident_w: 'incident', reopen: 'Reopen',
    ni_title: 'New incident', ni_title_ph: 'Title (what’s happening)', ni_details_ph: 'Details for the responding team…', creating: 'Creating…', create_inc: 'Create incident', cancel: 'Cancel',
    ai_title: 'Assign a team —', alerted_push: 'team alerted by push', no_teams: 'No teams.', no_app: '⚠ no app access',
    pd_title: 'Send a team to', pd_last_seen: 'Last seen', pd_no_loc: 'No location reported', pd_alerted: 'the team is alerted by push.',
    rp_title: 'Resolve', rp_poss: '’s panic', rp_note: 'Only resolve once the person is confirmed safe. A meaningful outcome note (at least 10 characters) is required.', rp_ph: 'What happened / outcome…',
    rec_title: 'Recall', rec_note: 'The team is told to stand down and the incident reopens as a coverage gap.', reason_opt: 'Reason (optional)',
    as_title: 'Assign a team', note_opt: 'Note (optional)', no_teams_avail: 'No teams available.', match: '✓match', km: 'km', no_loc: 'no loc', busy_w: 'busy', no_app_members: '⚠ No members with app access — they won’t be notified',
    t_inc_resolved: 'Incident resolved', t_e_resolve: 'Could not resolve incident', t_dismissed: 'Incident dismissed', t_reopened: 'Incident reopened', t_action_fail: 'Action failed', t_dispatched: 'Team dispatched', t_e_dispatch: 'Could not dispatch team', t_panic_resolved: 'Panic resolved', t_e_resolve2: 'Could not resolve', t_panic_ack: 'Panic acknowledged', t_team_sent: 'Team sent', t_e_send: 'Could not send team', t_inc_created: 'Incident created', t_e_create: 'Could not create incident', t_team_recalled: 'Team recalled', t_e_recall: 'Could not recall team', change_team: 'Change team', change_incident: 'Change incident', rs_currently: 'Currently', rs_swap_note: 'The new team is dispatched; the current team stands down.', rs_no_other_teams: 'No other teams.', rs_move_to_inc: 'Move this team to another incident:', rs_no_other_inc: 'No other in-area incidents.', t_reassigned: 'Dispatch reassigned', t_team_reassigned: 'Team reassigned', t_e_reassign: 'Could not reassign', t_loc_fail: 'Could not get your location — check permissions', t_loc_na: 'Location not available on this device',
    cf_resolve_t: 'Mark this incident resolved?', cf_resolve_b: 'It leaves the board.', cf_dismiss_cluster: 'Dismiss this incident? It leaves your board but can be reopened. The public verification is unaffected.', cf_dismiss_custom: 'Dismiss this incident? It leaves the board but can be reopened.',
  },
  fr: {
    st_official_verified: 'Officiel', st_news_verified: 'Vérifié (presse)', st_confirmed: 'Confirmé', st_auto_confirmed: 'Auto',
    disp_assigned: 'Assigné', disp_en_route: 'En route', disp_on_scene: 'Sur place', disp_done: 'Terminé', disp_cancelled: 'Annulé',
    'style_dark': 'Sombre', 'style_streets': 'Rues', 'style_satellite': 'Satellite', 'style_sat-streets': 'Satellite + routes',
    legend: 'Légende', leg_incidents: 'Incidents', leg_teams: 'Équipes', leg_markers: 'Repères', leg_confirmed: 'Confirmé', leg_auto: 'Auto-confirmé', leg_news: 'Vérifié (presse)', leg_official: 'Officiel', leg_standby: 'En attente', leg_deployed: 'Déployé', leg_unavailable: 'Indisponible', leg_off_duty: 'Hors service', leg_panic: '🆘 Panique / non assigné', leg_worker: 'Agent / établissement ouvert',
    loading: 'Chargement…', offline: 'Hors ligne', cant_refresh: 'Échec de l’actualisation', updated: 'mis à jour', retry: 'Réessayer', workers: 'Agents', facilities: 'Établissements', search_ph: 'Rechercher un lieu…', locate: 'Ma position',
    ps_active: 'panique active', ps_active_pl: 'paniques actives', ps_unack: 'non confirmée(s)', ps_all_ack: 'toutes confirmées', ps_tap: 'touchez pour répondre',
    assign: 'Assigner', dismiss: 'Rejeter', recall: 'Rappeler', resolve: 'Clôturer', acknowledge: 'Confirmer', call: 'Appeler', send_team: 'Envoyer une équipe', locate_btn: 'Localiser', unassigned: 'non assigné', last_known: 'Dernière position', no_location: 'Sans position', ack_by: 'Confirmé par', not_acked: 'Pas encore confirmé', updated_w: 'Mis à jour', last_seen: 'Vu', duress: 'détresse', reports: 'signalements', report: 'signalement',
    inc_title: 'Incidents', new_incident: '+ Nouvel incident', click_map: 'Cliquez sur la carte pour placer l’incident, ou tapez une adresse ci-dessous.', type_address: 'Tapez une adresse…', find: 'Chercher', no_active_inc: 'Aucun incident actif.',
    silent: 'silencieux', last_known_lc: 'dernière position', no_location_lc: 'sans position',
    rc_title: 'Appel', rc_new: 'Nouvel appel', rc_start: 'Appel', rc_of: 'sur', rc_safe: 'en sécurité', awaiting: 'en attente', unsafe: 'en danger', rc_none: 'Aucun appel actif.', rc_all_off: 'Tous les coordinateurs hors service.', rc_no_fc: 'Aucun coordinateur de terrain.', rc_off_exempt: '🌙 Hors service (exemptés) :',
    feed_title: 'Fil des incidents', in_area: 'dans votre zone', all_assigned: 'tous assignés', range_all: 'Tout', no_in_area: 'Aucun incident dans votre zone opérationnelle.', locating: 'Localisation…', response: 'réponse',
    handled: 'Traités', nothing_handled: 'Rien de traité. Les incidents rejetés et ceux qu’une équipe a terminés apparaissent ici.', completed: '✓ Terminé', dismissed_w: 'Rejeté', resolved_w: '✓ Résolu', incident_w: 'incident', reopen: 'Rouvrir',
    ni_title: 'Nouvel incident', ni_title_ph: 'Titre (ce qui se passe)', ni_details_ph: 'Détails pour l’équipe qui répond…', creating: 'Création…', create_inc: 'Créer l’incident', cancel: 'Annuler',
    ai_title: 'Assigner une équipe —', alerted_push: 'équipe alertée par notification', no_teams: 'Aucune équipe.', no_app: '⚠ sans accès à l’app',
    pd_title: 'Envoyer une équipe à', pd_last_seen: 'Vu', pd_no_loc: 'Aucune position signalée', pd_alerted: 'l’équipe est alertée par notification.',
    rp_title: 'Clôturer la panique de', rp_poss: '', rp_note: 'Ne clôturez qu’une fois la personne en sécurité. Une note d’issue (au moins 10 caractères) est requise.', rp_ph: 'Ce qui s’est passé / issue…',
    rec_title: 'Rappeler', rec_note: 'L’équipe se retire et l’incident redevient une lacune de couverture.', reason_opt: 'Raison (facultatif)',
    as_title: 'Assigner une équipe', note_opt: 'Note (facultatif)', no_teams_avail: 'Aucune équipe disponible.', match: '✓correspond', km: 'km', no_loc: 'sans pos.', busy_w: 'occupé', no_app_members: '⚠ Aucun membre avec accès à l’app — ils ne seront pas notifiés',
    t_inc_resolved: 'Incident résolu', t_e_resolve: 'Impossible de résoudre l’incident', t_dismissed: 'Incident rejeté', t_reopened: 'Incident rouvert', t_action_fail: 'Échec de l’action', t_dispatched: 'Équipe déployée', t_e_dispatch: 'Impossible de déployer l’équipe', t_panic_resolved: 'Panique clôturée', t_e_resolve2: 'Impossible de clôturer', t_panic_ack: 'Panique confirmée', t_team_sent: 'Équipe envoyée', t_e_send: 'Impossible d’envoyer l’équipe', t_inc_created: 'Incident créé', t_e_create: 'Impossible de créer l’incident', t_team_recalled: 'Équipe rappelée', t_e_recall: 'Impossible de rappeler l’équipe', change_team: 'Changer d’équipe', change_incident: 'Changer d’incident', rs_currently: 'Actuellement', rs_swap_note: 'La nouvelle équipe est déployée ; l’équipe actuelle se retire.', rs_no_other_teams: 'Aucune autre équipe.', rs_move_to_inc: 'Déplacer cette équipe vers un autre incident :', rs_no_other_inc: 'Aucun autre incident dans la zone.', t_reassigned: 'Déploiement réaffecté', t_team_reassigned: 'Équipe réaffectée', t_e_reassign: 'Échec de la réaffectation', t_loc_fail: 'Impossible d’obtenir votre position — vérifiez les autorisations', t_loc_na: 'Localisation non disponible sur cet appareil',
    cf_resolve_t: 'Marquer cet incident comme résolu ?', cf_resolve_b: 'Il quitte le tableau.', cf_dismiss_cluster: 'Rejeter cet incident ? Il quitte votre tableau mais peut être rouvert. La vérification publique n’est pas affectée.', cf_dismiss_custom: 'Rejeter cet incident ? Il quitte le tableau mais peut être rouvert.',
  },
  ar: {
    st_official_verified: 'رسمي', st_news_verified: 'مؤكَّد إعلامياً', st_confirmed: 'مؤكَّد', st_auto_confirmed: 'تلقائي',
    disp_assigned: 'مُكلّف', disp_en_route: 'في الطريق', disp_on_scene: 'في الموقع', disp_done: 'منجز', disp_cancelled: 'ملغى',
    'style_dark': 'داكن', 'style_streets': 'شوارع', 'style_satellite': 'قمر صناعي', 'style_sat-streets': 'قمر صناعي + طرق',
    legend: 'مفتاح', leg_incidents: 'الحوادث', leg_teams: 'الفِرق', leg_markers: 'العلامات', leg_confirmed: 'مؤكَّد', leg_auto: 'مؤكَّد تلقائياً', leg_news: 'مؤكَّد إعلامياً', leg_official: 'رسمي', leg_standby: 'جاهز', leg_deployed: 'منتشر', leg_unavailable: 'غير متاح', leg_off_duty: 'خارج الخدمة', leg_panic: '🆘 استغاثة / غير معيّن', leg_worker: 'عامل / مرفق مفتوح',
    loading: 'جارٍ التحميل…', offline: 'غير متصل', cant_refresh: 'تعذّر التحديث', updated: 'آخر تحديث', retry: 'إعادة', workers: 'العاملون', facilities: 'المرافق', search_ph: 'ابحث عن مكان…', locate: 'موقعي',
    ps_active: 'استغاثة نشطة', ps_active_pl: 'استغاثات نشطة', ps_unack: 'غير مؤكَّدة', ps_all_ack: 'الكل مؤكَّد', ps_tap: 'اضغط للاستجابة',
    assign: 'تعيين', dismiss: 'رفض', recall: 'استدعاء', resolve: 'إنهاء', acknowledge: 'تأكيد', call: 'اتصال', send_team: 'إرسال فريق', locate_btn: 'تحديد', unassigned: 'غير معيّن', last_known: 'آخر موقع معروف', no_location: 'بدون موقع', ack_by: 'أكّدها', not_acked: 'لم تُؤكَّد بعد', updated_w: 'حُدّث', last_seen: 'آخر ظهور', duress: 'إكراه', reports: 'بلاغات', report: 'بلاغ',
    inc_title: 'الحوادث', new_incident: '+ حادثة جديدة', click_map: 'انقر على الخريطة لوضع الحادثة، أو اكتب عنواناً أدناه.', type_address: 'اكتب عنواناً…', find: 'بحث', no_active_inc: 'لا حوادث نشطة.',
    silent: 'صامت', last_known_lc: 'آخر موقع معروف', no_location_lc: 'بدون موقع',
    rc_title: 'نداء التفقّد', rc_new: 'نداء جديد', rc_start: 'نداء التفقّد', rc_of: 'من', rc_safe: 'بأمان', awaiting: 'بانتظار', unsafe: 'غير آمن', rc_none: 'لا نداء نشط.', rc_all_off: 'كل المنسّقين خارج الخدمة.', rc_no_fc: 'لا منسّقين ميدانيين.', rc_off_exempt: '🌙 خارج الخدمة (مُعفون):',
    feed_title: 'سجلّ الحوادث', in_area: 'في منطقتك', all_assigned: 'الكل معيّن', range_all: 'الكل', no_in_area: 'لا حوادث في منطقة عملياتك.', locating: 'جارٍ التحديد…', response: 'استجابة',
    handled: 'مُعالَجة', nothing_handled: 'لا شيء مُعالَج بعد. تظهر هنا الحوادث المرفوضة وتلك التي أنهاها فريق.', completed: '✓ منجز', dismissed_w: 'مرفوض', resolved_w: '✓ مُنهى', incident_w: 'حادثة', reopen: 'إعادة فتح',
    ni_title: 'حادثة جديدة', ni_title_ph: 'العنوان (ماذا يحدث)', ni_details_ph: 'تفاصيل للفريق المستجيب…', creating: 'جارٍ الإنشاء…', create_inc: 'إنشاء الحادثة', cancel: 'إلغاء',
    ai_title: 'تعيين فريق —', alerted_push: 'يُنبَّه الفريق عبر إشعار', no_teams: 'لا فِرق.', no_app: '⚠ لا وصول للتطبيق',
    pd_title: 'إرسال فريق إلى', pd_last_seen: 'آخر ظهور', pd_no_loc: 'لا موقع مُبلَّغ', pd_alerted: 'يُنبَّه الفريق عبر إشعار.',
    rp_title: 'إنهاء استغاثة', rp_poss: '', rp_note: 'لا تُنهِها إلا بعد التأكد من سلامة الشخص. مطلوب ملاحظة عن النتيجة (10 أحرف على الأقل).', rp_ph: 'ماذا حدث / النتيجة…',
    rec_title: 'استدعاء', rec_note: 'يُطلب من الفريق التوقف وتعود الحادثة كفجوة تغطية.', reason_opt: 'السبب (اختياري)',
    as_title: 'تعيين فريق', note_opt: 'ملاحظة (اختياري)', no_teams_avail: 'لا فِرق متاحة.', match: '✓مطابق', km: 'كم', no_loc: 'لا موقع', busy_w: 'مشغول', no_app_members: '⚠ لا أعضاء لديهم وصول للتطبيق — لن يُنبَّهوا',
    t_inc_resolved: 'تم إنهاء الحادثة', t_e_resolve: 'تعذّر إنهاء الحادثة', t_dismissed: 'تم رفض الحادثة', t_reopened: 'أُعيد فتح الحادثة', t_action_fail: 'فشل الإجراء', t_dispatched: 'تم إيفاد الفريق', t_e_dispatch: 'تعذّر إيفاد الفريق', t_panic_resolved: 'تم إنهاء الاستغاثة', t_e_resolve2: 'تعذّر الإنهاء', t_panic_ack: 'تم تأكيد الاستغاثة', t_team_sent: 'أُرسل الفريق', t_e_send: 'تعذّر إرسال الفريق', t_inc_created: 'تم إنشاء الحادثة', t_e_create: 'تعذّر إنشاء الحادثة', t_team_recalled: 'تم استدعاء الفريق', t_e_recall: 'تعذّر استدعاء الفريق', change_team: 'تغيير الفريق', change_incident: 'تغيير الحادثة', rs_currently: 'حالياً', rs_swap_note: 'يُرسَل الفريق الجديد ويتوقف الفريق الحالي.', rs_no_other_teams: 'لا توجد فِرق أخرى.', rs_move_to_inc: 'نقل هذا الفريق إلى حادثة أخرى:', rs_no_other_inc: 'لا حوادث أخرى في المنطقة.', t_reassigned: 'أُعيد تعيين الإيفاد', t_team_reassigned: 'أُعيد تعيين الفريق', t_e_reassign: 'تعذّرت إعادة التعيين', t_loc_fail: 'تعذّر تحديد موقعك — تحقق من الأذونات', t_loc_na: 'تحديد الموقع غير متاح على هذا الجهاز',
    cf_resolve_t: 'وضع علامة على الحادثة كمُنهاة؟', cf_resolve_b: 'ستغادر اللوحة.', cf_dismiss_cluster: 'رفض هذه الحادثة؟ تغادر لوحتك لكن يمكن إعادة فتحها. لا يتأثّر التحقق العام.', cf_dismiss_custom: 'رفض هذه الحادثة؟ تغادر اللوحة لكن يمكن إعادة فتحها.',
  },
} as const

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
  standby: '#3fb950', deployed: '#d29922', unavailable: '#8b949e', offline: '#484f58', off_duty: '#a371f7',
}

interface CustomIncident {
  id: string; title: string; category: string | null; severity: string; description: string | null
  address: string | null; lat: number; lon: number; created_at: string; covered: boolean; status?: string
}
interface Worker {
  ngo_user_id: string; name: string; role: string | null; lat: number; lon: number; last_seen_at: string; source: string
}
interface FacilityPin {
  id: string; name: string; lat: number | null; lon: number | null; status: string; status_updated_at: string | null
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
  src('area'); src('inc-radius'); src('inc-dots'); src('gaps'); src('teams'); src('panics'); src('custom-inc'); src('workers'); src('facilities')
  const layer = (def: any) => { if (!m.getLayer(def.id)) m.addLayer(def) }

  layer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#58a6ff', 'fill-opacity': 0.05 } })
  layer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#58a6ff', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.5 } })
  // Facilities — diamond-ish markers coloured by status; stale status dims via opacity.
  const FAC_COLOUR = ['case', ['==', ['get', 'status'], 'open'], '#3fb950', ['==', ['get', 'status'], 'full'], '#d29922', ['==', ['get', 'status'], 'closed'], '#f85149', '#8b949e'] as any
  layer({ id: 'fac-dots', type: 'circle', source: 'facilities', paint: { 'circle-radius': 6, 'circle-color': FAC_COLOUR, 'circle-opacity': ['case', ['get', 'stale'], 0.45, 0.95], 'circle-stroke-color': '#0d1117', 'circle-stroke-width': 2 } })
  layer({ id: 'fac-labels', type: 'symbol', source: 'facilities', layout: { 'text-field': ['get', 'label'], 'text-size': 10, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 12 }, paint: { 'text-color': '#c9d1d9', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.4 } })
  layer({ id: 'gap-glow', type: 'circle', source: 'gaps', paint: { 'circle-radius': 22, 'circle-color': '#f85149', 'circle-opacity': 0.35, 'circle-blur': 0.6 } })
  layer({ id: 'inc-radius-fill', type: 'fill', source: 'inc-radius', paint: { 'fill-color': STATUS_COLOUR_EXPR, 'fill-opacity': ['case', ['get', 'inside'], 0.25, 0.04] } })
  layer({ id: 'inc-radius-line', type: 'line', source: 'inc-radius', paint: { 'line-color': STATUS_COLOUR_EXPR, 'line-width': 1.2, 'line-opacity': ['case', ['get', 'inside'], 0.8, 0.2] } })
  layer({ id: 'inc-dots', type: 'circle', source: 'inc-dots', paint: { 'circle-radius': 7, 'circle-color': STATUS_COLOUR_EXPR, 'circle-opacity': ['case', ['get', 'inside'], 1, 0.3], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': ['case', ['get', 'inside'], 0.8, 0.2] } })
  // Team pins dim to 35% when their last-known location is stale (>1h or never), so leaders
  // don't trust a ghost position; the label already shows the "· Xm/Xh ago" age.
  layer({ id: 'team-dots', type: 'circle', source: 'teams', paint: { 'circle-radius': 8, 'circle-color': ['case', ['==', ['get', 'status'], 'standby'], TEAM_STATUS_COLOUR.standby, ['==', ['get', 'status'], 'deployed'], TEAM_STATUS_COLOUR.deployed, ['==', ['get', 'status'], 'unavailable'], TEAM_STATUS_COLOUR.unavailable, ['==', ['get', 'status'], 'off_duty'], TEAM_STATUS_COLOUR.off_duty, TEAM_STATUS_COLOUR.offline], 'circle-opacity': ['case', ['get', 'stale'], 0.35, 1], 'circle-stroke-color': '#0d1117', 'circle-stroke-width': 2, 'circle-stroke-opacity': ['case', ['get', 'stale'], 0.35, 1] } })
  layer({ id: 'team-labels', type: 'symbol', source: 'teams', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-max-width': 14 }, paint: { 'text-color': '#e6edf3', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.5 } })
  // Custom (org-created) incidents — severity-coloured square markers + label; an
  // uncovered one shows an amber ring.
  layer({ id: 'custom-inc-ring', type: 'circle', source: 'custom-inc', filter: ['!', ['get', 'covered']], paint: { 'circle-radius': 16, 'circle-color': '#f97316', 'circle-opacity': 0.3, 'circle-blur': 0.5 } })
  layer({ id: 'custom-inc-dot', type: 'circle', source: 'custom-inc', paint: { 'circle-radius': 8, 'circle-color': ['case', ['==', ['get', 'severity'], 'critical'], SEVERITY_COLOUR.critical, ['==', ['get', 'severity'], 'high'], SEVERITY_COLOUR.high, ['==', ['get', 'severity'], 'low'], SEVERITY_COLOUR.low, SEVERITY_COLOUR.medium], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } })
  layer({ id: 'custom-inc-label', type: 'symbol', source: 'custom-inc', layout: { 'text-field': ['get', 'title'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-max-width': 12 }, paint: { 'text-color': '#e6edf3', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.5 } })
  // Per-worker live pins — red if in duress (panic), else green/grey by freshness.
  layer({ id: 'worker-dot', type: 'circle', source: 'workers', paint: { 'circle-radius': 6, 'circle-color': ['case', ['==', ['get', 'source'], 'panic'], '#f85149', ['get', 'fresh'], '#3fb950', '#8b949e'], 'circle-stroke-color': '#0d1117', 'circle-stroke-width': 2 } })
  layer({ id: 'worker-label', type: 'symbol', source: 'workers', layout: { 'text-field': ['get', 'label'], 'text-size': 10, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 12 }, paint: { 'text-color': '#c9d1d9', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.4 } })
  layer({ id: 'panic-glow', type: 'circle', source: 'panics', paint: { 'circle-radius': 26, 'circle-color': '#f85149', 'circle-opacity': 0.4, 'circle-blur': 0.5 } })
  layer({ id: 'panic-dot', type: 'circle', source: 'panics', paint: { 'circle-radius': 9, 'circle-color': '#f85149', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } })
  layer({ id: 'panic-label', type: 'symbol', source: 'panics', layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-max-width': 14 }, paint: { 'text-color': '#f85149', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.5 } })
}

interface Incident {
  id: string; lat: number; lon: number; status: string; confidence_score: number
  report_count: number; created_at: string; radius_metres: number; inside: boolean; covered: boolean; handling?: string
}
interface TeamPin {
  id: string; name: string; type: string; status: string; lat: number; lon: number; last_seen_at: string | null
}
interface Panic {
  id: string; ngo_user_id: string; name: string; lat: number | null; lon: number | null; created_at: string
  phone?: string | null; silent?: boolean; reason?: string | null
  acknowledged_at?: string | null; acknowledged_by_name?: string | null
}
type RollState = 'safe' | 'unsafe' | 'awaiting' | 'off_duty'
interface RollCall {
  id: string; created_at: string; message: string | null
  safe_count: number; total: number; unsafe_count: number; awaiting_count: number; off_duty_count: number
  members: { id: string; name: string; state: RollState; safe: boolean }[]
}
interface Dispatch {
  id: string; cluster_id: string | null; ngo_incident_id?: string | null; team_id: string; team_name: string | null; status: string; response_minutes: number | null
}
interface RankedTeam {
  id: string; name: string; type: string; status: string; type_match: boolean; distance_km: number | null; busy: boolean; notifiable_count?: number
}
const LEGEND_SECTIONS = [
  { titleKey: 'leg_incidents', items: [
    { color: '#ef4444', labelKey: 'leg_confirmed' }, { color: '#f97316', labelKey: 'leg_auto' },
    { color: '#58a6ff', labelKey: 'leg_news' }, { color: '#a371f7', labelKey: 'leg_official' },
  ] },
  { titleKey: 'leg_teams', items: [
    { color: '#3fb950', labelKey: 'leg_standby' }, { color: '#d29922', labelKey: 'leg_deployed' },
    { color: '#8b949e', labelKey: 'leg_unavailable' }, { color: '#a371f7', labelKey: 'leg_off_duty' },
  ] },
  { titleKey: 'leg_markers', items: [
    { color: '#f85149', labelKey: 'leg_panic' }, { color: '#3fb950', labelKey: 'leg_worker' },
  ] },
]
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

// Live "updated Xs ago" for the freshness chip. _tick is unused but its change forces a
// re-render each second so the seconds count up.
function freshAgo(at: number | null, _tick: number): string {
  if (at == null) return '—'
  const s = Math.floor((Date.now() - at) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`
}

export default function NgoBoardPage() {
  const confirm = useConfirm()
  const toast = useToast()
  const { lang, isRtl } = useNgoLang()
  const t = makeT(BLANG, lang)
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const map = useRef<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const dataRef = useRef<{ incidents: Incident[]; teams: TeamPin[]; area: any; panics: Panic[]; customIncidents: CustomIncident[]; workers: Worker[]; facilities: FacilityPin[] } | null>(null)

  const [incidents, setIncidents] = useState<Incident[]>([])
  const [teams, setTeams] = useState<TeamPin[]>([])
  const [panics, setPanics] = useState<Panic[]>([])
  const [rollCall, setRollCall] = useState<RollCall | null>(null)
  const [rcBusy, setRcBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  // On phones the fixed side panel covers the map — track viewport so it can become a
  // full-width drawer that starts collapsed (map-first), with the toggle acting as a close button.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const onR = () => setIsMobile(window.innerWidth < 768)
    onR(); window.addEventListener('resize', onR); return () => window.removeEventListener('resize', onR)
  }, [])
  useEffect(() => { if (isMobile) setPanelOpen(false) }, [isMobile])
  const [locNames, setLocNames] = useState<Record<string, string>>({})
  const locNamesRef = useRef<Record<string, string>>({})
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [assignFor, setAssignFor] = useState<Incident | null>(null)
  const [rankedTeams, setRankedTeams] = useState<RankedTeam[]>([])
  const [assignNote, setAssignNote] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [recallFor, setRecallFor] = useState<{ id: string; team: string | null } | null>(null)
  // Inline reassign from the feed (change team / change incident) — mirrors the dispatch log.
  const [reassignFor, setReassignFor] = useState<Dispatch | null>(null)
  const [reassignTeamFor, setReassignTeamFor] = useState<Dispatch | null>(null)
  const [reassignTeams, setReassignTeams] = useState<PickableTeam[]>([])
  const [reason, setReason] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [windowDays, setWindowDays] = useState<string>('10') // '10' | '30' | '90' | 'all'
  const daysRef = useRef('10')
  useEffect(() => { daysRef.current = windowDays }, [windowDays])
  const [mapStyle, setMapStyle] = useState<string>('dark')
  const [workers, setWorkers] = useState<Worker[]>([])
  const [showWorkers, setShowWorkers] = useState(true)
  const showWorkersRef = useRef(true)
  useEffect(() => { showWorkersRef.current = showWorkers }, [showWorkers])
  // Facilities overlay (where to take people) — off by default to keep the board clean,
  // but the Facilities page links here with ?layer=facilities to switch it on.
  const [facilities, setFacilities] = useState<FacilityPin[]>([])
  const [showFacilities, setShowFacilities] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('layer') === 'facilities')
  const showFacilitiesRef = useRef(false)
  useEffect(() => { showFacilitiesRef.current = showFacilities }, [showFacilities])
  const [panicDispatchFor, setPanicDispatchFor] = useState<Panic | null>(null)
  const [resolvePanicFor, setResolvePanicFor] = useState<Panic | null>(null)
  const [panicNote, setPanicNote] = useState('')
  const [panicTeams, setPanicTeams] = useState<{ id: string; name: string; type: string; status: string; notifiable_count?: number }[]>([])
  const [panicBusy, setPanicBusy] = useState(false)
  // Audible chime when a NEW panic arrives while the board is open (the strip + map glow are the
  // visual). Sound default on; the operator can mute (shared with the panic monitor).
  const { muted, toggleMute } = useNewPanicAlert(panics)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null) // last successful board fetch
  const [agoTick, setAgoTick] = useState(0) // 1s tick to keep the "updated Xs ago" label live
  // Handled (dismissed/completed) incidents — collapsible reopen list.
  const [handledIncidents, setHandledIncidents] = useState<Incident[]>([])
  const [handledCustom, setHandledCustom] = useState<CustomIncident[]>([])
  const [handledOpen, setHandledOpen] = useState(false)
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
  const [incTeams, setIncTeams] = useState<{ id: string; name: string; type: string; status: string; notifiable_count?: number }[]>([])
  // Clicking a map marker selects it → a detail card (looked up from current data by kind+id).
  const [selected, setSelected] = useState<{ kind: 'incident' | 'custom' | 'team' | 'worker' | 'panic' | 'facility'; id: string } | null>(null)
  // Place search + find-my-location + legend.
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ name: string; lon: number; lat: number }[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [legendOpen, setLegendOpen] = useState(true)
  const userMarker = useRef<any>(null)
  const searchTimer = useRef<any>(null)

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
        properties: { id: t.id, status: t.status, stale: !t.last_seen_at || Date.now() - new Date(t.last_seen_at).getTime() > 3600000, label: `${t.name} · ${timeAgo(t.last_seen_at)}` },
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

    // Worker pins (hidden when the toggle is off). fresh = located in the last hour.
    const now = Date.now()
    const workerFC = {
      type: 'FeatureCollection',
      features: showWorkersRef.current ? (d.workers ?? []).map((w) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [w.lon, w.lat] },
        properties: { id: w.ngo_user_id, source: w.source, fresh: now - new Date(w.last_seen_at).getTime() < 3600000, label: `${w.name} · ${timeAgo(w.last_seen_at)}` },
      })) : [],
    }

    // Facility pins (hidden when the toggle is off). Stale = status set >4h ago or never.
    const facilityFC = {
      type: 'FeatureCollection',
      features: showFacilitiesRef.current
        ? (d.facilities ?? []).filter((f) => f.lat != null && f.lon != null).map((f) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
            properties: {
              id: f.id,
              status: f.status,
              stale: !f.status_updated_at || now - new Date(f.status_updated_at).getTime() > 4 * 3600000,
              label: f.name,
            },
          }))
        : [],
    }

    const set = (id: string, data: any) => { const s = m.getSource(id); if (s) s.setData(data) }
    set('area', areaFC); set('inc-radius', radiusFC); set('inc-dots', dotFC); set('gaps', gapFC); set('teams', teamFC); set('panics', panicFC); set('custom-inc', customFC); set('workers', workerFC); set('facilities', facilityFC)
  }, [])

  // ── Fetch board data ───────────────────────────────────────────────────────
  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/ngo/board?days=${daysRef.current}`)
      if (!res.ok) { setLoadError(true); setLoaded(true); return }
      const data = await res.json()
      setLoadError(false); setLoaded(true); setUpdatedAt(Date.now())
      const inc: Incident[] = data.incidents ?? []
      const tms: TeamPin[] = data.teams ?? []
      const pnc: Panic[] = data.panics ?? []
      const cinc: CustomIncident[] = data.custom_incidents ?? []
      const wrk: Worker[] = data.workers ?? []
      dataRef.current = { incidents: inc, teams: tms, area: data.operational_area, panics: pnc, customIncidents: cinc, workers: wrk, facilities: dataRef.current?.facilities ?? [] }
      setIncidents(inc)
      setTeams(tms)
      setPanics(pnc)
      setCustomIncidents(cinc)
      setWorkers(wrk)
      setRollCall(data.roll_call ?? null)
      setDispatches(data.dispatches ?? [])
      const hInc: Incident[] = data.handled_incidents ?? []
      setHandledIncidents(hInc)
      setHandledCustom(data.handled_custom_incidents ?? [])
      renderSources()

      // In-area feed + handled public incidents → geocode for labels.
      inc.filter((c) => c.inside).forEach((c) => fetchLocationName(c.lat, c.lon, c.id))
      hInc.forEach((c) => fetchLocationName(c.lat, c.lon, c.id))
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
      // Pick-on-map for a new custom incident; otherwise a click on empty map clears any
      // selected marker (background-tap to dismiss the detail card).
      map.current.on('click', (e: any) => {
        if (creatingRef.current) {
          const lat = e.lngLat.lat, lon = e.lngLat.lng
          setCreating(false)
          setNewInc({ lat, lon, address: '', title: '', category: 'medical', severity: 'medium', description: '' })
          reverseForForm(lat, lon)
          return
        }
        const m = map.current
        const layers = ['inc-dots', 'custom-inc-dot', 'team-dots', 'worker-dot', 'panic-dot', 'fac-dots'].filter((l) => m.getLayer(l))
        if (!m.queryRenderedFeatures(e.point, { layers }).length) setSelected(null)
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

  // Facilities overlay data — fetched separately (owned by the Facilities page), so the
  // board API stays untouched. Refreshes on the same cadence; merged into dataRef.
  useEffect(() => {
    let stop = false
    const loadFacilities = async () => {
      try {
        const r = await fetch('/api/ngo/facilities', { cache: 'no-store' })
        if (stop || !r.ok) return
        const d = await r.json()
        const facs: FacilityPin[] = d.facilities ?? []
        setFacilities(facs)
        if (dataRef.current) dataRef.current.facilities = facs
        else dataRef.current = { incidents: [], teams: [], area: null, panics: [], customIncidents: [], workers: [], facilities: facs }
        renderSources()
      } catch { /* offline — keep last */ }
    }
    loadFacilities()
    const id = setInterval(loadFacilities, 60000)
    return () => { stop = true; clearInterval(id) }
  }, [renderSources])

  // When the map becomes ready, paint the latest data onto it.
  useEffect(() => { if (mapLoaded) renderSources() }, [mapLoaded, renderSources])

  // Click a marker → select it (opens the detail card); pointer cursor on hover. Layer ids
  // mirror setupBoardLayers. Registered once the map is ready; cleaned up on unmount.
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const m = map.current
    const LAYERS: [string, 'incident' | 'custom' | 'team' | 'worker' | 'panic' | 'facility'][] = [
      ['inc-dots', 'incident'], ['custom-inc-dot', 'custom'], ['team-dots', 'team'],
      ['worker-dot', 'worker'], ['panic-dot', 'panic'], ['fac-dots', 'facility'],
    ]
    const bound: { layer: string; onClick: any; onEnter: any; onLeave: any }[] = []
    for (const [layer, kind] of LAYERS) {
      const onClick = (e: any) => {
        if (creatingRef.current) return
        const f = e.features?.[0]; if (!f) return
        setSelected({ kind, id: String(f.properties.id) })
        const c = f.geometry?.coordinates
        if (Array.isArray(c)) m.easeTo({ center: c as [number, number] })
      }
      const onEnter = () => { if (!creatingRef.current) m.getCanvas().style.cursor = 'pointer' }
      const onLeave = () => { if (!creatingRef.current) m.getCanvas().style.cursor = '' }
      m.on('click', layer, onClick); m.on('mouseenter', layer, onEnter); m.on('mouseleave', layer, onLeave)
      bound.push({ layer, onClick, onEnter, onLeave })
    }
    return () => { bound.forEach((b) => { try { m.off('click', b.layer, b.onClick); m.off('mouseenter', b.layer, b.onEnter); m.off('mouseleave', b.layer, b.onLeave) } catch { /* map gone */ } }) }
  }, [mapLoaded])

  // Esc dismisses the selected-marker detail card and the search dropdown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected(null); setSearchOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Select an entity from the feed/list and centre the map on it (feed ↔ map link).
  function selectAndFly(kind: 'incident' | 'custom', id: string, lon: number, lat: number) {
    setSelected({ kind, id })
    if (map.current && Number.isFinite(lon) && Number.isFinite(lat)) map.current.easeTo({ center: [lon, lat] })
  }

  // ── Place search (Mapbox forward geocoding, Lebanon-biased) + find-my-location ──
  function onSearchChange(v: string) {
    setSearchQuery(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (v.trim().length < 2) { setSearchResults([]); setSearchOpen(false); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(v)}.json?access_token=${token}&country=lb&proximity=35.86,33.87&limit=5&types=place,locality,neighborhood,address,poi`
        const res = await fetch(url)
        const d = await res.json()
        setSearchResults((d.features ?? []).map((f: any) => ({ name: f.place_name as string, lon: f.center[0] as number, lat: f.center[1] as number })))
        setSearchOpen(true)
      } catch { /* leave previous results */ }
    }, 300)
  }
  function flyToResult(r: { name: string; lon: number; lat: number }) {
    setSearchOpen(false); setSearchQuery(r.name)
    map.current?.flyTo({ center: [r.lon, r.lat], zoom: 14, essential: true })
  }
  function locateMe() {
    if (!('geolocation' in navigator) || !map.current) { toast(t('t_loc_na'), 'error'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        const { latitude, longitude } = p.coords
        map.current.flyTo({ center: [longitude, latitude], zoom: 14, essential: true })
        try { userMarker.current?.remove() } catch { /* none */ }
        userMarker.current = new window.mapboxgl.Marker({ color: '#58a6ff' }).setLngLat([longitude, latitude]).addTo(map.current)
      },
      () => { setLocating(false); toast(t('t_loc_fail'), 'error') },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  // 1s tick keeps the "updated Xs ago" freshness label live (paused when hidden).
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setAgoTick((n) => n + 1) }, 1000)
    return () => clearInterval(id)
  }, [])

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
      if (res.ok) { setAssignFor(null); toast(t('t_dispatched')); fetchBoard() } else toast(t('t_e_dispatch'), 'error')
    } finally { setAssignBusy(false) }
  }
  function setWindow(v: string) {
    setWindowDays(v); daysRef.current = v; fetchBoard()
  }
  async function resolvePanic(panicId: string, note: string) {
    if (note.trim().length < 10) return
    const res = await fetch(`/api/ngo/safety/panic/${panicId}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution_note: note.trim() }) })
    if (res.ok) { setResolvePanicFor(null); setPanicNote(''); toast(t('t_panic_resolved')); fetchBoard() } else toast(t('t_e_resolve2'), 'error')
  }
  async function acknowledgePanic(panicId: string) {
    const res = await fetch(`/api/ngo/safety/panic/${panicId}/acknowledge`, { method: 'POST' })
    if (res.ok) { toast(t('t_panic_ack')); fetchBoard() }
  }
  function locatePanic(p: Panic) {
    if (p.lat == null || p.lon == null || !map.current) return
    setPanelOpen(true)
    map.current.flyTo({ center: [p.lon, p.lat], zoom: 15, essential: true })
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
      if (res.ok) { setPanicDispatchFor(null); toast(t('t_team_sent')); fetchBoard() } else toast(t('t_e_send'), 'error')
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
      if (res.ok) { setNewInc(null); setAddr(''); toast(t('t_inc_created')); fetchBoard() } else toast(t('t_e_create'), 'error')
    } finally { setIncBusy(false) }
  }
  async function resolveIncident(id: string) {
    if (!(await confirm({ title: t('cf_resolve_t'), body: t('cf_resolve_b'), confirmLabel: t('resolve') }))) return
    const res = await fetch(`/api/ngo/incidents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) })
    if (res.ok) { toast(t('t_inc_resolved')); fetchBoard() } else toast(t('t_e_resolve'), 'error')
  }
  // Dismiss a custom incident (not actionable) / reopen a handled one.
  async function setCustomStatus(id: string, status: 'open' | 'dismissed', confirmMsg?: string) {
    if (confirmMsg && !(await confirm({ title: confirmMsg, danger: status === 'dismissed', confirmLabel: status === 'dismissed' ? t('dismiss') : t('reopen') }))) return
    const res = await fetch(`/api/ngo/incidents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (res.ok) { toast(status === 'dismissed' ? t('t_dismissed') : t('t_reopened')); fetchBoard() } else toast(t('t_action_fail'), 'error')
  }
  // Dismiss / reopen a PUBLIC cluster incident via the NGO overlay.
  async function setClusterHandling(clusterId: string, action: 'dismiss' | 'reopen', confirmMsg?: string) {
    if (confirmMsg && !(await confirm({ title: confirmMsg, danger: action === 'dismiss', confirmLabel: action === 'dismiss' ? t('dismiss') : t('reopen') }))) return
    const res = await fetch('/api/ngo/incidents/cluster-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cluster_id: clusterId, action }) })
    if (res.ok) { toast(action === 'dismiss' ? t('t_dismissed') : t('t_reopened')); fetchBoard() } else toast(t('t_action_fail'), 'error')
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
      if (res.ok) { setAssignIncFor(null); toast(t('t_dispatched')); fetchBoard() } else toast(t('t_e_dispatch'), 'error')
    } finally { setIncBusy(false) }
  }
  async function confirmRecall(reasonArg: string) {
    if (!recallFor) return
    const res = await fetch(`/api/ngo/dispatch/${recallFor.id}/recall`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reasonArg }) })
    if (res.ok) { setRecallFor(null); toast(t('t_team_recalled')); fetchBoard() } else toast(t('t_e_recall'), 'error')
  }
  // Change incident (keep team) / change team (keep incident) for an active dispatch.
  function openChangeIncident(d: Dispatch) { setReassignFor(d); setReason('') }
  async function doReassign(clusterId: string) {
    if (!reassignFor) return
    const res = await fetch(`/api/ngo/dispatch/${reassignFor.id}/reassign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cluster_id: clusterId, reason }) })
    if (res.ok) { setReassignFor(null); setReason(''); toast(t('t_reassigned')); fetchBoard() } else toast(t('t_e_reassign'), 'error')
  }
  async function openChangeTeam(d: Dispatch) {
    setReassignTeamFor(d); setReason(''); setReassignTeams([])
    try { const res = await fetch('/api/ngo/teams'); if (res.ok) setReassignTeams((await res.json()).teams ?? []) } catch { /* show empty */ }
  }
  async function doReassignTeam(teamId: string) {
    if (!reassignTeamFor) return
    const res = await fetch(`/api/ngo/dispatch/${reassignTeamFor.id}/reassign-team`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId, reason }) })
    if (res.ok) { setReassignTeamFor(null); setReason(''); toast(t('t_team_reassigned')); fetchBoard() } else toast(t('t_e_reassign'), 'error')
  }
  const activeDispatchFor = (clusterId: string) => dispatches.find((d) => d.cluster_id === clusterId && ACTIVE_DISPATCH.includes(d.status))

  const feed = incidents.filter((c) => c.inside)
  const gapCount = feed.filter((c) => !c.covered).length

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ position: 'relative', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {/* Dismiss-proof panic strip — always on top of the board while any panic is active */}
      {panics.length > 0 && (
        <div onClick={() => { setPanelOpen(true); const u = panics.find((p) => !p.acknowledged_at) ?? panics[0]; locatePanic(u) }} style={panicStrip}>
          <span>🆘 {panics.length} {panics.length === 1 ? t('ps_active') : t('ps_active_pl')}
            {panics.some((p) => !p.acknowledged_at) ? ` · ${panics.filter((p) => !p.acknowledged_at).length} ${t('ps_unack')}` : ` · ${t('ps_all_ack')}`} — {t('ps_tap')}</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); toggleMute() }} title={t('ps_tap')}
            style={{ marginInlineStart: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: 6, fontSize: 12, padding: '2px 8px', cursor: 'pointer', fontFamily: 'system-ui', flexShrink: 0 }}>{muted ? '🔇' : '🔔'}</button>
        </div>
      )}

      {/* Loading / refresh-error chip (top-left) + a live "updated Xs ago" so a silently-polling
          board never looks current when it's actually stale (e.g. offline). */}
      {!loaded && <div className="board-chip" style={statusChip}>{t('loading')}</div>}
      {loaded && loadError && (
        <div className="board-chip" style={{ ...statusChip, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>
          {typeof navigator !== 'undefined' && !navigator.onLine ? t('offline') : t('cant_refresh')} · {t('updated')} {freshAgo(updatedAt, agoTick)} <button type="button" onClick={fetchBoard} style={chipRetry}>{t('retry')}</button>
        </div>
      )}
      {loaded && !loadError && updatedAt != null && (
        <div className="board-chip" style={{ ...statusChip, color: '#8b949e' }}>{t('updated')} {freshAgo(updatedAt, agoTick)}</div>
      )}

      {/* Place search + find-my-location */}
      <div style={searchWrap}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} onFocus={() => { if (searchResults.length) setSearchOpen(true) }} placeholder={t('search_ph')} style={searchInput} />
          <button type="button" onClick={locateMe} disabled={locating} title={t('locate')} aria-label={t('locate')} style={searchIconBtn}>{locating ? '…' : '◎'}</button>
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div style={searchResultsBox}>
            {searchResults.map((r, i) => (
              <button key={i} type="button" onClick={() => flyToResult(r)} style={searchResultRow}>{r.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={legendBox}>
        <button type="button" onClick={() => setLegendOpen((o) => !o)} style={legendHeader}>{legendOpen ? '▾' : '▸'} {t('legend')}</button>
        {legendOpen && (
          <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
            {LEGEND_SECTIONS.map((sec) => (
              <div key={sec.titleKey}>
                <div style={legendSectionLabel}>{t(sec.titleKey)}</div>
                {sec.items.map((it) => (
                  <div key={it.labelKey} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#c9d1d9' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, flexShrink: 0 }} />{t(it.labelKey)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected-marker detail card (click a pin) */}
      {selected && (() => {
        const close = () => setSelected(null)
        const header = (title: string, sub?: string) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-word' }}>{title}</div>
              {sub && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{sub}</div>}
            </div>
            <button type="button" onClick={close} aria-label="Close" style={{ flexShrink: 0, background: 'none', border: 'none', color: '#8b949e', fontSize: 18, lineHeight: 1, cursor: 'pointer', fontFamily: 'system-ui' }}>×</button>
          </div>
        )
        if (selected.kind === 'incident') {
          const c = incidents.find((x) => x.id === selected.id) ?? handledIncidents.find((x) => x.id === selected.id)
          if (!c) return null
          const d = activeDispatchFor(c.id)
          return (
            <div className="board-detail" style={detailCard}>
              {header(locNames[c.id] ?? `${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}`, `${c.confidence_score}% · ${c.report_count} report${c.report_count === 1 ? '' : 's'} · ${timeAgo(c.created_at)}`)}
              <div style={{ fontSize: 11, color: STATUS_HEX[c.status] ?? '#8b949e', marginBottom: 8 }}>● {t(`st_${c.status}`)}{!c.covered && <span style={{ color: '#f85149' }}> · {t('unassigned')}</span>}</div>
              {d
                ? <>
                    <div style={{ fontSize: 12, color: '#3fb950', marginBottom: 6 }}>🚑 {d.team_name} · <StatusPill status={d.status} lang={lang} /></div>
                    <button type="button" onClick={() => { setRecallFor({ id: d.id, team: d.team_name }); close() }} style={{ ...assignBtn, marginTop: 0, color: '#f85149', borderColor: 'rgba(248,81,73,0.35)', background: 'rgba(248,81,73,0.08)' }}>{t('recall')}</button>
                  </>
                : <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => { openAssign(c); close() }} style={{ ...assignBtn, marginTop: 0 }}>{t('assign')}</button>
                    <button type="button" onClick={() => setClusterHandling(c.id, 'dismiss', t('cf_dismiss_cluster'))} style={{ ...assignBtn, marginTop: 0, color: '#8b949e', borderColor: '#21262d', background: 'rgba(255,255,255,0.04)' }}>{t('dismiss')}</button>
                  </div>}
            </div>
          )
        }
        if (selected.kind === 'custom') {
          const i = customIncidents.find((x) => x.id === selected.id) ?? handledCustom.find((x) => x.id === selected.id)
          if (!i) return null
          const d = dispatches.find((x) => x.ngo_incident_id === i.id && ACTIVE_DISPATCH.includes(x.status))
          return (
            <div className="board-detail" style={detailCard}>
              {header(i.title, [i.category, i.address].filter(Boolean).join(' · ') || `${i.lat.toFixed(3)}, ${i.lon.toFixed(3)}`)}
              <div style={{ fontSize: 11, color: SEVERITY_COLOUR[i.severity] ?? '#8b949e', marginBottom: 6 }}>● {i.severity}</div>
              {i.description && <div style={{ fontSize: 12, color: '#c9d1d9', marginBottom: 8, lineHeight: 1.4 }}>{i.description}</div>}
              {d
                ? <div style={{ fontSize: 12, color: '#3fb950' }}>🚑 {d.team_name} · <StatusPill status={d.status} lang={lang} /></div>
                : <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => { openAssignIncident(i); close() }} style={{ ...assignBtn, marginTop: 0 }}>{t('assign')}</button>
                    <button type="button" onClick={() => { resolveIncident(i.id); close() }} style={{ ...assignBtn, marginTop: 0, color: '#8b949e', borderColor: '#21262d', background: 'rgba(255,255,255,0.04)' }}>{t('resolve')}</button>
                  </div>}
            </div>
          )
        }
        if (selected.kind === 'team') {
          const tm = teams.find((x) => x.id === selected.id)
          if (!tm) return null
          return <div className="board-detail" style={detailCard}>{header(tm.name, `${tm.type} · ${tm.status}`)}<div style={{ fontSize: 12, color: '#8b949e' }}>{t('last_seen')} {timeAgo(tm.last_seen_at)}</div></div>
        }
        if (selected.kind === 'worker') {
          const w = workers.find((x) => x.ngo_user_id === selected.id)
          if (!w) return null
          return <div className="board-detail" style={detailCard}>{header(w.name, w.role ?? undefined)}<div style={{ fontSize: 12, color: '#8b949e' }}>{t('last_seen')} {timeAgo(w.last_seen_at)}{w.source === 'panic' ? ` · 🆘 ${t('duress')}` : ''}</div></div>
        }
        if (selected.kind === 'panic') {
          const p = panics.find((x) => x.id === selected.id)
          if (!p) return null
          return (
            <div className="board-detail" style={{ ...detailCard, borderColor: 'rgba(248,81,73,0.5)' }}>
              {header(`🆘 ${p.name}`, `${timeAgo(p.created_at)}${p.reason ? ` · ${p.reason}` : ''}`)}
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>{p.lat != null && p.lon != null ? `${t('last_known')} ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : t('no_location')}</div>
              <div style={{ fontSize: 12, marginBottom: 8 }}>{p.acknowledged_at ? <span style={{ color: '#3fb950' }}>✓ {t('ack_by')} {p.acknowledged_by_name}</span> : <span style={{ color: '#d29922' }}>● {t('not_acked')}</span>}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {!p.acknowledged_at && <button type="button" onClick={() => acknowledgePanic(p.id)} style={{ ...resolveBtn, color: '#58a6ff', borderColor: 'rgba(88,166,255,0.4)', background: 'rgba(88,166,255,0.1)' }}>{t('acknowledge')}</button>}
                {p.phone && <a href={`tel:${p.phone}`} style={{ ...resolveBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{t('call')}</a>}
                <button type="button" onClick={() => openPanicDispatch(p)} style={{ ...resolveBtn, color: '#58a6ff', borderColor: 'rgba(88,166,255,0.4)', background: 'rgba(88,166,255,0.1)' }}>{t('send_team')}</button>
                <button type="button" onClick={() => { setResolvePanicFor(p); setPanicNote('') }} style={resolveBtn}>{t('resolve')}</button>
              </div>
            </div>
          )
        }
        if (selected.kind === 'facility') {
          const f = facilities.find((x) => x.id === selected.id)
          if (!f) return null
          return <div className="board-detail" style={detailCard}>{header(f.name, f.status)}{f.status_updated_at && <div style={{ fontSize: 11, color: '#8b949e' }}>{t('updated_w')} {timeAgo(f.status_updated_at)}</div>}</div>
        }
        return null
      })()}

      {/* Base-map style switcher + worker-pins toggle */}
      <div style={styleSwitcher}>
        {MAP_STYLES.map((s) => (
          <button key={s.id} type="button" onClick={() => changeMapStyle(s.id)} style={styleBtn(mapStyle === s.id)}>{t(`style_${s.id}`)}</button>
        ))}
        <div style={{ width: 1, background: '#21262d', margin: '0 2px' }} />
        <button type="button" onClick={() => { const next = !showWorkers; setShowWorkers(next); showWorkersRef.current = next; renderSources() }} style={styleBtn(showWorkers)}>
          {t('workers')}{workers.length ? ` (${workers.length})` : ''}
        </button>
        <button type="button" onClick={() => { const next = !showFacilities; setShowFacilities(next); showFacilitiesRef.current = next; renderSources() }} style={styleBtn(showFacilities)}>
          {t('facilities')}{facilities.length ? ` (${facilities.length})` : ''}
        </button>
      </div>

      {/* Collapse toggle */}
      <button type="button" onClick={() => setPanelOpen((o) => !o)} style={{ ...toggleBtn, right: isMobile ? 12 : (panelOpen ? 340 : 12) }}>
        {panelOpen ? (isMobile ? '✕' : '›') : '‹'}
      </button>

      {/* Side panel */}
      {panelOpen && (
        <div style={{ ...panel, width: isMobile ? '100%' : 328 }}>
          {/* Custom incidents (911-style) */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('inc_title')}</div>
              <button type="button" onClick={() => { setCreating(true); setAddr('') }} style={rollBtn}>{t('new_incident')}</button>
            </div>
            {creating && <div style={{ fontSize: 12, color: '#58a6ff', marginTop: 8 }}>{t('click_map')}</div>}
            {creating && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input style={{ ...noteField, flex: 1 }} placeholder={t('type_address')} value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') geocodeAddress() }} />
                <button type="button" onClick={geocodeAddress} disabled={incBusy} style={rollBtn}>{t('find')}</button>
              </div>
            )}
            {customIncidents.length === 0 && !creating && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 8 }}>{t('no_active_inc')}</div>}
            {customIncidents.map((i) => {
              const d = dispatches.find((x) => x.ngo_incident_id === i.id && ACTIVE_DISPATCH.includes(x.status))
              return (
                <div key={i.id} style={{ padding: '8px 0', borderBottom: '1px solid #1b2027' }}>
                  <div onClick={() => selectAndFly('custom', i.id, i.lon, i.lat)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{i.title}</div>
                    <span style={{ fontSize: 10, color: SEVERITY_COLOUR[i.severity] ?? '#8b949e', whiteSpace: 'nowrap' }}>● {i.severity}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                    {[i.category, i.address].filter(Boolean).join(' · ') || `${i.lat.toFixed(3)}, ${i.lon.toFixed(3)}`}
                  </div>
                  {d
                    ? <div style={{ fontSize: 12, color: '#3fb950', marginTop: 6 }}>🚑 {d.team_name} · <StatusPill status={d.status} lang={lang} /></div>
                    : <span style={{ fontSize: 11, color: '#f97316' }}>{t('unassigned')}</span>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {!d && <button type="button" onClick={() => openAssignIncident(i)} style={assignBtn}>{t('assign')}</button>}
                    <button type="button" onClick={() => resolveIncident(i.id)} style={{ ...assignBtn, color: '#8b949e', borderColor: '#21262d', background: 'rgba(255,255,255,0.04)' }}>{t('resolve')}</button>
                    <button type="button" onClick={() => setCustomStatus(i.id, 'dismissed', t('cf_dismiss_custom'))} style={{ ...assignBtn, color: '#8b949e', borderColor: '#21262d', background: 'rgba(255,255,255,0.04)' }}>{t('dismiss')}</button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Active panics — top priority */}
          {panics.length > 0 && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', background: 'rgba(248,81,73,0.08)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f85149' }}>🆘 {panics.length} {panics.length === 1 ? t('ps_active') : t('ps_active_pl')}</div>
              {panics.map((p) => (
                <div key={p.id} style={{ borderTop: '1px solid rgba(248,81,73,0.2)', paddingTop: 8, marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: '#e6edf3' }}>
                    <strong>{p.name}</strong> · {timeAgo(p.created_at)}
                    {p.silent && <span style={{ fontSize: 10, color: '#8b949e', marginLeft: 6 }}>{t('silent')}</span>}
                    {p.reason && <span style={{ fontSize: 10, color: '#d29922', marginLeft: 6 }}>{p.reason}</span>}
                    <div style={{ color: '#8b949e' }}>{p.lat != null && p.lon != null ? `${t('last_known_lc')} ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)} · ${timeAgo(p.created_at)}` : t('no_location_lc')}</div>
                    {p.acknowledged_at
                      ? <div style={{ color: '#3fb950' }}>✓ {t('ack_by')} {p.acknowledged_by_name}</div>
                      : <div style={{ color: '#d29922' }}>● {t('not_acked')}</div>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {!p.acknowledged_at && <button type="button" onClick={() => acknowledgePanic(p.id)} style={{ ...resolveBtn, color: '#58a6ff', borderColor: 'rgba(88,166,255,0.4)', background: 'rgba(88,166,255,0.1)' }}>{t('acknowledge')}</button>}
                    {p.phone && <a href={`tel:${p.phone}`} style={{ ...resolveBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{t('call')}</a>}
                    {p.lat != null && p.lon != null && <button type="button" onClick={() => locatePanic(p)} style={{ ...resolveBtn, color: '#a371f7', borderColor: 'rgba(163,113,247,0.4)', background: 'rgba(163,113,247,0.1)' }}>{t('locate_btn')}</button>}
                    <button type="button" onClick={() => openPanicDispatch(p)} style={{ ...resolveBtn, color: '#58a6ff', borderColor: 'rgba(88,166,255,0.4)', background: 'rgba(88,166,255,0.1)' }}>{t('send_team')}</button>
                    <button type="button" onClick={() => { setResolvePanicFor(p); setPanicNote('') }} style={resolveBtn}>{t('resolve')}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Roll call */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('rc_title')}</div>
              <button type="button" onClick={startRollCall} disabled={rcBusy} style={rollBtn}>{rcBusy ? '…' : rollCall ? t('rc_new') : t('rc_start')}</button>
            </div>
            {rollCall ? (
              <>
                {/* Headcount: X of Y safe (Y excludes off-duty exempt). Off-duty workers are
                    NEVER counted as missing. awaiting (on-duty, no answer) ≠ unsafe. */}
                <div style={{ fontSize: 12, color: '#8b949e', margin: '8px 0 4px' }}>
                  <span style={{ color: '#3fb950', fontWeight: 600 }}>{rollCall.safe_count} {t('rc_of')} {rollCall.total} {t('rc_safe')}</span>
                  {rollCall.awaiting_count > 0 && <span style={{ color: '#8b949e' }}> · {rollCall.awaiting_count} {t('awaiting')}</span>}
                  {rollCall.unsafe_count > 0 && <span style={{ color: '#f85149' }}> · {rollCall.unsafe_count} {t('unsafe')}</span>}
                  {' · '}{timeAgo(rollCall.created_at)}
                </div>
                {rollCall.total > 0 && (
                  <div style={{ height: 6, borderRadius: 999, background: '#21262d', overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${Math.round((rollCall.safe_count / rollCall.total) * 100)}%`, background: '#3fb950', transition: 'width 0.3s' }} />
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {rollCall.members.filter((m) => m.state !== 'off_duty').map((m) => {
                    const c = m.state === 'safe' ? '#3fb950' : m.state === 'unsafe' ? '#f85149' : '#8b949e'
                    const icon = m.state === 'safe' ? '✓' : m.state === 'unsafe' ? '⚠' : '○'
                    return (
                      <span key={m.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: `${c}26`, color: c }}>
                        {icon} {m.name}{m.state === 'awaiting' ? ` · ${t('awaiting')}` : ''}
                      </span>
                    )
                  })}
                  {rollCall.total === 0 && rollCall.off_duty_count > 0 && <span style={{ fontSize: 11, color: '#8b949e' }}>{t('rc_all_off')}</span>}
                  {rollCall.members.length === 0 && <span style={{ fontSize: 11, color: '#8b949e' }}>{t('rc_no_fc')}</span>}
                </div>
                {/* Off-duty = exempt, shown separately so they're never mistaken for missing. */}
                {rollCall.off_duty_count > 0 && (
                  <div style={{ fontSize: 11, color: '#a371f7', marginTop: 8 }}>
                    {t('rc_off_exempt')} {rollCall.members.filter((m) => m.state === 'off_duty').map((m) => m.name).join(', ')}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>{t('rc_none')}</div>
            )}
          </div>

          <div style={{ padding: '14px 16px', borderBottom: '1px solid #21262d' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{t('feed_title')}</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
              {feed.length} {t('in_area')} · {gapCount > 0 ? <span style={{ color: '#f85149' }}>{gapCount} unassigned</span> : t('all_assigned')}
            </div>
            {/* Time window — default last 10 days, expand to show older. */}
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {([['10', '10d'], ['30', '30d'], ['90', '90d'], ['all', t('range_all')]]).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setWindow(v)} style={rangeBtn(windowDays === v)}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {feed.length === 0 && <div style={{ padding: 16, fontSize: 13, color: '#8b949e' }}>{t('no_in_area')}</div>}
            {feed.map((c) => {
              const overdue = !c.covered && Date.now() - new Date(c.created_at).getTime() > 30 * 60000
              return (
                <div key={c.id} style={{ ...feedCard, borderLeft: selected?.kind === 'incident' && selected.id === c.id ? '3px solid #58a6ff' : overdue ? '3px solid #f85149' : '3px solid transparent', background: selected?.kind === 'incident' && selected.id === c.id ? 'rgba(88,166,255,0.06)' : undefined }}>
                  <div onClick={() => selectAndFly('incident', c.id, c.lon, c.lat)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{locNames[c.id] ?? t('locating')}</div>
                    <span style={{ fontSize: 10, color: STATUS_HEX[c.status] ?? '#8b949e', whiteSpace: 'nowrap' }}>● {t(`st_${c.status}`)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                    {c.confidence_score}% · {c.report_count} {c.report_count === 1 ? t('report') : t('reports')} · {timeAgo(c.created_at)}
                    {!c.covered && <span style={{ color: '#f85149' }}> · {t('unassigned')}</span>}
                  </div>
                  {(() => {
                    const d = activeDispatchFor(c.id)
                    if (d) return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          🚑 {d.team_name} · <StatusPill status={d.status} lang={lang} />
                          {d.response_minutes != null && <span> · {d.response_minutes}m {t('response')}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => openChangeTeam(d)} style={{ ...assignBtn, marginTop: 0 }}>{t('change_team')}</button>
                          <button type="button" onClick={() => openChangeIncident(d)} style={{ ...assignBtn, marginTop: 0 }}>{t('change_incident')}</button>
                          <button type="button" onClick={() => { setRecallFor({ id: d.id, team: d.team_name }) }} style={{ ...assignBtn, marginTop: 0, color: '#f85149', borderColor: 'rgba(248,81,73,0.35)', background: 'rgba(248,81,73,0.08)' }}>{t('recall')}</button>
                        </div>
                      </div>
                    )
                    return (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => openAssign(c)} style={assignBtn}>{t('assign')}</button>
                        <button type="button" onClick={() => setClusterHandling(c.id, 'dismiss', t('cf_dismiss_cluster'))} style={{ ...assignBtn, color: '#8b949e', borderColor: '#21262d', background: 'rgba(255,255,255,0.04)' }}>{t('dismiss')}</button>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>

          {/* Handled (dismissed / completed) — collapsible reopen list */}
          <div style={{ borderTop: '1px solid #21262d', flexShrink: 0 }}>
            <button type="button" onClick={() => setHandledOpen((o) => !o)} style={handledHeader}>
              <span>{handledOpen ? '▾' : '▸'} Handled ({handledIncidents.length + handledCustom.length})</span>
            </button>
            {handledOpen && (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {handledIncidents.length + handledCustom.length === 0 && (
                  <div style={{ padding: '8px 16px', fontSize: 12, color: '#8b949e' }}>{t('nothing_handled')}</div>
                )}
                {handledIncidents.map((c) => (
                  <div key={c.id} style={handledRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locNames[c.id] ?? 'Incident'}</div>
                      <div style={{ fontSize: 11, color: '#8b949e' }}>{c.handling === 'completed' ? t('completed') : t('dismissed_w')} · {t(`st_${c.status}`)}</div>
                    </div>
                    <button type="button" onClick={() => setClusterHandling(c.id, 'reopen')} style={reopenBtn}>{t('reopen')}</button>
                  </div>
                ))}
                {handledCustom.map((i) => (
                  <div key={i.id} style={handledRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</div>
                      <div style={{ fontSize: 11, color: '#8b949e' }}>{i.status === 'resolved' ? t('resolved_w') : t('dismissed_w')} · {t('incident_w')}</div>
                    </div>
                    <button type="button" onClick={() => setCustomStatus(i.id, 'open')} style={reopenBtn}>{t('reopen')}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New custom incident — details form (location already chosen) */}
      {newInc && (
        <ModalShell onClose={() => setNewInc(null)} width={380} title={t('ni_title')} subtitle={newInc.address || `${newInc.lat.toFixed(4)}, ${newInc.lon.toFixed(4)}`}>
          <input style={noteField} placeholder={t('ni_title_ph')} value={newInc.title} onChange={(e) => setNewInc({ ...newInc, title: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select style={{ ...noteField, flex: 1 }} value={newInc.category} onChange={(e) => setNewInc({ ...newInc, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={{ ...noteField, flex: 1 }} value={newInc.severity} onChange={(e) => setNewInc({ ...newInc, severity: e.target.value })}>
              {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <textarea style={{ ...noteField, height: 70, paddingTop: 8, marginTop: 8 }} placeholder={t('ni_details_ph')} value={newInc.description} onChange={(e) => setNewInc({ ...newInc, description: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={createIncident} disabled={incBusy || !newInc.title.trim()} style={{ ...assignBtn, flex: 1, opacity: incBusy || !newInc.title.trim() ? 0.6 : 1 }}>{incBusy ? t('creating') : t('create_inc')}</button>
            <button type="button" onClick={() => setNewInc(null)} style={{ ...assignBtn, flex: 1 }}>{t('cancel')}</button>
          </div>
        </ModalShell>
      )}

      {/* Assign a team to a custom incident */}
      {assignIncFor && (
        <ModalShell onClose={() => setAssignIncFor(null)} width={360} title={`${t('ai_title')} ${assignIncFor.title}`} subtitle={`${assignIncFor.address || `${assignIncFor.lat.toFixed(4)}, ${assignIncFor.lon.toFixed(4)}`} · ${t('alerted_push')}`}>
          <TeamPicker lang={lang} busy={incBusy} teams={incTeams} onPick={assignIncidentTeam} emptyText={t('no_teams')} />
          <button type="button" onClick={() => setAssignIncFor(null)} style={{ ...assignBtn, marginTop: 12 }}>{t('cancel')}</button>
        </ModalShell>
      )}

      {/* Send-a-crew-to-panic modal */}
      {panicDispatchFor && (
        <ModalShell onClose={() => setPanicDispatchFor(null)} width={360} title={`${t('pd_title')} ${panicDispatchFor.name}`}
          subtitle={`${panicDispatchFor.lat != null && panicDispatchFor.lon != null ? `${t('pd_last_seen')} ${panicDispatchFor.lat.toFixed(4)}, ${panicDispatchFor.lon.toFixed(4)}` : t('pd_no_loc')} · ${t('pd_alerted')}`}>
          <TeamPicker lang={lang} busy={panicBusy} teams={panicTeams} onPick={sendPanicTeam} emptyText={t('no_teams')} />
          <button type="button" onClick={() => setPanicDispatchFor(null)} style={{ ...assignBtn, marginTop: 12 }}>{t('cancel')}</button>
        </ModalShell>
      )}

      {/* Resolve-panic modal — outcome note required; a panic never auto-closes */}
      {resolvePanicFor && (
        <ModalShell onClose={() => setResolvePanicFor(null)} width={360} title={`${t('rp_title')} ${resolvePanicFor.name}${t('rp_poss')}`} subtitle={t('rp_note')}>
          <textarea value={panicNote} onChange={(e) => setPanicNote(e.target.value)} placeholder={t('rp_ph')} style={{ ...noteField, height: 84, paddingTop: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" disabled={panicNote.trim().length < 10} onClick={() => resolvePanic(resolvePanicFor.id, panicNote)} style={{ ...assignBtn, flex: 1, color: '#3fb950', borderColor: 'rgba(63,185,80,0.4)', background: 'rgba(63,185,80,0.1)', opacity: panicNote.trim().length < 10 ? 0.5 : 1 }}>{t('resolve')}</button>
            <button type="button" onClick={() => setResolvePanicFor(null)} style={{ ...assignBtn, flex: 1 }}>{t('cancel')}</button>
          </div>
        </ModalShell>
      )}

      {/* Recall modal — shared dialog */}
      {recallFor && (
        <RecallDialog lang={lang} teamName={recallFor.team} onClose={() => setRecallFor(null)} onConfirm={(r) => confirmRecall(r)} />
      )}

      {/* Change-team / change-incident reassign modals */}
      {reassignTeamFor && (
        <ModalShell onClose={() => setReassignTeamFor(null)} width={360} title={t('change_team')} subtitle={`${t('rs_currently')} ${reassignTeamFor.team_name ?? ''}. ${t('rs_swap_note')}`}>
          <input style={noteField} placeholder={t('reason_opt')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div style={{ marginTop: 10 }}>
            <TeamPicker lang={lang} teams={reassignTeams.filter((tm) => tm.id !== reassignTeamFor.team_id)} onPick={doReassignTeam} emptyText={t('rs_no_other_teams')} />
          </div>
          <button type="button" onClick={() => setReassignTeamFor(null)} style={{ ...assignBtn, marginTop: 12 }}>{t('cancel')}</button>
        </ModalShell>
      )}

      {reassignFor && (
        <ModalShell onClose={() => setReassignFor(null)} width={360} title={t('change_incident')} subtitle={t('rs_move_to_inc')}>
          <input style={noteField} placeholder={t('reason_opt')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {feed.filter((i) => i.id !== reassignFor.cluster_id).map((i) => (
              <button key={i.id} type="button" onClick={() => doReassign(i.id)} style={teamRow}>{locNames[i.id] ?? `${i.lat.toFixed(3)}, ${i.lon.toFixed(3)}`}</button>
            ))}
            {feed.filter((i) => i.id !== reassignFor.cluster_id).length === 0 && <div style={{ fontSize: 13, color: '#8b949e' }}>{t('rs_no_other_inc')}</div>}
          </div>
          <button type="button" onClick={() => setReassignFor(null)} style={{ ...assignBtn, marginTop: 12 }}>{t('cancel')}</button>
        </ModalShell>
      )}

      {/* Assign modal — teams ranked by type match + proximity */}
      {assignFor && (
        <ModalShell onClose={() => setAssignFor(null)} width={380} title={t('as_title')} subtitle={locNames[assignFor.id] ?? `${assignFor.lat.toFixed(3)}, ${assignFor.lon.toFixed(3)}`}>
          <input style={noteField} placeholder={t('note_opt')} value={assignNote} onChange={(e) => setAssignNote(e.target.value)} />
          <div style={{ marginTop: 10 }}>
            <TeamPicker lang={lang} busy={assignBusy} teams={rankedTeams} onPick={assignTeam} emptyText={t('no_teams_avail')} />
          </div>
          <button type="button" onClick={() => setAssignFor(null)} style={{ ...assignBtn, marginTop: 12 }}>{t('cancel')}</button>
        </ModalShell>
      )}
    </div>
  )
}

const panicStrip: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9,
  background: '#da3633', color: '#fff', fontSize: 13, fontWeight: 700, textAlign: 'center',
  padding: '8px 12px', cursor: 'pointer', fontFamily: 'system-ui',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
}
const panel: React.CSSProperties = {
  position: 'absolute', top: 0, right: 0, bottom: 0, width: 328, zIndex: 6,
  background: 'rgba(13,17,23,0.95)', borderLeft: '1px solid #21262d',
  display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', color: '#e6edf3',
}
const toggleBtn: React.CSSProperties = {
  position: 'absolute', top: 12, zIndex: 7, width: 34, height: 34, borderRadius: 6,
  background: 'rgba(13,17,23,0.95)', border: '1px solid #21262d', color: '#8b949e', cursor: 'pointer', fontFamily: 'system-ui',
}
const statusChip: React.CSSProperties = { position: 'absolute', top: 12, insetInlineStart: 12, zIndex: 7, fontSize: 12, color: '#8b949e', background: 'rgba(13,17,23,0.95)', border: '1px solid #21262d', borderRadius: 999, padding: '4px 12px', fontFamily: 'system-ui', whiteSpace: 'nowrap' }
const detailCard: React.CSSProperties = { position: 'absolute', top: 56, insetInlineStart: 12, zIndex: 8, width: 300, maxWidth: 'calc(100vw - 24px)', background: 'rgba(13,17,23,0.97)', border: '1px solid #21262d', borderRadius: 10, padding: 14, color: '#e6edf3', fontFamily: 'system-ui', boxShadow: '0 8px 28px rgba(0,0,0,0.5)' }
const searchWrap: React.CSSProperties = { position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 8, width: 'min(400px, calc(100vw - 24px))', display: 'flex', flexDirection: 'column', gap: 6 }
const searchInput: React.CSSProperties = { flex: 1, height: 38, background: 'rgba(13,17,23,0.95)', border: '1px solid #21262d', borderRadius: 8, color: '#e6edf3', padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'system-ui' }
const searchIconBtn: React.CSSProperties = { flexShrink: 0, width: 40, height: 38, background: 'rgba(13,17,23,0.95)', border: '1px solid #21262d', borderRadius: 8, color: '#58a6ff', cursor: 'pointer', fontSize: 16, fontFamily: 'system-ui' }
const searchResultsBox: React.CSSProperties = { background: 'rgba(13,17,23,0.97)', border: '1px solid #21262d', borderRadius: 8, overflow: 'hidden auto', maxHeight: 'min(50vh, 320px)' }
const searchResultRow: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid #1b2027', color: '#e6edf3', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const legendBox: React.CSSProperties = { position: 'absolute', bottom: 52, insetInlineStart: 12, zIndex: 7, background: 'rgba(13,17,23,0.9)', border: '1px solid #21262d', borderRadius: 8, padding: '6px 10px', fontFamily: 'system-ui', maxWidth: 200 }
const legendHeader: React.CSSProperties = { background: 'none', border: 'none', color: '#8b949e', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', padding: 0 }
const legendSectionLabel: React.CSSProperties = { fontSize: 9, color: '#484f58', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '4px 0 2px' }
const styleSwitcher: React.CSSProperties = { position: 'absolute', bottom: 12, insetInlineStart: 12, zIndex: 7, display: 'flex', gap: 4, background: 'rgba(13,17,23,0.9)', border: '1px solid #21262d', borderRadius: 8, padding: 4 }
function styleBtn(active: boolean): React.CSSProperties {
  return { height: 32, padding: '0 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui', whiteSpace: 'nowrap', background: active ? 'rgba(88,166,255,0.15)' : 'transparent', border: active ? '1px solid #58a6ff' : '1px solid transparent', color: active ? '#58a6ff' : '#8b949e' }
}
const chipRetry: React.CSSProperties = { marginInlineStart: 6, background: 'none', border: 'none', color: '#f85149', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }
function rangeBtn(active: boolean): React.CSSProperties {
  return { flex: 1, height: 32, borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(88,166,255,0.15)' : 'rgba(255,255,255,0.04)', border: active ? '1px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }
}
const resolveBtn: React.CSSProperties = { flexShrink: 0, height: 26, padding: '0 10px', background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.4)', color: '#3fb950', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui' }
const rollBtn: React.CSSProperties = {
  height: 28, padding: '0 12px', background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.4)',
  color: '#3fb950', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui',
}
const feedCard: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #21262d' }
const handledHeader: React.CSSProperties = { width: '100%', textAlign: 'left', padding: '10px 16px', background: 'rgba(255,255,255,0.02)', border: 'none', color: '#8b949e', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const handledRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 16px', borderTop: '1px solid #1b2027' }
const reopenBtn: React.CSSProperties = { flexShrink: 0, height: 26, padding: '0 10px', background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.35)', color: '#58a6ff', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui' }
const assignBtn: React.CSSProperties = {
  marginTop: 8, height: 28, padding: '0 12px', background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.35)',
  color: '#58a6ff', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui',
}
const noteField: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const teamRow: React.CSSProperties = { textAlign: 'left', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: '8px 10px', color: '#e6edf3', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
