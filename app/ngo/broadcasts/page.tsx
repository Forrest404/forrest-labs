'use client'

import { useState, useEffect, useCallback } from 'react'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'

const LANG = {
  en: { title: 'Broadcast', sub: 'One-way urgent notices to your field staff. Reaches them by push. For back-and-forth, use your linked Signal/WhatsApp group.', e_load: 'Could not load broadcasts.', e_msg: 'Enter a message.', e_team: 'Choose a team.', already: 'Already sent.', sent_to: 'Sent to', recipient: 'recipient', recipients: 'recipients', e_send: 'Could not send.', e_send_net: 'Could not send. Please try again.', updated: 'Broadcast updated in the app — no new alert was sent.', e_update: 'Could not update.', withdrawn: 'Broadcast withdrawn — removed from the feed.', e_withdraw: 'Could not withdraw.', aud_leaders: 'all %n leaders', aud_field: 'all %n field staff', aud_team: 'team %name (%c)', this_team: 'this team', ph_msg: 'Short operational message…', send_to_l: 'Send to', r_all: 'All field staff', r_team: 'A specific team', choose_team: 'Choose a team…', r_leaders: 'All leaders', urgency: 'Urgency', routine: 'Routine', urgent_opt: 'Urgent (asks for acknowledgement)', send_btn: 'Send broadcast', cant_unsend: 'A broadcast can’t be unsent. Coordinates are stripped automatically.', confirm_title_urgent: 'Send an urgent broadcast?', confirm_title: 'Send broadcast?', confirm_to: 'This will be sent to', confirm_cant: 'It can’t be unsent.', cancel: 'Cancel', send_to_n: 'Send to', sending: 'Sending…', edit_title: 'Edit broadcast', edit_note: 'Corrects the message shown in the app. The original push already went out — editing does not send a new alert.', save: 'Save', saving: 'Saving…', withdraw_title: 'Withdraw this broadcast?', withdraw_note: 'It will be removed from the in-app feed for everyone. This does not un-send the original push — recipients may have already seen it. To fix a mistake, withdraw and send a corrected broadcast.', withdraw: 'Withdraw', withdrawing: 'Withdrawing…', history: 'History', loading: 'Loading…', empty: 'No broadcasts yet.', urgent_badge: 'URGENT', delivered: 'Delivered', acknowledged: 'Acknowledged', who: 'Who?', hide: 'Hide', edit: 'Edit', edited: 'edited', ack_l: 'acknowledged', seen: 'seen', not_seen: 'not seen' },
  fr: { title: 'Diffusion', sub: 'Avis urgents à sens unique vers votre personnel de terrain, par notification. Pour échanger, utilisez votre groupe Signal/WhatsApp lié.', e_load: 'Impossible de charger les diffusions.', e_msg: 'Saisissez un message.', e_team: 'Choisissez une équipe.', already: 'Déjà envoyé.', sent_to: 'Envoyé à', recipient: 'destinataire', recipients: 'destinataires', e_send: 'Échec de l’envoi.', e_send_net: 'Échec de l’envoi. Réessayez.', updated: 'Diffusion mise à jour dans l’app — aucune nouvelle alerte envoyée.', e_update: 'Échec de la mise à jour.', withdrawn: 'Diffusion retirée — supprimée du fil.', e_withdraw: 'Échec du retrait.', aud_leaders: 'tous les %n responsables', aud_field: 'tout le personnel de terrain (%n)', aud_team: 'l’équipe %name (%c)', this_team: 'cette équipe', ph_msg: 'Message opérationnel court…', send_to_l: 'Envoyer à', r_all: 'Tout le personnel de terrain', r_team: 'Une équipe précise', choose_team: 'Choisir une équipe…', r_leaders: 'Tous les responsables', urgency: 'Urgence', routine: 'Routine', urgent_opt: 'Urgent (demande un accusé de réception)', send_btn: 'Envoyer la diffusion', cant_unsend: 'Une diffusion ne peut être annulée. Les coordonnées sont supprimées automatiquement.', confirm_title_urgent: 'Envoyer une diffusion urgente ?', confirm_title: 'Envoyer la diffusion ?', confirm_to: 'Ceci sera envoyé à', confirm_cant: 'Impossible de l’annuler.', cancel: 'Annuler', send_to_n: 'Envoyer à', sending: 'Envoi…', edit_title: 'Modifier la diffusion', edit_note: 'Corrige le message affiché dans l’app. La notification initiale est déjà partie — la modification n’envoie pas de nouvelle alerte.', save: 'Enregistrer', saving: 'Enregistrement…', withdraw_title: 'Retirer cette diffusion ?', withdraw_note: 'Elle sera retirée du fil de l’app pour tous. Cela n’annule pas la notification initiale — les destinataires l’ont peut-être déjà vue. Pour corriger, retirez-la et envoyez une diffusion corrigée.', withdraw: 'Retirer', withdrawing: 'Retrait…', history: 'Historique', loading: 'Chargement…', empty: 'Aucune diffusion.', urgent_badge: 'URGENT', delivered: 'Distribué', acknowledged: 'Accusé', who: 'Qui ?', hide: 'Masquer', edit: 'Modifier', edited: 'modifié', ack_l: 'accusé reçu', seen: 'vu', not_seen: 'non vu' },
  ar: { title: 'بثّ', sub: 'إشعارات عاجلة أحادية الاتجاه إلى فريقك الميداني عبر الإشعارات. للتواصل المتبادل استخدم مجموعة Signal/WhatsApp المرتبطة.', e_load: 'تعذّر تحميل الإشعارات.', e_msg: 'أدخل رسالة.', e_team: 'اختر فريقاً.', already: 'أُرسلت مسبقاً.', sent_to: 'أُرسلت إلى', recipient: 'مستلم', recipients: 'مستلمين', e_send: 'تعذّر الإرسال.', e_send_net: 'تعذّر الإرسال. حاول مرة أخرى.', updated: 'تم تحديث البثّ في التطبيق — لم يُرسَل تنبيه جديد.', e_update: 'تعذّر التحديث.', withdrawn: 'تم سحب البثّ — أُزيل من السجل.', e_withdraw: 'تعذّر السحب.', aud_leaders: 'جميع القادة (%n)', aud_field: 'جميع موظفي الميدان (%n)', aud_team: 'فريق %name (%c)', this_team: 'هذا الفريق', ph_msg: 'رسالة تشغيلية قصيرة…', send_to_l: 'إرسال إلى', r_all: 'كل موظفي الميدان', r_team: 'فريق محدد', choose_team: 'اختر فريقاً…', r_leaders: 'كل القادة', urgency: 'الأولوية', routine: 'عادية', urgent_opt: 'عاجل (يطلب تأكيد الاستلام)', send_btn: 'إرسال البثّ', cant_unsend: 'لا يمكن التراجع عن البثّ. تُحذف الإحداثيات تلقائياً.', confirm_title_urgent: 'إرسال بثّ عاجل؟', confirm_title: 'إرسال البثّ؟', confirm_to: 'سيُرسَل إلى', confirm_cant: 'لا يمكن التراجع عنه.', cancel: 'إلغاء', send_to_n: 'إرسال إلى', sending: 'جارٍ الإرسال…', edit_title: 'تعديل البثّ', edit_note: 'يصحّح الرسالة المعروضة في التطبيق. الإشعار الأصلي أُرسل بالفعل — التعديل لا يرسل تنبيهاً جديداً.', save: 'حفظ', saving: 'جارٍ الحفظ…', withdraw_title: 'سحب هذا البثّ؟', withdraw_note: 'سيُزال من سجل التطبيق للجميع. هذا لا يلغي الإشعار الأصلي — قد يكون المستلمون رأوه. للتصحيح، اسحبه وأرسل بثّاً مصحّحاً.', withdraw: 'سحب', withdrawing: 'جارٍ السحب…', history: 'السجل', loading: 'جارٍ التحميل…', empty: 'لا توجد إشعارات.', urgent_badge: 'عاجل', delivered: 'وصل', acknowledged: 'مؤكَّد', who: 'من؟', hide: 'إخفاء', edit: 'تعديل', edited: 'مُعدّل', ack_l: 'تم التأكيد', seen: 'شوهد', not_seen: 'لم يُشاهد' },
} as const

