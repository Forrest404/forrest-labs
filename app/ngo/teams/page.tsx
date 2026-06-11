'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useConfirm, useToast, SkeletonRows } from '@/lib/ngo-ui'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'

const LANG = {
  en: { title: 'Teams', sub: 'Build your teams and the people in them.', new_team: '+ New team', e_load: 'Could not load teams.', e_save_team: 'Could not save team.', e_del_team: 'Could not delete team.', e_mname: 'Member name is required.', e_add: 'Could not add member.', e_upd: 'Could not update member.', e_rm: 'Could not remove member.', e_move_pick: 'Choose a team to move them to.', e_move: 'Could not move member.', e_invite: 'Could not send invite.', confirm_del_team_t: 'Delete this team?', confirm_del_team_b: 'The team and all its members will be removed.', del: 'Delete', team_deleted: 'Team deleted', confirm_rm_t: 'Remove this member from the team?', remove: 'Remove', member_removed: 'Member removed', loading: 'Loading…', no_teams: 'No teams yet — add one with “New team”.', off_duty: '🌙 off duty', capacity: 'capacity', edit: 'Edit', select_team_manage: 'Select a team to manage its members.', members_suffix: '— members', unlinked_warn_a: 'member(s) aren’t linked to a login account, so they won’t receive dispatches, broadcasts or safety alerts.', unlinked_admin: 'Use Invite to give them app access.', unlinked_nonadmin: 'Ask an org admin to invite them.', no_members: 'No members yet.', app_access: 'App access ✓', no_app: 'No app access — won’t get alerts', ice: 'ICE', invite: 'Invite', move: 'Move', add_member_h: 'Add a member', ph_name: 'Name', ph_role: 'Role (e.g. medic)', ph_phone: 'Phone', ph_ice: 'Emergency contact', add_member: 'Add member', edit_team: 'Edit team', new_team_t: 'New team', name: 'Name', type: 'Type', capacity_opt: 'Capacity (optional)', chat_link: 'Group chat link (optional)', ph_chat: 'https://chat.whatsapp.com/… or signal:…', chat_hint: 'Field staff open this in one tap. Signal / WhatsApp / Telegram invite link.', chat_after: 'You can add a group-chat link after creating the team.', saving: 'Saving…', save_team: 'Save team', edit_member: 'Edit member', role: 'Role', phone: 'Phone', ice_full: 'Emergency contact', save_member: 'Save member', move_title: 'Move', transfer_desc: 'Moves them to another team in your organisation. Their app access, role and contacts move with them, and if they have a login they’re notified of the change.', move_to_team: 'Move to team', select_team: 'Select a team…', moving: 'Moving…', move_member: 'Move member', invite_title: 'Invite', invite_desc: 'Creates a field-coordinator login. We generate a one-tap access code — they sign in by typing it or scanning a QR. No password needed.', email: 'Email', inviting: 'Inviting…', create_code: 'Create access code', can_sign_in: 'can sign in', share_code_a: 'Share this access code with', share_code_b: 'They enter it on the NOUR login screen, or open the link below. Manage the QR and regenerate it any time from', users_link: 'Users', copy_code: 'Copy code', copy_link: 'Copy login link', done: 'Done' },
  fr: { title: 'Équipes', sub: 'Constituez vos équipes et leurs membres.', new_team: '+ Nouvelle équipe', e_load: 'Impossible de charger les équipes.', e_save_team: 'Impossible d’enregistrer l’équipe.', e_del_team: 'Impossible de supprimer l’équipe.', e_mname: 'Le nom du membre est requis.', e_add: 'Impossible d’ajouter le membre.', e_upd: 'Impossible de mettre à jour le membre.', e_rm: 'Impossible de retirer le membre.', e_move_pick: 'Choisissez une équipe de destination.', e_move: 'Impossible de déplacer le membre.', e_invite: 'Impossible d’envoyer l’invitation.', confirm_del_team_t: 'Supprimer cette équipe ?', confirm_del_team_b: 'L’équipe et tous ses membres seront supprimés.', del: 'Supprimer', team_deleted: 'Équipe supprimée', confirm_rm_t: 'Retirer ce membre de l’équipe ?', remove: 'Retirer', member_removed: 'Membre retiré', loading: 'Chargement…', no_teams: 'Aucune équipe — créez-en une avec « Nouvelle équipe ».', off_duty: '🌙 hors service', capacity: 'capacité', edit: 'Modifier', select_team_manage: 'Sélectionnez une équipe pour gérer ses membres.', members_suffix: '— membres', unlinked_warn_a: 'membre(s) ne sont pas liés à un compte, ils ne recevront ni déploiements, ni diffusions, ni alertes.', unlinked_admin: 'Utilisez Inviter pour leur donner l’accès.', unlinked_nonadmin: 'Demandez à un administrateur de les inviter.', no_members: 'Aucun membre.', app_access: 'Accès app ✓', no_app: 'Pas d’accès app — pas d’alertes', ice: 'ICE', invite: 'Inviter', move: 'Déplacer', add_member_h: 'Ajouter un membre', ph_name: 'Nom', ph_role: 'Rôle (ex. secouriste)', ph_phone: 'Téléphone', ph_ice: 'Contact d’urgence', add_member: 'Ajouter le membre', edit_team: 'Modifier l’équipe', new_team_t: 'Nouvelle équipe', name: 'Nom', type: 'Type', capacity_opt: 'Capacité (facultatif)', chat_link: 'Lien de groupe (facultatif)', ph_chat: 'https://chat.whatsapp.com/… ou signal:…', chat_hint: 'Le personnel l’ouvre en un tap. Lien d’invitation Signal / WhatsApp / Telegram.', chat_after: 'Vous pourrez ajouter un lien de groupe après la création.', saving: 'Enregistrement…', save_team: 'Enregistrer l’équipe', edit_member: 'Modifier le membre', role: 'Rôle', phone: 'Téléphone', ice_full: 'Contact d’urgence', save_member: 'Enregistrer le membre', move_title: 'Déplacer', transfer_desc: 'Les déplace vers une autre équipe de votre organisation. Accès, rôle et contacts les suivent ; s’ils ont un compte, ils sont notifiés.', move_to_team: 'Déplacer vers l’équipe', select_team: 'Sélectionner une équipe…', moving: 'Déplacement…', move_member: 'Déplacer le membre', invite_title: 'Inviter', invite_desc: 'Crée un identifiant de coordinateur de terrain. Un code d’accès en un tap est généré — connexion en le saisissant ou via un QR. Sans mot de passe.', email: 'E-mail', inviting: 'Invitation…', create_code: 'Créer un code d’accès', can_sign_in: 'peut se connecter', share_code_a: 'Partagez ce code d’accès avec', share_code_b: 'Il le saisit sur l’écran de connexion NOUR, ou ouvre le lien ci-dessous. Gérez le QR depuis', users_link: 'Utilisateurs', copy_code: 'Copier le code', copy_link: 'Copier le lien', done: 'Terminé' },
  ar: { title: 'الفِرق', sub: 'كوّن فِرقك والأشخاص فيها.', new_team: '+ فريق جديد', e_load: 'تعذّر تحميل الفِرق.', e_save_team: 'تعذّر حفظ الفريق.', e_del_team: 'تعذّر حذف الفريق.', e_mname: 'اسم العضو مطلوب.', e_add: 'تعذّرت إضافة العضو.', e_upd: 'تعذّر تحديث العضو.', e_rm: 'تعذّر إزالة العضو.', e_move_pick: 'اختر فريقاً لنقلهم إليه.', e_move: 'تعذّر نقل العضو.', e_invite: 'تعذّر إرسال الدعوة.', confirm_del_team_t: 'حذف هذا الفريق؟', confirm_del_team_b: 'سيُحذف الفريق وكل أعضائه.', del: 'حذف', team_deleted: 'تم حذف الفريق', confirm_rm_t: 'إزالة هذا العضو من الفريق؟', remove: 'إزالة', member_removed: 'تمت إزالة العضو', loading: 'جارٍ التحميل…', no_teams: 'لا فِرق بعد — أضف واحداً عبر «فريق جديد».', off_duty: '🌙 خارج الخدمة', capacity: 'السعة', edit: 'تعديل', select_team_manage: 'اختر فريقاً لإدارة أعضائه.', members_suffix: '— الأعضاء', unlinked_warn_a: 'عضو/أعضاء غير مرتبطين بحساب دخول، لذا لن يتلقّوا الإيفاد أو البثّ أو تنبيهات السلامة.', unlinked_admin: 'استخدم «دعوة» لمنحهم الوصول.', unlinked_nonadmin: 'اطلب من مسؤول المنظمة دعوتهم.', no_members: 'لا أعضاء بعد.', app_access: 'وصول للتطبيق ✓', no_app: 'لا وصول للتطبيق — لا تنبيهات', ice: 'طوارئ', invite: 'دعوة', move: 'نقل', add_member_h: 'إضافة عضو', ph_name: 'الاسم', ph_role: 'الدور (مثل مسعف)', ph_phone: 'الهاتف', ph_ice: 'جهة اتصال للطوارئ', add_member: 'إضافة العضو', edit_team: 'تعديل الفريق', new_team_t: 'فريق جديد', name: 'الاسم', type: 'النوع', capacity_opt: 'السعة (اختياري)', chat_link: 'رابط مجموعة الدردشة (اختياري)', ph_chat: 'https://chat.whatsapp.com/… أو signal:…', chat_hint: 'يفتحه الميدانيون بضغطة. رابط دعوة Signal / WhatsApp / Telegram.', chat_after: 'يمكنك إضافة رابط مجموعة بعد إنشاء الفريق.', saving: 'جارٍ الحفظ…', save_team: 'حفظ الفريق', edit_member: 'تعديل العضو', role: 'الدور', phone: 'الهاتف', ice_full: 'جهة اتصال للطوارئ', save_member: 'حفظ العضو', move_title: 'نقل', transfer_desc: 'ينقلهم إلى فريق آخر في منظمتك. ينتقل معهم الوصول والدور وجهات الاتصال، وإن كان لديهم حساب يُبلَّغون بالتغيير.', move_to_team: 'النقل إلى فريق', select_team: 'اختر فريقاً…', moving: 'جارٍ النقل…', move_member: 'نقل العضو', invite_title: 'دعوة', invite_desc: 'تنشئ حساب منسّق ميداني. نولّد رمز وصول بضغطة — يسجّل الدخول بكتابته أو بمسح QR. بلا كلمة مرور.', email: 'البريد الإلكتروني', inviting: 'جارٍ الدعوة…', create_code: 'إنشاء رمز وصول', can_sign_in: 'يمكنه تسجيل الدخول', share_code_a: 'شارك رمز الوصول مع', share_code_b: 'يُدخله في شاشة دخول نور، أو يفتح الرابط أدناه. أدِر رمز QR من', users_link: 'المستخدمون', copy_code: 'نسخ الرمز', copy_link: 'نسخ رابط الدخول', done: 'تم' },
} as const

