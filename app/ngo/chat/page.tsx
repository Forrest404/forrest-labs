'use client'

import { useState, useEffect, useCallback } from 'react'
import { useConfirm, SkeletonRows } from '@/lib/ngo-ui'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'

const LANG = {
  en: { title: 'Group chats', sub: 'All your organisation’s group links in one place — open, copy, or share.', trust: 'Joining opens an external app NOUR doesn’t control. Only join groups you trust.', e_save: 'Could not save the link.', e_label: 'A label is required.', e_url: 'Use an https chat-invite link (Signal, WhatsApp, Telegram, or any https URL).', e_team: 'Pick a team for a team-scope link.', e_save_net: 'Could not save — check your connection.', updated: 'Link updated.', added: 'Link added.', del_confirm_title: 'Delete', del_confirm_body: 'This removes the link for everyone in scope.', del: 'Delete', deleted: 'Link deleted.', del_fail: 'Delete failed.', e_load: 'Couldn’t load chat links. This feature may not be set up yet (the chat_links table is missing).', retry: 'Retry', loading: 'Loading…', add: '+ Add link', empty_manage: 'No chat links yet — add one above.', empty_view: 'No chat groups shared with you yet.', org: 'Organisation', teams: 'Teams', forbidden: 'Chat links aren’t available for your role.', edit_link: 'Edit link', add_link: 'Add link', label: 'Label', ph_label: 'e.g. Medical team — Signal', platform: 'Platform', invite: 'Invite link', ph_url: 'https://chat.whatsapp.com/… · signal.group/… · t.me/…', url_hint: 'Only https chat-invite links are allowed.', visible_to: 'Visible to', whole_org: 'Whole org', one_team: 'One team', select_team: 'Select a team…', desc: 'Description (optional)', ph_desc: 'What this group is for', cancel: 'Cancel', saving: 'Saving…', save: 'Save', open_join: 'Open / Join ↗', copy: 'Copy link', copied: '✓ Copied', share: 'Share', edit: 'Edit', team_word: 'Team', added_by: 'Added', by_word: 'by' },
  fr: { title: 'Groupes de discussion', sub: 'Tous les liens de groupe de votre organisation au même endroit — ouvrir, copier ou partager.', trust: 'Rejoindre ouvre une app externe que NOUR ne contrôle pas. Ne rejoignez que des groupes de confiance.', e_save: 'Impossible d’enregistrer le lien.', e_label: 'Un libellé est requis.', e_url: 'Utilisez un lien d’invitation https (Signal, WhatsApp, Telegram ou toute URL https).', e_team: 'Choisissez une équipe pour un lien d’équipe.', e_save_net: 'Échec de l’enregistrement — vérifiez votre connexion.', updated: 'Lien mis à jour.', added: 'Lien ajouté.', del_confirm_title: 'Supprimer', del_confirm_body: 'Cela supprime le lien pour tous les concernés.', del: 'Supprimer', deleted: 'Lien supprimé.', del_fail: 'Échec de la suppression.', e_load: 'Impossible de charger les liens. Cette fonctionnalité n’est peut-être pas configurée (table chat_links absente).', retry: 'Réessayer', loading: 'Chargement…', add: '+ Ajouter un lien', empty_manage: 'Aucun lien — ajoutez-en un ci-dessus.', empty_view: 'Aucun groupe partagé avec vous pour l’instant.', org: 'Organisation', teams: 'Équipes', forbidden: 'Les liens ne sont pas disponibles pour votre rôle.', edit_link: 'Modifier le lien', add_link: 'Ajouter un lien', label: 'Libellé', ph_label: 'ex. Équipe médicale — Signal', platform: 'Plateforme', invite: 'Lien d’invitation', ph_url: 'https://chat.whatsapp.com/… · signal.group/… · t.me/…', url_hint: 'Seuls les liens d’invitation https sont autorisés.', visible_to: 'Visible par', whole_org: 'Toute l’organisation', one_team: 'Une équipe', select_team: 'Sélectionner une équipe…', desc: 'Description (facultatif)', ph_desc: 'À quoi sert ce groupe', cancel: 'Annuler', saving: 'Enregistrement…', save: 'Enregistrer', open_join: 'Ouvrir / Rejoindre ↗', copy: 'Copier le lien', copied: '✓ Copié', share: 'Partager', edit: 'Modifier', team_word: 'Équipe', added_by: 'Ajouté', by_word: 'par' },
  ar: { title: 'مجموعات الدردشة', sub: 'كل روابط مجموعات منظمتك في مكان واحد — افتح أو انسخ أو شارك.', trust: 'الانضمام يفتح تطبيقاً خارجياً لا تتحكم به نور. انضمّ فقط إلى المجموعات الموثوقة.', e_save: 'تعذّر حفظ الرابط.', e_label: 'التسمية مطلوبة.', e_url: 'استخدم رابط دعوة https (Signal أو WhatsApp أو Telegram أو أي رابط https).', e_team: 'اختر فريقاً لرابط على مستوى الفريق.', e_save_net: 'تعذّر الحفظ — تحقق من اتصالك.', updated: 'تم تحديث الرابط.', added: 'تمت إضافة الرابط.', del_confirm_title: 'حذف', del_confirm_body: 'يزيل الرابط لكل المعنيين.', del: 'حذف', deleted: 'تم حذف الرابط.', del_fail: 'فشل الحذف.', e_load: 'تعذّر تحميل الروابط. قد لا تكون الميزة مُعدّة بعد (جدول chat_links غير موجود).', retry: 'إعادة المحاولة', loading: 'جارٍ التحميل…', add: '+ إضافة رابط', empty_manage: 'لا روابط بعد — أضف واحداً أعلاه.', empty_view: 'لا توجد مجموعات مشتركة معك بعد.', org: 'المنظمة', teams: 'الفِرق', forbidden: 'الروابط غير متاحة لدورك.', edit_link: 'تعديل الرابط', add_link: 'إضافة رابط', label: 'التسمية', ph_label: 'مثال: الفريق الطبي — Signal', platform: 'المنصة', invite: 'رابط الدعوة', ph_url: 'https://chat.whatsapp.com/… · signal.group/… · t.me/…', url_hint: 'يُسمح فقط بروابط الدعوة https.', visible_to: 'مرئي لـ', whole_org: 'كل المنظمة', one_team: 'فريق واحد', select_team: 'اختر فريقاً…', desc: 'الوصف (اختياري)', ph_desc: 'الغرض من هذه المجموعة', cancel: 'إلغاء', saving: 'جارٍ الحفظ…', save: 'حفظ', open_join: 'فتح / انضمام ↗', copy: 'نسخ الرابط', copied: '✓ تم النسخ', share: 'مشاركة', edit: 'تعديل', team_word: 'فريق', added_by: 'أُضيف', by_word: 'بواسطة' },
} as const

