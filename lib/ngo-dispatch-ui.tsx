'use client'

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import type { Lang } from '@/lib/use-ngo-lang'

// Shared dispatch UI primitives used by BOTH the situation board (app/ngo/board) and the dispatch
// log (app/ngo/dispatch): a status pill, a modal shell (Esc + backdrop close), a selectable team
// picker, and a recall dialog. These replace the hand-rolled duplicates that had drifted between
// the two surfaces, so a dispatch looks and behaves identically wherever it's shown. Presentational
// only — no data fetching. Each piece carries its own en/fr/ar micro-dictionary so both surfaces
// render the same labels; page-specific copy stays in each page's own LANG.

// ── Status pill ──
export const STATUS_META: Record<string, { color: string }> = {
  assigned: { color: '#58a6ff' }, en_route: { color: '#d29922' }, on_scene: { color: '#3fb950' },
  done: { color: '#8b949e' }, cancelled: { color: '#f85149' },
}
const STATUS_LABEL: Record<Lang, Record<string, string>> = {
  en: { assigned: 'Assigned', en_route: 'En route', on_scene: 'On scene', done: 'Done', cancelled: 'Cancelled' },
  fr: { assigned: 'Assigné', en_route: 'En route', on_scene: 'Sur place', done: 'Terminé', cancelled: 'Annulé' },
  ar: { assigned: 'مُكلّف', en_route: 'في الطريق', on_scene: 'في الموقع', done: 'منجز', cancelled: 'ملغى' },
}
/** Coloured ● + localized status label — identical on the board and the dispatch log. */
export function StatusPill({ status, lang }: { status: string; lang: Lang }) {
  const color = STATUS_META[status]?.color ?? '#8b949e'
  const label = STATUS_LABEL[lang]?.[status] ?? STATUS_LABEL.en[status] ?? status
  return <span style={{ color, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>● {label}</span>
}

// ── Modal shell ──
/** Dimmed backdrop + centred box; closes on Esc and on backdrop click. */
export function ModalShell({ onClose, title, subtitle, width = 360, children }: {
  onClose: () => void; title: ReactNode; subtitle?: ReactNode; width?: number; children?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div onClick={onClose} style={backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...box, width }} role="dialog" aria-modal="true">
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: subtitle != null ? 4 : 12 }}>{title}</div>
        {subtitle != null && <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  )
}

// ── Team picker ──
export interface PickableTeam {
  id: string; name: string; type: string; status: string
  type_match?: boolean; distance_km?: number | null; busy?: boolean; notifiable_count?: number; all_off_duty?: boolean
}
const PICK_LABEL: Record<Lang, Record<string, string>> = {
  en: { match: '✓match', km: 'km', no_loc: 'no loc', busy: 'busy', no_app: '⚠ no app access', off_duty: '🌙 off duty', none: 'No teams.' },
  fr: { match: '✓correspond', km: 'km', no_loc: 'sans pos.', busy: 'occupé', no_app: '⚠ sans accès à l’app', off_duty: '🌙 hors service', none: 'Aucune équipe.' },
  ar: { match: '✓مطابق', km: 'كم', no_loc: 'بلا موقع', busy: 'مشغول', no_app: '⚠ لا وصول للتطبيق', off_duty: '🌙 خارج الخدمة', none: 'لا فِرق.' },
}
/** Scrollable list of selectable teams. Optional fields render only when supplied, so one component
 *  serves both ranked assignment (match + distance + busy) and plain reassign/panic lists. */
export function TeamPicker({ teams, onPick, busy = false, lang, emptyText }: {
  teams: PickableTeam[]; onPick: (id: string) => void; busy?: boolean; lang: Lang; emptyText?: string
}) {
  const L = PICK_LABEL[lang] ?? PICK_LABEL.en
  return (
    <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {teams.length === 0 && <div style={{ fontSize: 13, color: '#8b949e' }}>{emptyText ?? L.none}</div>}
      {teams.map((tm) => (
        <button key={tm.id} type="button" disabled={busy} onClick={() => onPick(tm.id)} style={teamRow}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{tm.name} {tm.type_match && <span style={{ color: '#3fb950' }}>{L.match}</span>}</span>
            {tm.distance_km !== undefined && <span style={{ color: '#8b949e' }}>{tm.distance_km != null ? `${tm.distance_km} ${L.km}` : L.no_loc}</span>}
          </div>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
            {tm.type} · {tm.all_off_duty ? L.off_duty : tm.status}{tm.busy && <span style={{ color: '#d29922' }}> · {L.busy}</span>}
          </div>
          {tm.notifiable_count === 0 && <div style={{ fontSize: 11, color: '#d29922', marginTop: 2 }}>{L.no_app}</div>}
        </button>
      ))}
    </div>
  )
}

// ── Recall dialog ──
const RECALL_LABEL: Record<Lang, Record<string, string>> = {
  en: { recall: 'Recall', cancel: 'Cancel', reason: 'Reason (optional)', note: 'The team is told to stand down and the incident reopens as a coverage gap.' },
  fr: { recall: 'Rappeler', cancel: 'Annuler', reason: 'Raison (facultatif)', note: 'L’équipe se retire et l’incident redevient une lacune de couverture.' },
  ar: { recall: 'استدعاء', cancel: 'إلغاء', reason: 'السبب (اختياري)', note: 'يُطلب من الفريق التوقف وتعود الحادثة كفجوة تغطية.' },
}
/** Recall a team: reason input + Recall/Cancel, on the shared modal shell. */
export function RecallDialog({ teamName, onConfirm, onClose, lang }: {
  teamName: string | null; onConfirm: (reason: string) => void; onClose: () => void; lang: Lang
}) {
  const L = RECALL_LABEL[lang] ?? RECALL_LABEL.en
  const [reason, setReason] = useState('')
  return (
    <ModalShell onClose={onClose} title={`${L.recall} ${teamName ?? ''}?`} subtitle={L.note} width={340}>
      <input style={field} placeholder={L.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="button" onClick={() => onConfirm(reason)} style={{ ...btn, flex: 1, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)', background: 'rgba(248,81,73,0.08)' }}>{L.recall}</button>
        <button type="button" onClick={onClose} style={{ ...btn, flex: 1 }}>{L.cancel}</button>
      </div>
    </ModalShell>
  )
}

// ── styles (design system; inline) ──
const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }
const box: CSSProperties = { maxWidth: '100%', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22, fontFamily: 'system-ui', color: '#e6edf3' }
const teamRow: CSSProperties = { textAlign: 'left', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: '8px 10px', color: '#e6edf3', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
const field: CSSProperties = { width: '100%', height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const btn: CSSProperties = { height: 38, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e' }
