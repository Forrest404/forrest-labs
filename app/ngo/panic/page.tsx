'use client'

import { useCallback, useEffect, useState } from 'react'
import { useNewPanicAlert } from '@/lib/use-new-panic-alert'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'

const LANG = {
  en: {
    title: 'Active panics', sound_on: '🔔 Sound on', sound_off: '🔇 Muted',
    subtitle: 'Duress alerts from your field staff. A panic never auto-closes — a responder must resolve it with an outcome note.',
    active: 'active', unacked: 'unacknowledged', all_acked: 'all acknowledged', updated: 'updated',
    new_panic: 'New panic', new_panics: 'New panics', tap_dismiss: 'tap to dismiss',
    loading: 'Loading…', load_fail: 'Couldn’t load panics.', retry: 'Retry',
    all_clear: 'All clear', no_active: 'No active panics.',
    triggered: 'Triggered', last_known: 'last known', no_location: 'no location',
    ack_by: 'Acknowledged by', not_acked: 'Not yet acknowledged', silent: 'silent',
    acknowledge: 'Acknowledge', call: 'Call', no_phone: 'No phone', locate: 'Locate ↗', group_chat: 'Group chat ↗', send_team: 'Send team', resolve: 'Resolve', cancel: 'Cancel',
    send_title: 'Send a team to', send_sub: 'Nearest first · the team is alerted by push with a map link.', no_teams: 'No teams.',
    resolve_title: 'Resolve', resolve_poss: '’s panic', resolve_sub: 'Only resolve once the person is confirmed safe. A meaningful outcome note (at least 10 characters) is required and kept on record.',
    resolve_ph: 'What happened / outcome…', chars_needed: 'more characters needed', char_needed: 'more character needed',
  },
  fr: {
    title: 'Paniques actives', sound_on: '🔔 Son activé', sound_off: '🔇 Muet',
    subtitle: 'Alertes de détresse de votre personnel de terrain. Une panique ne se ferme jamais seule — un répondant doit la clôturer avec une note.',
    active: 'active(s)', unacked: 'non confirmée(s)', all_acked: 'toutes confirmées', updated: 'mis à jour',
    new_panic: 'Nouvelle panique', new_panics: 'Nouvelles paniques', tap_dismiss: 'touchez pour fermer',
    loading: 'Chargement…', load_fail: 'Échec du chargement des paniques.', retry: 'Réessayer',
    all_clear: 'Tout va bien', no_active: 'Aucune panique active.',
    triggered: 'Déclenchée', last_known: 'dernière position', no_location: 'sans position',
    ack_by: 'Confirmée par', not_acked: 'Pas encore confirmée', silent: 'silencieux',
    acknowledge: 'Confirmer', call: 'Appeler', no_phone: 'Sans numéro', locate: 'Localiser ↗', group_chat: 'Groupe ↗', send_team: 'Envoyer une équipe', resolve: 'Clôturer', cancel: 'Annuler',
    send_title: 'Envoyer une équipe à', send_sub: 'Au plus proche · l’équipe est alertée par notification avec un lien carte.', no_teams: 'Aucune équipe.',
    resolve_title: 'Clôturer la panique de', resolve_poss: '', resolve_sub: 'Ne clôturez qu’une fois la personne confirmée en sécurité. Une note d’issue (au moins 10 caractères) est requise et conservée.',
    resolve_ph: 'Ce qui s’est passé / issue…', chars_needed: 'caractères encore requis', char_needed: 'caractère encore requis',
  },
  ar: {
    title: 'استغاثات نشطة', sound_on: '🔔 الصوت مفعّل', sound_off: '🔇 كتم',
    subtitle: 'تنبيهات استغاثة من فريقك الميداني. لا تُغلق الاستغاثة تلقائياً — يجب أن يُنهيها المستجيب مع ملاحظة.',
    active: 'نشطة', unacked: 'غير مؤكَّدة', all_acked: 'الكل مؤكَّد', updated: 'آخر تحديث',
    new_panic: 'استغاثة جديدة', new_panics: 'استغاثات جديدة', tap_dismiss: 'اضغط للإغلاق',
    loading: 'جارٍ التحميل…', load_fail: 'تعذّر تحميل الاستغاثات.', retry: 'إعادة المحاولة',
    all_clear: 'كل شيء آمن', no_active: 'لا توجد استغاثات نشطة.',
    triggered: 'بدأت', last_known: 'آخر موقع معروف', no_location: 'بدون موقع',
    ack_by: 'أكّدها', not_acked: 'لم تُؤكَّد بعد', silent: 'صامت',
    acknowledge: 'تأكيد', call: 'اتصال', no_phone: 'لا يوجد رقم', locate: 'تحديد ↗', group_chat: 'الدردشة ↗', send_team: 'إرسال فريق', resolve: 'إنهاء', cancel: 'إلغاء',
    send_title: 'إرسال فريق إلى', send_sub: 'الأقرب أولاً · يُنبَّه الفريق عبر إشعار مع رابط خريطة.', no_teams: 'لا توجد فِرق.',
    resolve_title: 'إنهاء استغاثة', resolve_poss: '', resolve_sub: 'لا تُنهِها إلا بعد التأكد من سلامة الشخص. مطلوب ملاحظة عن النتيجة (10 أحرف على الأقل) وتُحفظ في السجل.',
    resolve_ph: 'ماذا حدث / النتيجة…', chars_needed: 'حرفاً إضافياً مطلوباً', char_needed: 'حرف إضافي مطلوب',
  },
} as const