// Broadcast composer + history for leaders/admins. One-way: send urgent operational notices
// to field staff / a team / leaders. Push only for now (SMS deferred server-side). Field
// coordinators read + acknowledge in their field view, not here.

const MAX = 280

interface Audiences { field_count: number; leader_count: number; teams: { id: string; name: string; count: number }[] }
interface Broadcast {
  id: string; body: string; target_type: string; team_id: string | null; urgency: string
  created_at: string; edited_at: string | null; sender_name: string; target_label: string
  recipient_count: number; delivered_count: number; acknowledged_count: number
}

export default function BroadcastsPage() {
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState<'all' | 'team' | 'leaders'>('all')
  const [teamId, setTeamId] = useState('')
  const [urgency, setUrgency] = useState<'routine' | 'urgent'>('routine')
  const [aud, setAud] = useState<Audiences | null>(null)
  const [list, setList] = useState<Broadcast[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [token, setToken] = useState(() => crypto.randomUUID())
  const [roster, setRoster] = useState<{ id: string; recipients: { name: string; delivered: boolean; acknowledged: boolean }[] } | null>(null)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [withdrawing, setWithdrawing] = useState<Broadcast | null>(null)
  const [actBusy, setActBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/broadcasts', { cache: 'no-store' })
      if (!r.ok) { setError(t('e_load')); setLoaded(true); return }
      const d = await r.json()
      setList(d.broadcasts ?? [])
      setAud(d.audiences ?? null)
    } catch { setError(t('e_load')) }
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  // Audience size for the current target (drives the confirmation wording).
  const audienceCount = (): number => {
    if (!aud) return 0
    if (target === 'leaders') return aud.leader_count
    if (target === 'team') return aud.teams.find((t) => t.id === teamId)?.count ?? 0
    return aud.field_count
  }
  const audienceName = (): string => {
    if (target === 'leaders') return t('aud_leaders').replace('%n', String(audienceCount()))
    if (target === 'team') { const tm = aud?.teams.find((x) => x.id === teamId); return tm ? t('aud_team').replace('%name', tm.name).replace('%c', String(tm.count)) : t('this_team') }
    return t('aud_field').replace('%n', String(audienceCount()))
  }

  const canCompose = message.trim().length > 0 && (target !== 'team' || teamId)

  const askConfirm = () => {
    setError(null); setMsg(null)
    if (!message.trim()) { setError(t('e_msg')); return }
    if (target === 'team' && !teamId) { setError(t('e_team')); return }
    setConfirming(true)
  }

  const send = async () => {
    if (sending) return
    setSending(true); setError(null); setMsg(null)
    try {
      const r = await fetch('/api/ngo/broadcasts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), target_type: target, team_id: target === 'team' ? teamId : undefined, urgency, client_token: token }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        setMsg(d.duplicate ? t('already') : `${t('sent_to')} ${d.sent_count} ${d.sent_count === 1 ? t('recipient') : t('recipients')}.`)
        setMessage(''); setConfirming(false); setToken(crypto.randomUUID()) // fresh token for next send
        await load()
      } else {
        setError(d.error ?? t('e_send')); setConfirming(false)
      }
    } catch { setError(t('e_send_net')); setConfirming(false) }
    finally { setSending(false) }
  }

  const openRoster = async (id: string) => {
    if (roster?.id === id) { setRoster(null); return }
    setRoster({ id, recipients: [] })
    try {
      const r = await fetch(`/api/ngo/broadcasts/${id}`, { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setRoster({ id, recipients: d.recipients ?? [] }) }
    } catch { /* keep empty */ }
  }

  // Correct the in-app body. No new push is fired — the original already went out.
  const doEdit = async () => {
    if (!editing || actBusy) return
    const text = editing.body.trim()
    if (!text) { setError(t('e_msg')); return }
    setActBusy(true); setError(null); setMsg(null)
    try {
      const r = await fetch(`/api/ngo/broadcasts/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setMsg(t('updated')); setEditing(null); await load() }
      else setError(d.error ?? t('e_update'))
    } catch { setError(t('e_update')) } finally { setActBusy(false) }
  }

  // Soft-delete: pull it from the feed. Does NOT un-send the push that already went out.
  const doWithdraw = async () => {
    if (!withdrawing || actBusy) return
    setActBusy(true); setError(null); setMsg(null)
    try {
      const r = await fetch(`/api/ngo/broadcasts/${withdrawing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ withdraw: true }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setMsg(t('withdrawn')); setWithdrawing(null); await load() }
      else setError(d.error ?? t('e_withdraw'))
    } catch { setError(t('e_withdraw')) } finally { setActBusy(false) }
  }

  return (
    <div style={wrap} dir={isRtl ? 'rtl' : 'ltr'}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>{t('title')}</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 18px' }}>{t('sub')}</p>

      {msg && <div style={ok}>{msg}</div>}
      {error && <div style={err}>{error}</div>}

      {/* Compose */}
      <div style={card}>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MAX} rows={3} placeholder={t('ph_msg')} style={ta} />
        <div style={{ fontSize: 11, color: message.length > MAX - 20 ? '#d29922' : '#484f58', textAlign: isRtl ? 'left' : 'right' }}>{message.length}/{MAX}</div>

        <div style={fieldLabel}>{t('send_to_l')}</div>
        <div style={{ display: 'grid', gap: 6 }}>
          <Radio checked={target === 'all'} onChange={() => setTarget('all')} label={`${t('r_all')}${aud ? ` (${aud.field_count})` : ''}`} />
          <Radio checked={target === 'team'} onChange={() => setTarget('team')} label={t('r_team')} />
          {target === 'team' && (
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ ...input, marginInlineStart: 26 }}>
              <option value="">{t('choose_team')}</option>
              {(aud?.teams ?? []).map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({tm.count})</option>)}
            </select>
          )}
          <Radio checked={target === 'leaders'} onChange={() => setTarget('leaders')} label={`${t('r_leaders')}${aud ? ` (${aud.leader_count})` : ''}`} />
        </div>

        <div style={fieldLabel}>{t('urgency')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Pill active={urgency === 'routine'} onClick={() => setUrgency('routine')} label={t('routine')} color="#3fb950" />
          <Pill active={urgency === 'urgent'} onClick={() => setUrgency('urgent')} label={t('urgent_opt')} color="#f85149" />
        </div>

        <button type="button" onClick={askConfirm} disabled={!canCompose} style={{ ...primaryBtn, marginTop: 14, opacity: canCompose ? 1 : 0.5 }}>{t('send_btn')}</button>
        <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>{t('cant_unsend')}</div>
      </div>

      {/* Confirmation */}
      {confirming && (
        <div style={overlay} onClick={() => !sending && setConfirming(false)}>
          <div style={dialog} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{urgency === 'urgent' ? t('confirm_title_urgent') : t('confirm_title')}</div>
            <div style={{ fontSize: 14, color: '#c9d1d9', marginBottom: 4 }}>{t('confirm_to')} <b style={{ color: '#e6edf3' }}>{audienceName()}</b>. {t('confirm_cant')}</div>
            <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 10, fontSize: 13, color: '#c9d1d9', margin: '10px 0', whiteSpace: 'pre-wrap' }}>{message.trim()}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirming(false)} disabled={sending} style={ghostBtn}>{t('cancel')}</button>
              <button type="button" onClick={send} disabled={sending} style={{ ...primaryBtn, opacity: sending ? 0.6 : 1 }}>{sending ? t('sending') : `${t('send_to_n')} ${audienceCount()}`}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit broadcast */}
      {editing && (
        <div style={overlay} onClick={() => !actBusy && setEditing(null)}>
          <div style={dialog} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t('edit_title')}</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>{t('edit_note')}</div>
            <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} maxLength={MAX} rows={3} style={ta} />
            <div style={{ fontSize: 11, color: editing.body.length > MAX - 20 ? '#d29922' : '#484f58', textAlign: isRtl ? 'left' : 'right' }}>{editing.body.length}/{MAX}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setEditing(null)} disabled={actBusy} style={ghostBtn}>{t('cancel')}</button>
              <button type="button" onClick={doEdit} disabled={actBusy || !editing.body.trim()} style={{ ...primaryBtn, width: 'auto', opacity: actBusy || !editing.body.trim() ? 0.6 : 1 }}>{actBusy ? t('saving') : t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw confirmation — honest about what withdraw does and doesn't do. */}
      {withdrawing && (
        <div style={overlay} onClick={() => !actBusy && setWithdrawing(null)}>
          <div style={dialog} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t('withdraw_title')}</div>
            <div style={{ fontSize: 13, color: '#c9d1d9', marginBottom: 4 }}>{t('withdraw_note')}</div>
            <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 10, fontSize: 13, color: '#c9d1d9', margin: '10px 0', whiteSpace: 'pre-wrap' }}>{withdrawing.body}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setWithdrawing(null)} disabled={actBusy} style={ghostBtn}>{t('cancel')}</button>
              <button type="button" onClick={doWithdraw} disabled={actBusy} style={{ ...primaryBtn, width: 'auto', background: '#da3633', borderColor: '#f85149', opacity: actBusy ? 0.6 : 1 }}>{actBusy ? t('withdrawing') : t('withdraw')}</button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#8b949e', margin: '26px 0 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('history')}</div>
      {!loaded && <div style={{ fontSize: 13, color: '#8b949e' }}>{t('loading')}</div>}
      {loaded && list.length === 0 && <div style={{ fontSize: 13, color: '#484f58' }}>{t('empty')}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {list.map((b) => (
          <div key={b.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 14, color: '#e6edf3', whiteSpace: 'pre-wrap', flex: 1 }}>{b.body}</div>
              {b.urgency === 'urgent' && <span style={badge('#f85149')}>{t('urgent_badge')}</span>}
            </div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6 }}>
              {b.sender_name} · {b.target_label} · {new Date(b.created_at).toLocaleString()}{b.edited_at ? ` · ${t('edited')}` : ''}
            </div>
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
              {t('delivered')} {b.delivered_count}/{b.recipient_count}
              {b.urgency === 'urgent' && <> · {t('acknowledged')} {b.acknowledged_count}/{b.recipient_count}
                {' · '}<button type="button" onClick={() => openRoster(b.id)} style={linkBtn}>{roster?.id === b.id ? t('hide') : t('who')}</button></>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => { setEditing({ id: b.id, body: b.body }); setError(null); setMsg(null) }} style={smallBtn}>{t('edit')}</button>
              <button type="button" onClick={() => { setWithdrawing(b); setError(null); setMsg(null) }} style={{ ...smallBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>{t('withdraw')}</button>
            </div>
            {b.urgency === 'urgent' && roster?.id === b.id && (
              <div style={{ marginTop: 8, borderTop: '1px solid #21262d', paddingTop: 8, display: 'grid', gap: 3 }}>
                {roster.recipients.length === 0 && <div style={{ fontSize: 12, color: '#484f58' }}>{t('loading')}</div>}
                {roster.recipients.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: r.acknowledged ? '#3fb950' : '#484f58', flexShrink: 0 }} />
                    <span style={{ color: '#c9d1d9' }}>{r.name}</span>
                    <span style={{ color: r.acknowledged ? '#3fb950' : '#8b949e', marginInlineStart: 'auto', fontSize: 11 }}>{r.acknowledged ? t('ack_l') : r.delivered ? t('seen') : t('not_seen')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#e6edf3', cursor: 'pointer' }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ width: 16, height: 16 }} />{label}
    </label>
  )
}
function Pill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button type="button" onClick={onClick} style={{ flex: 1, minHeight: 38, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? `${color}22` : '#0d1117', border: `1px solid ${active ? color : '#21262d'}`, color: active ? color : '#8b949e' }}>{label}</button>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 640, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14 }
const ta: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, color: '#e6edf3', fontSize: 15, fontFamily: 'system-ui', padding: 12, outline: 'none', resize: 'vertical' }
const input: React.CSSProperties = { height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 14, fontFamily: 'system-ui', width: 'calc(100% - 26px)' }
const fieldLabel: React.CSSProperties = { fontSize: 12, color: '#8b949e', margin: '14px 0 6px' }
const primaryBtn: React.CSSProperties = { minHeight: 42, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', width: '100%' }
const ghostBtn: React.CSSProperties = { minHeight: 38, padding: '0 16px', background: 'transparent', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'system-ui' }
const smallBtn: React.CSSProperties = { height: 28, padding: '0 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const ok: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const err: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }
const dialog: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 18, maxWidth: 420, width: '100%' }
function badge(c: string): React.CSSProperties { return { fontSize: 10, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 } }
