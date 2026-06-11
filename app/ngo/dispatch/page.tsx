'use client'

import { useEffect, useState, useCallback } from 'react'
import { useConfirm, useToast, SkeletonRows } from '@/lib/ngo-ui'
import { useNgoLang, makeT, type Lang } from '@/lib/use-ngo-lang'
import { StatusPill, ModalShell, TeamPicker, RecallDialog } from '@/lib/ngo-dispatch-ui'

// Leader/admin dispatch board: every dispatch (active + history) with team,
// status, response time, the note, and the on-scene report. Reassign / recall
// in two taps. Incident choices for reassign come from the live board feed.
// Status pill, modal shell, team picker and recall dialog are shared with the
// situation board via lib/ngo-dispatch-ui so both surfaces stay identical.

const LANG = {
  en: { title: 'Dispatch', subtitle: 'Teams in the field and their response.', loading: 'Loading…', refresh_fail: 'Couldn’t refresh dispatches.', retry: 'Retry', active: 'Active', history: 'History', clear_history: 'Clear history', clearing: 'Clearing…', none: 'None.', team: 'Team', assigned: 'assigned', response: 'response', onscene: 'On-scene report', people: 'People assisted', services: 'Services', hazards: 'New hazards', change_team: 'Change team', change_incident: 'Change incident', recall: 'Recall', cancel: 'Cancel', reason_opt: 'Reason (optional)', reassign_inc_title: 'Reassign', move_to_inc: 'Move to incident:', no_in_area: 'No in-area incidents.', reassign_team_title: 'Reassign to another team', currently: 'Currently', team_swap_note: 'The new team is dispatched; the current team stands down.', move_to_team: 'Move to team:', no_other_teams: 'No other teams.', off_duty: 'off duty', no_app: 'no app access', recall_sub: 'The team stands down and the incident reopens as a coverage gap.', st_assigned: 'Assigned', st_en_route: 'En route', st_on_scene: 'On scene', st_done: 'Done', st_cancelled: 'Cancelled', clear_confirm_title: 'Delete all closed dispatches?', clear_confirm_body: 'This removes done & cancelled dispatches and their on-scene reports. Active dispatches are kept. This cannot be undone.', del: 'Delete', t_recalled: 'Team recalled', t_reassigned: 'Dispatch reassigned', t_team_reassigned: 'Team reassigned', t_cleared: 'History cleared', e_recall: 'Could not recall team', e_reassign: 'Could not reassign', e_team: 'Could not reassign team', e_clear: 'Could not clear history' },
  fr: { title: 'Déploiement', subtitle: 'Les équipes sur le terrain et leur réponse.', loading: 'Chargement…', refresh_fail: 'Échec de l’actualisation des déploiements.', retry: 'Réessayer', active: 'Actifs', history: 'Historique', clear_history: 'Vider l’historique', clearing: 'Suppression…', none: 'Aucun.', team: 'Équipe', assigned: 'assigné', response: 'réponse', onscene: 'Rapport sur place', people: 'Personnes aidées', services: 'Services', hazards: 'Nouveaux dangers', change_team: 'Changer d’équipe', change_incident: 'Changer d’incident', recall: 'Rappeler', cancel: 'Annuler', reason_opt: 'Raison (facultatif)', reassign_inc_title: 'Réaffecter', move_to_inc: 'Vers l’incident :', no_in_area: 'Aucun incident dans la zone.', reassign_team_title: 'Réaffecter à une autre équipe', currently: 'Actuellement', team_swap_note: 'La nouvelle équipe est déployée ; l’équipe actuelle se retire.', move_to_team: 'Vers l’équipe :', no_other_teams: 'Aucune autre équipe.', off_duty: 'hors service', no_app: 'sans accès à l’app', recall_sub: 'L’équipe se retire et l’incident redevient une lacune de couverture.', st_assigned: 'Assigné', st_en_route: 'En route', st_on_scene: 'Sur place', st_done: 'Terminé', st_cancelled: 'Annulé', clear_confirm_title: 'Supprimer tous les déploiements clôturés ?', clear_confirm_body: 'Supprime les déploiements terminés et annulés et leurs rapports. Les actifs sont conservés. Irréversible.', del: 'Supprimer', t_recalled: 'Équipe rappelée', t_reassigned: 'Déploiement réaffecté', t_team_reassigned: 'Équipe réaffectée', t_cleared: 'Historique vidé', e_recall: 'Échec du rappel', e_reassign: 'Échec de la réaffectation', e_team: 'Échec de la réaffectation d’équipe', e_clear: 'Échec de la suppression' },
  ar: { title: 'الإيفاد', subtitle: 'الفِرق في الميدان واستجابتها.', loading: 'جارٍ التحميل…', refresh_fail: 'تعذّر تحديث عمليات الإيفاد.', retry: 'إعادة المحاولة', active: 'نشطة', history: 'السجل', clear_history: 'مسح السجل', clearing: 'جارٍ المسح…', none: 'لا شيء.', team: 'فريق', assigned: 'كُلِّف', response: 'الاستجابة', onscene: 'تقرير الموقع', people: 'عدد المستفيدين', services: 'الخدمات', hazards: 'مخاطر جديدة', change_team: 'تغيير الفريق', change_incident: 'تغيير الحادثة', recall: 'استدعاء', cancel: 'إلغاء', reason_opt: 'السبب (اختياري)', reassign_inc_title: 'إعادة التعيين', move_to_inc: 'نقل إلى الحادثة:', no_in_area: 'لا حوادث في المنطقة.', reassign_team_title: 'إعادة التعيين لفريق آخر', currently: 'حالياً', team_swap_note: 'يُرسَل الفريق الجديد ويتوقف الفريق الحالي.', move_to_team: 'نقل إلى فريق:', no_other_teams: 'لا توجد فِرق أخرى.', off_duty: 'خارج الخدمة', no_app: 'لا وصول للتطبيق', recall_sub: 'يتوقف الفريق وتعود الحادثة كفجوة تغطية.', st_assigned: 'مُكلّف', st_en_route: 'في الطريق', st_on_scene: 'في الموقع', st_done: 'منجز', st_cancelled: 'ملغى', clear_confirm_title: 'حذف كل عمليات الإيفاد المغلقة؟', clear_confirm_body: 'يحذف عمليات الإيفاد المنجزة والملغاة وتقاريرها. تبقى النشطة. لا يمكن التراجع.', del: 'حذف', t_recalled: 'تم استدعاء الفريق', t_reassigned: 'أُعيد تعيين الإيفاد', t_team_reassigned: 'أُعيد تعيين الفريق', t_cleared: 'تم مسح السجل', e_recall: 'تعذّر الاستدعاء', e_reassign: 'تعذّرت إعادة التعيين', e_team: 'تعذّرت إعادة تعيين الفريق', e_clear: 'تعذّر مسح السجل' },
} as const