// NGO Group chats — manage links to the org's EXISTING external chat groups
// (Signal/WhatsApp/Telegram/…). NOUR hosts no messaging; members tap to join.
// Managers (org_admin/team_leader) get full CRUD; field_coordinator sees in-scope
// links + Join only (the API enforces all of this server-side too).

interface ChatLink {
  id: string
  label: string
  platform: string
  url: string
  scope: 'org' | 'team'
  team_id: string | null
  team_name: string | null
  description: string | null
  added_by: string | null
  created_at: string | null
}
interface Team { id: string; name: string }
type Editing = { id?: string; label: string; platform: string; url: string; scope: 'org' | 'team'; team_id: string; description: string }

const PLATFORMS = [
  { value: 'signal', label: 'Signal' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'other', label: 'Other' },
]
function platformIcon(p: string): string {
  switch (p) { case 'signal': return '🔵'; case 'whatsapp': return '🟢'; case 'telegram': return '🔷'; default: return '💬' }
}
function platformLabel(p: string): string {
  return PLATFORMS.find((x) => x.value === p)?.label ?? 'Other'
}
// Human host (e.g. "chat.whatsapp.com") so members can eyeball the link before opening.
function hostOf(url: string): string {
  try { return new URL(url).host } catch { return url }
}
function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
// Copy text to clipboard with a textarea fallback for non-secure contexts.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok
  } catch { return false }
}
// Mirror of the server allowlist for fast client feedback (server is the real gate).
function clientUrlOk(raw: string): boolean {
  const s = raw.trim().toLowerCase()
  if (!s) return false
  if (s.startsWith('javascript:') || s.startsWith('data:') || s.startsWith('vbscript:') || s.startsWith('file:')) return false
  if (/^https:\/\//.test(s)) return true
  return ['signal.group/', 'chat.whatsapp.com/', 'wa.me/', 't.me/', 'telegram.me/'].some((h) => s.startsWith(h))
}

export default function NgoChatPage() {
  const confirm = useConfirm()
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
  const [links, setLinks] = useState<ChatLink[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const [teams, setTeams] = useState<Team[]>([])
  const [editing, setEditing] = useState<Editing | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const r = await fetch('/api/ngo/chat', { cache: 'no-store' })
      if (r.status === 403) { setForbidden(true); setLoaded(true); return }
      if (r.ok) { const d = await r.json(); setLinks(d.links ?? []); setCanManage(!!d.can_manage) }
      else setError(true)
    } catch { setError(true) }
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  // Decide who can add/edit from the SESSION role, not from the links query — so the
  // "+ Add link" button still appears for managers even if the links list fails to
  // load (e.g. the chat_links table hasn't been created yet). Field coordinators
  // never reach this page (middleware), so this is org_admin/team_leader in practice.
  useEffect(() => {
    fetch('/api/ngo/auth/check', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.role === 'org_admin' || d?.role === 'team_leader') setCanManage(true) })
      .catch(() => { /* leave canManage as-is */ })
  }, [])

  // Teams for the picker (managers only).
  useEffect(() => {
    if (!canManage) return
    fetch('/api/ngo/teams', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { teams: [] }))
      .then((d) => setTeams(d.teams ?? []))
      .catch(() => { /* picker just stays empty */ })
  }, [canManage])

  const openNew = () => { setFormErr(null); setEditing({ label: '', platform: 'other', url: '', scope: 'org', team_id: '', description: '' }) }
  const openEdit = (l: ChatLink) => {
    setFormErr(null)
    setEditing({ id: l.id, label: l.label, platform: l.platform, url: l.url, scope: l.scope, team_id: l.team_id ?? '', description: l.description ?? '' })
  }

  const save = useCallback(async () => {
    if (!editing) return
    setFormErr(null)
    if (!editing.label.trim()) { setFormErr(t('e_label')); return }
    if (!clientUrlOk(editing.url)) { setFormErr(t('e_url')); return }
    if (editing.scope === 'team' && !editing.team_id) { setFormErr(t('e_team')); return }
    setBusy(true)
    try {
      const payload = {
        label: editing.label.trim(), platform: editing.platform, url: editing.url.trim(),
        scope: editing.scope, team_id: editing.scope === 'team' ? editing.team_id : null,
        description: editing.description.trim() || null,
      }
      const r = editing.id
        ? await fetch(`/api/ngo/chat/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/ngo/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (r.status === 403) { setForbidden(true); return }
      if (!r.ok) { setFormErr(d?.error ?? t('e_save')); return }
      setEditing(null)
      setNote(editing.id ? t('updated') : t('added'))
      await load()
    } catch { setFormErr(t('e_save_net')) }
    finally { setBusy(false) }
  }, [editing, load])

  const del = useCallback(async (l: ChatLink) => {
    if (!(await confirm({ title: `${t('del_confirm_title')} “${l.label}”?`, body: t('del_confirm_body'), danger: true, confirmLabel: t('del') }))) return
    setBusy(true); setNote(null)
    try {
      const r = await fetch(`/api/ngo/chat/${l.id}`, { method: 'DELETE' })
      if (r.ok) { setLinks((prev) => prev.filter((x) => x.id !== l.id)); setNote(t('deleted')) }
      else setNote(t('del_fail'))
    } catch { setNote(t('del_fail')) }
    finally { setBusy(false) }
  }, [])

  const orgLinks = links.filter((l) => l.scope === 'org')
  const teamLinks = links.filter((l) => l.scope === 'team')

  return (
    <div className="chat-page" style={wrap} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Mobile tuning: full-width add button + action buttons that grow to fill the
          row so every tap target is comfortable on a phone. */}
      <style>{`
        @media (max-width: 600px) {
          .chat-page .chat-add { width: 100%; }
          .chat-page .chat-actions > a,
          .chat-page .chat-actions > button { flex: 1 1 40%; margin-inline-start: 0 !important; }
        }
      `}</style>
      <h1 style={h1}>{t('title')}</h1>
      <p style={sub}>{t('sub')}</p>

      {/* Trust notice — always shown */}
      <div style={trustBox}>{t('trust')}</div>

      {note && <div style={infoBox}>{note}</div>}
      {error && (
        <div style={errBox}>
          {t('e_load')}
          <button type="button" onClick={load} style={retryBtn}>{t('retry')}</button>
        </div>
      )}
      {!loaded && <SkeletonRows rows={3} height={88} />}

      {canManage && (
        <button type="button" onClick={openNew} className="chat-add" style={{ ...primaryBtn, marginBottom: 16 }}>{t('add')}</button>
      )}

      {loaded && !error && links.length === 0 && (
        <div style={emptyBox}>{canManage ? t('empty_manage') : t('empty_view')}</div>
      )}

      {orgLinks.length > 0 && <div style={sectionLabel}>{t('org')}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orgLinks.map((l) => <LinkCard key={l.id} l={l} canManage={canManage} busy={busy} onEdit={openEdit} onDelete={del} t={t} />)}
      </div>

      {teamLinks.length > 0 && <div style={{ ...sectionLabel, marginTop: 18 }}>{t('teams')}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {teamLinks.map((l) => <LinkCard key={l.id} l={l} canManage={canManage} busy={busy} onEdit={openEdit} onDelete={del} t={t} />)}
      </div>

      {forbidden && <div style={emptyBox}>{t('forbidden')}</div>}

      {/* Add/edit modal */}
      {editing && (
        <div onClick={() => setEditing(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{editing.id ? t('edit_link') : t('add_link')}</div>

            <label style={lbl}>{t('label')}</label>
            <input style={input} value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder={t('ph_label')} />

            <label style={{ ...lbl, marginTop: 12 }}>{t('platform')}</label>
            <select style={input} value={editing.platform} onChange={(e) => setEditing({ ...editing, platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>

            <label style={{ ...lbl, marginTop: 12 }}>{t('invite')}</label>
            <input style={input} value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder={t('ph_url')} />
            <div style={hint}>{t('url_hint')}</div>

            <label style={{ ...lbl, marginTop: 12 }}>{t('visible_to')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setEditing({ ...editing, scope: 'org' })} style={toggle(editing.scope === 'org')}>{t('whole_org')}</button>
              <button type="button" onClick={() => setEditing({ ...editing, scope: 'team' })} style={toggle(editing.scope === 'team')}>{t('one_team')}</button>
            </div>
            {editing.scope === 'team' && (
              <select style={{ ...input, marginTop: 8 }} value={editing.team_id} onChange={(e) => setEditing({ ...editing, team_id: e.target.value })}>
                <option value="">{t('select_team')}</option>
                {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            )}

            <label style={{ ...lbl, marginTop: 12 }}>{t('desc')}</label>
            <input style={input} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder={t('ph_desc')} />

            {formErr && <div style={{ ...errBox, marginTop: 12, marginBottom: 0 }}>{formErr}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setEditing(null)} style={{ ...ghostBtn, flex: 1, height: 40 }}>{t('cancel')}</button>
              <button type="button" onClick={save} disabled={busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? t('saving') : t('save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LinkCard({ l, canManage, busy, onEdit, onDelete, t }: { l: ChatLink; canManage: boolean; busy: boolean; onEdit: (l: ChatLink) => void; onDelete: (l: ChatLink) => void; t: (k: string) => string }) {
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && !!navigator.share) }, [])

  const doCopy = async () => {
    const ok = await copyText(l.url)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
  }
  const doShare = async () => {
    try { await navigator.share({ title: l.label, text: `Join ${l.label} on ${platformLabel(l.platform)}`, url: l.url }) } catch { /* user dismissed */ }
  }

  const added = shortDate(l.created_at)
  return (
    <div style={{ ...card, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 20, lineHeight: '24px' }}>{platformIcon(l.platform)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>{l.label}</div>
          {l.description && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>{l.description}</div>}
          {/* Group info: platform, the link's host (eyeball before opening), scope. */}
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={pill}>{platformLabel(l.platform)}</span>
            <span style={{ color: '#6e7681' }}>{hostOf(l.url)}</span>
            <span style={{ color: '#484f58' }}>·</span>
            <span style={{ color: '#6e7681' }}>{l.scope === 'team' ? `${t('team_word')}${l.team_name ? ` · ${l.team_name}` : ''}` : t('whole_org')}</span>
          </div>
          {(l.added_by || added) && (
            <div style={{ fontSize: 11, color: '#484f58', marginTop: 3 }}>
              {t('added_by')}{l.added_by ? ` ${t('by_word')} ${l.added_by}` : ''}{added ? ` · ${added}` : ''}
            </div>
          )}
        </div>
      </div>
      <div className="chat-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Tap to open — never auto-open. New tab, no referrer/opener. */}
        <a href={l.url} target="_blank" rel="noreferrer noopener" style={joinBtn}>{t('open_join')}</a>
        <button type="button" onClick={doCopy} style={{ ...miniBtn, ...(copied ? { color: '#3fb950', borderColor: 'rgba(63,185,80,0.45)' } : {}) }}>{copied ? t('copied') : t('copy')}</button>
        {canShare && <button type="button" onClick={doShare} style={miniBtn}>{t('share')}</button>}
        {canManage && <button type="button" disabled={busy} onClick={() => onEdit(l)} style={{ ...miniBtn, marginInlineStart: 'auto' }}>{t('edit')}</button>}
        {canManage && <button type="button" disabled={busy} onClick={() => onDelete(l)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>{t('del')}</button>}
      </div>
    </div>
  )
}

// ── styles (design system; mobile-first) ──
const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }
const h1: React.CSSProperties = { fontSize: 20, fontWeight: 600, margin: '0 0 4px', color: '#e6edf3' }
const sub: React.CSSProperties = { fontSize: 13, color: '#8b949e', margin: '0 0 14px' }
const trustBox: React.CSSProperties = { background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.35)', color: '#d29922', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#484f58', margin: '0 0 8px' }
const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }
const joinBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: '0 16px', background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.45)', color: '#3fb950', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }
const pill: React.CSSProperties = { background: '#21262d', color: '#c9d1d9', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 600 }
const miniBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: '0 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#c9d1d9', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const primaryBtn: React.CSSProperties = { height: 42, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const ghostBtn: React.CSSProperties = { padding: '0 14px', background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
const muted: React.CSSProperties = { fontSize: 13, color: '#8b949e' }
const emptyBox: React.CSSProperties = { fontSize: 13, color: '#484f58', padding: '24px 0', textAlign: 'center' }
const infoBox: React.CSSProperties = { background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const errBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'transparent', border: '1px solid #f85149', color: '#f85149', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }
const modal: React.CSSProperties = { width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6 }
// height 44 + fontSize 16: comfortable finger target and prevents iOS Safari from
// auto-zooming the viewport when an input < 16px gains focus.
const input: React.CSSProperties = { width: '100%', height: 44, boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 16, padding: '0 12px', fontFamily: 'system-ui', outline: 'none' }
const hint: React.CSSProperties = { fontSize: 11, color: '#8b949e', marginTop: 4 }
function toggle(active: boolean): React.CSSProperties {
  return { flex: 1, minHeight: 44, borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(88,166,255,0.15)' : '#0d1117', border: active ? '1px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }
}