// Dedicated responder panic view: every active duress alert for the org with the full
// responder toolkit — acknowledge, call, locate, open the team's group chat, send the
// nearest team, and resolve with a required outcome note. A panic never auto-closes.
// Leaders/admins only.

interface Panic {
  id: string; ngo_user_id: string; name: string; phone: string | null
  team_id: string | null; group_chat_url: string | null
  lat: number | null; lon: number | null; created_at: string
  silent: boolean; reason: string | null
  acknowledged_at: string | null; acknowledged_by_name: string | null
}
interface Team { id: string; name: string; type: string; status: string; last_lat: number | null; last_lon: number | null }

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}
// Live "updated Xs ago" for the freshness label. _tick changes each second to force re-render.
function freshAgo(at: number | null): string {
  if (at == null) return '—'
  const s = Math.floor((Date.now() - at) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`
}
function distanceKm(a: { lat: number; lon: number }, lat: number, lon: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat - a.lat), dLon = toRad(lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

export default function NgoPanicPage() {
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
  const [panics, setPanics] = useState<Panic[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [sendFor, setSendFor] = useState<Panic | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [resolveFor, setResolveFor] = useState<Panic | null>(null)
  const [note, setNote] = useState('')
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [, setTick] = useState(0) // 1s tick keeps the "updated Xs ago" label live

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/safety/panic', { cache: 'no-store' })
      if (!r.ok) { setError(true); setLoaded(true); return }
      setPanics((await r.json()).panics ?? []); setError(false); setLoaded(true); setUpdatedAt(Date.now())
    } catch { setError(true); setLoaded(true) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 7000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', load)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', load) }
  }, [load])

  // 1s tick (paused when hidden) so the "updated Xs ago" freshness label counts up.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setTick((n) => n + 1) }, 1000)
    return () => clearInterval(id)
  }, [])

  async function acknowledge(id: string) {
    setBusy(id)
    try { const r = await fetch(`/api/ngo/safety/panic/${id}/acknowledge`, { method: 'POST' }); if (r.ok) load() }
    finally { setBusy(null) }
  }
  async function openSend(p: Panic) {
    setSendFor(p); setTeams([])
    try { const r = await fetch('/api/ngo/teams'); if (r.ok) setTeams((await r.json()).teams ?? []) } catch { /* empty */ }
  }
  async function sendTeam(teamId: string) {
    if (!sendFor) return
    setBusy(sendFor.id)
    try { const r = await fetch(`/api/ngo/safety/panic/${sendFor.id}/dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId }) }); if (r.ok) { setSendFor(null); load() } }
    finally { setBusy(null) }
  }
  const RESOLVE_NOTE_MIN = 10
  async function doResolve() {
    if (!resolveFor || note.trim().length < RESOLVE_NOTE_MIN) return
    setBusy(resolveFor.id)
    try {
      const r = await fetch(`/api/ngo/safety/panic/${resolveFor.id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution_note: note.trim() }) })
      if (r.ok) { setResolveFor(null); setNote(''); load() }
    } finally { setBusy(null) }
  }
  const mapsLink = (p: Panic) => (p.lat != null && p.lon != null ? `https://www.google.com/maps?q=${p.lat},${p.lon}` : null)
  // Audible + visual alert when a NEW panic arrives while this page is open (sound default on).
  const { muted, toggleMute, newNames, dismiss } = useNewPanicAlert(panics)
  const unacked = panics.filter((p) => !p.acknowledged_at).length

  // Rank teams nearest-first when the panic has a location.
  const rankedTeams = (p: Panic | null): (Team & { km: number | null })[] => {
    const list = teams.map((t) => ({ ...t, km: p?.lat != null && p?.lon != null && t.last_lat != null && t.last_lon != null ? distanceKm({ lat: p.lat, lon: p.lon }, t.last_lat, t.last_lon) : null }))
    return list.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
  }

  return (
    <div style={wrap} dir={isRtl ? 'rtl' : 'ltr'}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
          <button type="button" onClick={toggleMute} style={muteBtn}>{muted ? t('sound_off') : t('sound_on')}</button>
        </div>
        <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>
          {t('subtitle')}
        </div>
        {loaded && !error && (
          <div style={{ fontSize: 12, marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {panics.length > 0 && (
              <span style={{ color: unacked > 0 ? '#f85149' : '#3fb950', fontWeight: 600 }}>
                {panics.length} {t('active')}{unacked > 0 ? ` · ${unacked} ${t('unacked')}` : ` · ${t('all_acked')}`}
              </span>
            )}
            <span style={{ color: '#484f58' }}>{t('updated')} {freshAgo(updatedAt)}</span>
          </div>
        )}
      </div>

      {/* New-panic alert banner — fires (with a chime unless muted) when a panic arrives while
          this page is open, so it can't scroll in unnoticed. */}
      {newNames.length > 0 && (
        <div style={alertBanner} onClick={dismiss} role="alert">
          🆘 {newNames.length > 1 ? t('new_panics') : t('new_panic')}: {newNames.join(', ')} <span style={{ fontWeight: 400, opacity: 0.85 }}>· {t('tap_dismiss')}</span>
        </div>
      )}

      {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>{t('loading')}</div>}
      {loaded && error && <div style={errBox}>{t('load_fail')} <button type="button" onClick={load} style={retryBtn}>{t('retry')}</button></div>}
      {loaded && !error && panics.length === 0 && (
        <div style={{ padding: '32px 16px', textAlign: 'center', background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.35)', borderRadius: 12 }}>
          <div style={{ fontSize: 44, lineHeight: 1, color: '#3fb950' }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#3fb950', marginTop: 8 }}>{t('all_clear')}</div>
          <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>{t('no_active')}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {panics.map((p) => {
          const link = mapsLink(p)
          return (
            <div key={p.id} style={card}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#f85149' }}>
                🆘 {p.name}
                {p.silent && <span style={tag('#8b949e')}>{t('silent')}</span>}
                {p.reason && <span style={tag('#d29922')}>{p.reason.replace('_', ' ')}</span>}
              </div>
              <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>
                {t('triggered')} {ago(p.created_at)} · {p.lat != null && p.lon != null ? `${t('last_known')} ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : t('no_location')}
              </div>
              {p.acknowledged_at
                ? <div style={{ fontSize: 13, color: '#3fb950', marginTop: 4 }}>✓ {t('ack_by')} {p.acknowledged_by_name} · {ago(p.acknowledged_at)}</div>
                : <div style={{ fontSize: 13, color: '#d29922', marginTop: 4 }}>● {t('not_acked')}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {!p.acknowledged_at && <button type="button" disabled={busy === p.id} onClick={() => acknowledge(p.id)} style={btn('#58a6ff')}>{t('acknowledge')}</button>}
                {p.phone
                  ? <a href={`tel:${p.phone}`} style={btnLink('#3fb950')}>{t('call')}</a>
                  : <span style={{ ...btn('#484f58'), opacity: 0.6, cursor: 'default' }}>{t('no_phone')}</span>}
                {link && <a href={link} target="_blank" rel="noreferrer" style={btnLink('#a371f7')}>{t('locate')}</a>}
                {p.group_chat_url && <a href={p.group_chat_url} target="_blank" rel="noreferrer" style={btnLink('#3fb950')}>{t('group_chat')}</a>}
                <button type="button" disabled={busy === p.id} onClick={() => openSend(p)} style={btn('#58a6ff')}>{t('send_team')}</button>
                <button type="button" disabled={busy === p.id} onClick={() => { setResolveFor(p); setNote('') }} style={btn('#8b949e')}>{t('resolve')}</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Send-nearest-team picker */}
      {sendFor && (
        <div onClick={() => setSendFor(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{t('send_title')} {sendFor.name}</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{t('send_sub')}</div>
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rankedTeams(sendFor).length === 0 && <div style={{ fontSize: 13, color: '#8b949e' }}>{t('no_teams')}</div>}
              {rankedTeams(sendFor).map((t) => (
                <button key={t.id} type="button" disabled={busy === sendFor.id} onClick={() => sendTeam(t.id)} style={teamRow}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span style={{ fontSize: 12, color: '#8b949e', marginLeft: 8 }}>{t.type} · {t.status}{t.km != null ? ` · ${t.km.toFixed(1)} km` : ''}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setSendFor(null)} style={{ ...btn('#8b949e'), marginTop: 12, width: '100%' }}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {/* Resolve with a required outcome note */}
      {resolveFor && (
        <div onClick={() => setResolveFor(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t('resolve_title')} {resolveFor.name}{t('resolve_poss')}</div>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>{t('resolve_sub')}</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('resolve_ph')} style={{ width: '100%', minHeight: 90, boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, color: '#e6edf3', fontSize: 14, padding: 10, fontFamily: 'system-ui', outline: 'none' }} />
            {note.trim().length > 0 && note.trim().length < RESOLVE_NOTE_MIN && <div style={{ fontSize: 11, color: '#d29922', marginTop: 4 }}>{RESOLVE_NOTE_MIN - note.trim().length} {RESOLVE_NOTE_MIN - note.trim().length === 1 ? t('char_needed') : t('chars_needed')}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" disabled={note.trim().length < RESOLVE_NOTE_MIN || busy === resolveFor.id} onClick={doResolve} style={{ ...btn('#3fb950'), flex: 1, opacity: note.trim().length < RESOLVE_NOTE_MIN ? 0.5 : 1 }}>{t('resolve')}</button>
              <button type="button" onClick={() => setResolveFor(null)} style={{ ...btn('#8b949e'), flex: 1 }}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 760, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const card: React.CSSProperties = { background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.4)', borderRadius: 12, padding: 16 }
function tag(c: string): React.CSSProperties { return { fontSize: 11, fontWeight: 600, color: c, border: `1px solid ${c}55`, borderRadius: 999, padding: '2px 8px', marginInlineStart: 8, verticalAlign: 'middle' } }
function btn(c: string): React.CSSProperties { return { height: 40, padding: '0 16px', background: `${c}22`, border: `1px solid ${c}66`, color: c, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' } }
function btnLink(c: string): React.CSSProperties { return { ...btn(c), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' } }
const errBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'none', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 4, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }
const modal: React.CSSProperties = { width: 380, maxWidth: '100%', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 20, fontFamily: 'system-ui', color: '#e6edf3' }
const teamRow: React.CSSProperties = { textAlign: 'left', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: '10px 12px', color: '#e6edf3', fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui' }
const muteBtn: React.CSSProperties = { flexShrink: 0, height: 30, padding: '0 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const alertBanner: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 5, background: '#da3633', color: '#fff', borderRadius: 10, padding: '12px 14px', fontSize: 15, fontWeight: 700, marginBottom: 14, cursor: 'pointer', boxShadow: '0 0 0 1px #f85149, 0 4px 14px rgba(248,81,73,0.4)' }