interface Dispatch {
  id: string; cluster_id: string; team_id: string | null; team_name: string | null; team_type: string | null; status: string
  note: string | null; assigned_at: string; response_minutes: number | null
  report: { people_assisted: number | null; services: string | null; new_hazards: string | null } | null
}
interface Incident { id: string; lat: number; lon: number; inside: boolean }
interface Team { id: string; name: string; type: string; status: string; all_off_duty?: boolean; notifiable_count?: number }

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

export default function NgoDispatchPage() {
  const confirm = useConfirm()
  const toast = useToast()
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [reassignFor, setReassignFor] = useState<Dispatch | null>(null)
  const [reassignTeamFor, setReassignTeamFor] = useState<Dispatch | null>(null)
  const [recallFor, setRecallFor] = useState<Dispatch | null>(null)
  const [reason, setReason] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    try {
      const [dRes, bRes, tRes] = await Promise.all([fetch('/api/ngo/dispatch'), fetch('/api/ngo/board'), fetch('/api/ngo/teams')])
      if (!dRes.ok) { setLoadError(true); setLoaded(true); return }
      setDispatches((await dRes.json()).dispatches ?? [])
      if (bRes.ok) setIncidents(((await bRes.json()).incidents ?? []).filter((i: Incident) => i.inside))
      if (tRes.ok) setTeams((await tRes.json()).teams ?? [])
      setLoadError(false); setLoaded(true)
    } catch { setLoadError(true); setLoaded(true) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 8000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', load)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', load)
    }
  }, [load])

  async function confirmRecall(reasonArg: string) {
    if (!recallFor) return
    const res = await fetch(`/api/ngo/dispatch/${recallFor.id}/recall`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reasonArg }) })
    if (res.ok) { setRecallFor(null); toast(t('t_recalled')); load() } else toast(t('e_recall'), 'error')
  }
  async function doReassign(clusterId: string) {
    if (!reassignFor) return
    const res = await fetch(`/api/ngo/dispatch/${reassignFor.id}/reassign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cluster_id: clusterId, reason }) })
    if (res.ok) { setReassignFor(null); setReason(''); toast(t('t_reassigned')); load() } else toast(t('e_reassign'), 'error')
  }
  async function doReassignTeam(teamId: string) {
    if (!reassignTeamFor) return
    const res = await fetch(`/api/ngo/dispatch/${reassignTeamFor.id}/reassign-team`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId, reason }) })
    if (res.ok) { setReassignTeamFor(null); setReason(''); toast(t('t_team_reassigned')); load() } else toast(t('e_team'), 'error')
  }
  const [clearing, setClearing] = useState(false)
  async function clearHistory() {
    if (!(await confirm({ title: t('clear_confirm_title'), body: t('clear_confirm_body'), danger: true, confirmLabel: t('del') }))) return
    setClearing(true)
    try {
      const res = await fetch('/api/ngo/dispatch', { method: 'DELETE' })
      if (res.ok) { toast(t('t_cleared')); load() } else toast(t('e_clear'), 'error')
    } finally { setClearing(false) }
  }

  const active = dispatches.filter((d) => ['assigned', 'en_route', 'on_scene'].includes(d.status))
  const closed = dispatches.filter((d) => ['done', 'cancelled'].includes(d.status))

  return (
    <div className="ngo-page" style={{ padding: 24, maxWidth: 900, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }} dir={isRtl ? 'rtl' : 'ltr'}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
      <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2, marginBottom: 20 }}>{t('subtitle')}</div>

      {!loaded && <SkeletonRows rows={3} />}
      {loaded && loadError && (
        <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 16 }}>
          {t('refresh_fail')} <button type="button" onClick={load} style={{ marginInlineStart: 8, background: 'none', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 4, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }}>{t('retry')}</button>
        </div>
      )}

      <Section t={t} lang={lang} title={`${t('active')} (${active.length})`} rows={active} onRecall={(d) => { setRecallFor(d); setReason('') }} onReassign={(d) => { setReassignFor(d); setReason('') }} onReassignTeam={(d) => { setReassignTeamFor(d); setReason('') }} />
      <Section
        t={t}
        lang={lang}
        title={`${t('history')} (${closed.length})`}
        rows={closed}
        onRecall={(d) => { setRecallFor(d); setReason('') }}
        onReassign={(d) => { setReassignFor(d); setReason('') }}
        onReassignTeam={(d) => { setReassignTeamFor(d); setReason('') }}
        action={closed.length > 0
          ? <button type="button" onClick={clearHistory} disabled={clearing} style={{ height: 28, padding: '0 12px', background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui', opacity: clearing ? 0.6 : 1 }}>{clearing ? t('clearing') : t('clear_history')}</button>
          : null}
      />

      {reassignFor && (
        <ModalShell onClose={() => setReassignFor(null)} width={360} title={`${t('reassign_inc_title')} — ${reassignFor.team_name}`}>
          <input style={input} placeholder={t('reason_opt')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div style={{ fontSize: 12, color: '#8b949e', margin: '10px 0 6px' }}>{t('move_to_inc')}</div>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {incidents.filter((i) => i.id !== reassignFor.cluster_id).map((i) => (
              <button key={i.id} type="button" onClick={() => doReassign(i.id)} style={incBtn}>{i.lat.toFixed(3)}, {i.lon.toFixed(3)}</button>
            ))}
            {incidents.length === 0 && <div style={{ fontSize: 13, color: '#8b949e' }}>{t('no_in_area')}</div>}
          </div>
          <button type="button" onClick={() => setReassignFor(null)} style={{ ...incBtn, marginTop: 12, borderColor: '#21262d', color: '#8b949e' }}>{t('cancel')}</button>
        </ModalShell>
      )}

      {reassignTeamFor && (
        <ModalShell onClose={() => setReassignTeamFor(null)} width={360} title={t('reassign_team_title')} subtitle={`${t('currently')} ${reassignTeamFor.team_name ?? t('team')}. ${t('team_swap_note')}`}>
          <input style={input} placeholder={t('reason_opt')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div style={{ fontSize: 12, color: '#8b949e', margin: '10px 0 6px' }}>{t('move_to_team')}</div>
          <TeamPicker lang={lang} teams={teams.filter((tm) => tm.id !== reassignTeamFor.team_id)} onPick={doReassignTeam} emptyText={t('no_other_teams')} />
          <button type="button" onClick={() => setReassignTeamFor(null)} style={{ ...incBtn, marginTop: 12, borderColor: '#21262d', color: '#8b949e' }}>{t('cancel')}</button>
        </ModalShell>
      )}

      {recallFor && (
        <RecallDialog lang={lang} teamName={recallFor.team_name} onClose={() => setRecallFor(null)} onConfirm={(r) => confirmRecall(r)} />
      )}
    </div>
  )
}

function Section({ title, rows, onRecall, onReassign, onReassignTeam, action, t, lang }: { title: string; rows: Dispatch[]; onRecall: (d: Dispatch) => void; onReassign: (d: Dispatch) => void; onReassignTeam: (d: Dispatch) => void; action?: React.ReactNode; t: (k: string) => string; lang: Lang }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#8b949e' }}>{title}</div>
        {action}
      </div>
      {rows.length === 0 && <div style={{ fontSize: 13, color: '#484f58' }}>{t('none')}</div>}
      {rows.map((d) => {
        const open = ['assigned', 'en_route', 'on_scene'].includes(d.status)
        return (
          <div key={d.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>{d.team_name ?? t('team')} <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 400 }}>· {d.team_type}</span></div>
              <StatusPill status={d.status} lang={lang} />
            </div>
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
              {t('assigned')} {timeAgo(d.assigned_at)}{d.response_minutes != null ? ` · ${t('response')} ${d.response_minutes}m` : ''}
            </div>
            {d.note && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>“{d.note}”</div>}
            {d.report && (
              <div style={{ fontSize: 12, color: '#e6edf3', marginTop: 8, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: 8 }}>
                <div style={{ color: '#3fb950', fontSize: 11, marginBottom: 2 }}>{t('onscene')}</div>
                {d.report.people_assisted != null && <div>{t('people')}: {d.report.people_assisted}</div>}
                {d.report.services && <div>{t('services')}: {d.report.services}</div>}
                {d.report.new_hazards && <div>{t('hazards')}: {d.report.new_hazards}</div>}
              </div>
            )}
            {open && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => onReassignTeam(d)} style={smallBtn}>{t('change_team')}</button>
                <button type="button" onClick={() => onReassign(d)} style={smallBtn}>{t('change_incident')}</button>
                <button type="button" onClick={() => onRecall(d)} style={{ ...smallBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>{t('recall')}</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14, marginBottom: 8 }
const smallBtn: React.CSSProperties = { height: 34, padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const input: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const incBtn: React.CSSProperties = { textAlign: 'left', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '8px 10px', color: '#e6edf3', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