// Team roster: org_admin and team_leader manage teams and their members.
// Only org_admin may delete a team or invite a member as a field coordinator.

const TEAM_TYPES = ['medical', 'rescue', 'assessment', 'shelter', 'logistics'] as const

interface Team { id: string; name: string; type: string; capacity: number | null; status: string; all_off_duty?: boolean; group_chat_url?: string | null }
interface Member { id: string; name: string; role: string | null; phone: string | null; emergency_contact: string | null; ngo_user_id: string | null }

const STATUS_COLOUR: Record<string, string> = {
  standby: '#3fb950', deployed: '#d29922', unavailable: '#8b949e', offline: '#484f58', off_duty: '#a371f7',
}

export default function NgoTeamsPage() {
  const confirm = useConfirm()
  const toast = useToast()
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
  const [role, setRole] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // modal state
  const [teamModal, setTeamModal] = useState<null | { id?: string; name: string; type: string; capacity: string; chat: string }>(null)
  const [memberForm, setMemberForm] = useState({ name: '', role: '', phone: '', emergency_contact: '' })
  const [memberEdit, setMemberEdit] = useState<null | { id: string; name: string; role: string; phone: string; emergency_contact: string }>(null)
  const [inviteModal, setInviteModal] = useState<null | { memberId: string; name: string; email: string }>(null)
  const [transferModal, setTransferModal] = useState<null | { memberId: string; name: string; targetTeamId: string }>(null)
  const [inviteResult, setInviteResult] = useState<null | { name: string; code: string }>(null)
  const [busy, setBusy] = useState(false)

  const isAdmin = role === 'org_admin'

  useEffect(() => {
    fetch('/api/ngo/auth/check').then((r) => (r.ok ? r.json() : null)).then((d) => setRole(d?.role ?? null)).catch(() => {})
  }, [])

  const loadTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/ngo/teams')
      if (res.ok) { setTeams((await res.json()).teams ?? []); setErr(null) }
      else setErr(t('e_load'))
    } catch { setErr(t('e_load')) }
    finally { setLoaded(true) }
  }, [])
  useEffect(() => { loadTeams() }, [loadTeams])

  const loadMembers = useCallback(async (teamId: string) => {
    const res = await fetch(`/api/ngo/teams/${teamId}/members`)
    if (res.ok) setMembers((await res.json()).members ?? [])
  }, [])
  useEffect(() => { if (selected) loadMembers(selected); else setMembers([]) }, [selected, loadMembers])

  // ── Team CRUD ──────────────────────────────────────────────────────────
  async function saveTeam() {
    if (!teamModal) return
    setErr(null); setBusy(true)
    const editing = !!teamModal.id
    try {
      const res = await fetch(editing ? `/api/ngo/teams/${teamModal.id}` : '/api/ngo/teams', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamModal.name, type: teamModal.type, capacity: teamModal.capacity || null, group_chat_url: teamModal.chat.trim() }),
      })
      const data = await res.json()
      if (res.ok) { setTeamModal(null); await loadTeams() }
      else setErr(data.error ?? t('e_save_team'))
    } finally { setBusy(false) }
  }

  async function deleteTeam(id: string) {
    if (!(await confirm({ title: t('confirm_del_team_t'), body: t('confirm_del_team_b'), danger: true, confirmLabel: t('del') }))) return
    setErr(null)
    const res = await fetch(`/api/ngo/teams/${id}`, { method: 'DELETE' })
    if (res.ok) { if (selected === id) setSelected(null); toast(t('team_deleted')); await loadTeams() }
    else setErr((await res.json()).error ?? t('e_del_team'))
  }

  // ── Members ──────────────────────────────────────────────────────────────
  async function addMember() {
    if (!selected || !memberForm.name.trim()) { setErr(t('e_mname')); return }
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/ngo/teams/${selected}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberForm),
      })
      if (res.ok) { setMemberForm({ name: '', role: '', phone: '', emergency_contact: '' }); await loadMembers(selected) }
      else setErr((await res.json()).error ?? t('e_add'))
    } finally { setBusy(false) }
  }

  async function saveMemberEdit() {
    if (!memberEdit || !selected || !memberEdit.name.trim()) { setErr(t('e_mname')); return }
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/ngo/teams/${selected}/members/${memberEdit.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: memberEdit.name, role: memberEdit.role, phone: memberEdit.phone, emergency_contact: memberEdit.emergency_contact }),
      })
      if (res.ok) { setMemberEdit(null); await loadMembers(selected) }
      else setErr((await res.json()).error ?? t('e_upd'))
    } finally { setBusy(false) }
  }

  async function removeMember(memberId: string) {
    if (!selected) return
    if (!(await confirm({ title: t('confirm_rm_t'), danger: true, confirmLabel: t('remove') }))) return
    const res = await fetch(`/api/ngo/teams/${selected}/members/${memberId}`, { method: 'DELETE' })
    if (res.ok) { toast(t('member_removed')); await loadMembers(selected) }
    else setErr((await res.json()).error ?? t('e_rm'))
  }

  async function transferMember() {
    if (!transferModal || !selected || !transferModal.targetTeamId) { setErr(t('e_move_pick')); return }
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/ngo/teams/${selected}/members/${transferModal.memberId}/transfer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_team_id: transferModal.targetTeamId }),
      })
      const data = await res.json()
      if (res.ok) { setTransferModal(null); await loadMembers(selected) } // they leave this team's roster
      else setErr(data.error ?? t('e_move'))
    } finally { setBusy(false) }
  }

  async function sendInvite() {
    if (!inviteModal || !selected) return
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/ngo/teams/${selected}/members/${inviteModal.memberId}/invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteModal.email }),
      })
      const data = await res.json()
      if (res.ok) { const name = inviteModal.name; setInviteModal(null); await loadMembers(selected); if (data.login_code) setInviteResult({ name, code: data.login_code }) }
      else setErr(data.error ?? t('e_invite'))
    } finally { setBusy(false) }
  }

  const selectedTeam = teams.find((t) => t.id === selected)

  return (
    <div className="ngo-page" style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }} dir={isRtl ? 'rtl' : 'ltr'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
          <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>{t('sub')}</div>
        </div>
        <button type="button" onClick={() => setTeamModal({ name: '', type: 'medical', capacity: '', chat: '' })} style={primaryBtn}>{t('new_team')}</button>
      </div>

      {err && <div style={errorBox}>{err}</div>}

      <div className="ngo-split" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Teams list */}
        <div style={{ flex: '0 0 340px' }}>
          {!loaded && <SkeletonRows rows={4} height={88} />}
          {loaded && teams.length === 0 && <div style={{ ...card, color: '#8b949e', fontSize: 13 }}>{t('no_teams')}</div>}
          {teams.map((tm) => (
            <div key={tm.id} onClick={() => setSelected(tm.id)} style={{ ...card, cursor: 'pointer', borderColor: selected === tm.id ? '#58a6ff' : '#21262d', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>{tm.name}</div>
                <span style={{ fontSize: 11, color: STATUS_COLOUR[tm.all_off_duty ? 'off_duty' : tm.status] ?? '#484f58' }}>● {tm.all_off_duty ? t('off_duty') : tm.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                {tm.type}{tm.capacity != null ? ` · ${t('capacity')} ${tm.capacity}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); setTeamModal({ id: tm.id, name: tm.name, type: tm.type, capacity: tm.capacity?.toString() ?? '', chat: tm.group_chat_url ?? '' }) }} style={miniBtn}>{t('edit')}</button>
                {isAdmin && <button type="button" onClick={(e) => { e.stopPropagation(); deleteTeam(tm.id) }} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>{t('del')}</button>}
              </div>
            </div>
          ))}
        </div>

        {/* Members panel */}
        <div style={{ flex: 1 }}>
          {!selectedTeam ? (
            <div style={{ ...card, color: '#8b949e', fontSize: 13 }}>{t('select_team_manage')}</div>
          ) : (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>{selectedTeam.name} {t('members_suffix')}</div>

              {members.some((m) => !m.ngo_user_id) && (
                <div style={{ background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.4)', color: '#d29922', borderRadius: 6, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>
                  {members.filter((m) => !m.ngo_user_id).length} {t('unlinked_warn_a')} {isAdmin ? t('unlinked_admin') : t('unlinked_nonadmin')}
                </div>
              )}

              {members.length === 0 && <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 12 }}>{t('no_members')}</div>}
              {members.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid #21262d' }}>
                  <div>
                    <div style={{ fontSize: 14 }}>
                      {m.name}
                      {m.ngo_user_id
                        ? <span style={{ fontSize: 11, color: '#3fb950', marginInlineStart: 8 }}>{t('app_access')}</span>
                        : <span style={{ fontSize: 11, color: '#d29922', marginInlineStart: 8 }}>⚠ {t('no_app')}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>
                      {[m.role, m.phone].filter(Boolean).join(' · ') || '—'}
                      {m.emergency_contact ? ` · ${t('ice')}: ${m.emergency_contact}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setMemberEdit({ id: m.id, name: m.name, role: m.role ?? '', phone: m.phone ?? '', emergency_contact: m.emergency_contact ?? '' })} style={miniBtn}>{t('edit')}</button>
                    {isAdmin && !m.ngo_user_id && (
                      <button type="button" onClick={() => setInviteModal({ memberId: m.id, name: m.name, email: '' })} style={miniBtn}>{t('invite')}</button>
                    )}
                    {teams.length > 1 && (
                      <button type="button" onClick={() => setTransferModal({ memberId: m.id, name: m.name, targetTeamId: '' })} style={miniBtn}>{t('move')}</button>
                    )}
                    <button type="button" onClick={() => removeMember(m.id)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>{t('remove')}</button>
                  </div>
                </div>
              ))}

              {/* Add member */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #21262d' }}>
                <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 8 }}>{t('add_member_h')}</div>
                <div className="ngo-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input style={field} placeholder={t('ph_name')} value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
                  <input style={field} placeholder={t('ph_role')} value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} />
                  <input style={field} placeholder={t('ph_phone')} value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} />
                  <input style={field} placeholder={t('ph_ice')} value={memberForm.emergency_contact} onChange={(e) => setMemberForm({ ...memberForm, emergency_contact: e.target.value })} />
                </div>
                <button type="button" onClick={addMember} disabled={busy} style={{ ...primaryBtn, marginTop: 8 }}>{t('add_member')}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Team modal */}
      {teamModal && (
        <Modal title={teamModal.id ? t('edit_team') : t('new_team_t')} onClose={() => setTeamModal(null)}>
          <label style={labelStyle}>{t('name')}</label>
          <input style={field} value={teamModal.name} onChange={(e) => setTeamModal({ ...teamModal, name: e.target.value })} />
          <label style={{ ...labelStyle, marginTop: 12 }}>{t('type')}</label>
          <select style={field} value={teamModal.type} onChange={(e) => setTeamModal({ ...teamModal, type: e.target.value })}>
            {TEAM_TYPES.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
          </select>
          <label style={{ ...labelStyle, marginTop: 12 }}>{t('capacity_opt')}</label>
          <input style={field} type="number" min={0} value={teamModal.capacity} onChange={(e) => setTeamModal({ ...teamModal, capacity: e.target.value })} />
          {teamModal.id ? (
            <>
              <label style={{ ...labelStyle, marginTop: 12 }}>{t('chat_link')}</label>
              <input style={field} value={teamModal.chat} onChange={(e) => setTeamModal({ ...teamModal, chat: e.target.value })} placeholder={t('ph_chat')} />
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{t('chat_hint')}</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 8 }}>{t('chat_after')}</div>
          )}
          <button type="button" onClick={saveTeam} disabled={busy || !teamModal.name.trim()} style={{ ...primaryBtn, marginTop: 16, opacity: busy || !teamModal.name.trim() ? 0.6 : 1 }}>
            {busy ? t('saving') : t('save_team')}
          </button>
        </Modal>
      )}

      {/* Member edit modal */}
      {memberEdit && (
        <Modal title={t('edit_member')} onClose={() => setMemberEdit(null)}>
          <label style={labelStyle}>{t('name')}</label>
          <input style={field} value={memberEdit.name} onChange={(e) => setMemberEdit({ ...memberEdit, name: e.target.value })} />
          <label style={{ ...labelStyle, marginTop: 12 }}>{t('role')}</label>
          <input style={field} value={memberEdit.role} onChange={(e) => setMemberEdit({ ...memberEdit, role: e.target.value })} />
          <label style={{ ...labelStyle, marginTop: 12 }}>{t('phone')}</label>
          <input style={field} value={memberEdit.phone} onChange={(e) => setMemberEdit({ ...memberEdit, phone: e.target.value })} />
          <label style={{ ...labelStyle, marginTop: 12 }}>{t('ice_full')}</label>
          <input style={field} value={memberEdit.emergency_contact} onChange={(e) => setMemberEdit({ ...memberEdit, emergency_contact: e.target.value })} />
          <button type="button" onClick={saveMemberEdit} disabled={busy || !memberEdit.name.trim()} style={{ ...primaryBtn, marginTop: 16, opacity: busy || !memberEdit.name.trim() ? 0.6 : 1 }}>
            {busy ? t('saving') : t('save_member')}
          </button>
        </Modal>
      )}

      {/* Transfer / move member modal */}
      {transferModal && (
        <Modal title={`${t('move_title')} ${transferModal.name}`} onClose={() => setTransferModal(null)}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            {t('transfer_desc')}
          </div>
          <label style={labelStyle}>{t('move_to_team')}</label>
          <select style={field} value={transferModal.targetTeamId} onChange={(e) => setTransferModal({ ...transferModal, targetTeamId: e.target.value })}>
            <option value="">{t('select_team')}</option>
            {teams.filter((tm) => tm.id !== selected).map((tm) => <option key={tm.id} value={tm.id}>{tm.name} ({tm.type})</option>)}
          </select>
          <button type="button" onClick={transferMember} disabled={busy || !transferModal.targetTeamId} style={{ ...primaryBtn, marginTop: 16, opacity: busy || !transferModal.targetTeamId ? 0.6 : 1 }}>
            {busy ? t('moving') : t('move_member')}
          </button>
        </Modal>
      )}

      {/* Invite modal */}
      {inviteModal && (
        <Modal title={`${t('invite_title')} ${inviteModal.name}`} onClose={() => setInviteModal(null)}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            {t('invite_desc')}
          </div>
          <label style={labelStyle}>{t('email')}</label>
          <input style={field} type="email" value={inviteModal.email} onChange={(e) => setInviteModal({ ...inviteModal, email: e.target.value })} />
          <button type="button" onClick={sendInvite} disabled={busy} style={{ ...primaryBtn, marginTop: 16, opacity: busy ? 0.6 : 1 }}>
            {busy ? t('inviting') : t('create_code')}
          </button>
        </Modal>
      )}

      {/* Invite result — show the access code once */}
      {inviteResult && (
        <Modal title={`${inviteResult.name} ${t('can_sign_in')}`} onClose={() => setInviteResult(null)}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            {t('share_code_a')} {inviteResult.name}. {t('share_code_b')} <Link href="/ngo/users" style={{ color: '#58a6ff', textDecoration: 'none' }}>{t('users_link')}</Link>.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '12px 14px' }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.18em' }}>{inviteResult.code}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(inviteResult.code)} style={miniBtn}>{t('copy_code')}</button>
          </div>
          <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/ngo/login?code=${inviteResult.code}`)} style={{ ...miniBtn, marginTop: 10 }}>{t('copy_link')}</button>
          <button type="button" onClick={() => setInviteResult(null)} style={{ ...primaryBtn, marginTop: 16 }}>{t('done')}</button>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 360, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14 }
const field: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const primaryBtn: React.CSSProperties = { height: 38, padding: '0 16px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const miniBtn: React.CSSProperties = { height: 34, padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
