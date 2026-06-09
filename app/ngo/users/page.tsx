'use client'

import { useEffect, useState, useCallback } from 'react'
import { useConfirm } from '@/lib/ngo-ui'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'

const LANG = {
  en: { title: 'Users', sub: 'People who can sign in to your organisation.', invite_email: '✉ Invite by email', add_user: '+ Add user', e_admin_only: 'Only an org admin can manage users.', e_load: 'Could not load users.', user_added: 'User added.', e_add: 'Could not add user.', user_updated: 'User updated.', e_upd: 'Could not update user.', suspended_msg: 'User suspended.', reactivated_msg: 'User reactivated.', e_status: 'Could not change status.', so_confirm_t: 'Sign %name out of all devices?', so_confirm_b: 'Any phone or browser they’re logged in on stops working immediately. Use this for a lost or seized device.', sign_out: 'Sign out', so_done: 'Signed out of all devices.', e_so: 'Could not sign the user out.', rc_confirm_t: 'Reset %name’s access code?', rc_confirm_b: 'Their current code and QR stop working immediately — you’ll need to share the new one.', reset_code: 'Reset code', e_rc: 'Could not reset access code.', rm_confirm_t: 'Remove %name?', rm_confirm_b: 'This deletes their login and their personal check-in/panic history. This cannot be undone.', remove: 'Remove', user_removed: 'User removed.', e_rm: 'Could not remove user.', inv_sent: 'Invite sent.', inv_stub: 'Invite created — email isn’t configured yet, so nothing was sent.', inv_fail: 'Invite created, but the email failed to send (check email/domain setup).', e_inv: 'Could not send the invite.', e_inv_net: 'Could not send the invite. Please try again.', copied: 'Copied.', retry: 'Retry', loading: 'Loading…', no_users: 'No users yet — add one.', search_users: 'Search by name, email or phone…', no_match: 'No users match your search.', you: 'you', suspended: 'suspended', access_code: 'Access code:', show_qr: 'Show QR / link', none: 'none', gen_code: 'Generate code', edit: 'Edit', suspend: 'Suspend', reactivate: 'Reactivate', signout_devices: 'Sign out devices', role_org_admin: 'Org admin', role_team_leader: 'Team leader', role_field_coordinator: 'Field coordinator', add_user_t: 'Add user', full_name: 'Full name', email: 'Email', phone_opt: 'Phone (optional)', role: 'Role', fc_note: 'A unique access code is generated automatically — you’ll get a code + QR to share after adding.', password8: 'Password (min 8 chars)', adding: 'Adding…', invite_t: 'Invite by email', invite_desc: 'They’ll get a single-use link to set their own name and password/PIN and join your organisation.', team_opt: 'Team (optional)', no_team: 'No team', sending: 'Sending…', send_invite: 'Send invite', edit_user_t: 'Edit user', phone: 'Phone', status: 'Status', active: 'Active', suspended_opt: 'Suspended', team: 'Team', keep_team: 'Keep current team', regen_label: 'Regenerate access code (old code stops working)', reset_pw: 'Reset password (optional, min 8 chars)', saving: 'Saving…', save: 'Save', access_code_title: 'Access code', share_desc: 'Share this with the field worker. They type the code, or scan the QR to sign in.', gen_qr: 'Generating QR…', copy_code: 'Copy code', copy_link: 'Copy login link' },
  fr: { title: 'Utilisateurs', sub: 'Les personnes qui peuvent se connecter à votre organisation.', invite_email: '✉ Inviter par e-mail', add_user: '+ Ajouter un utilisateur', e_admin_only: 'Seul un administrateur peut gérer les utilisateurs.', e_load: 'Impossible de charger les utilisateurs.', user_added: 'Utilisateur ajouté.', e_add: 'Impossible d’ajouter l’utilisateur.', user_updated: 'Utilisateur mis à jour.', e_upd: 'Impossible de mettre à jour l’utilisateur.', suspended_msg: 'Utilisateur suspendu.', reactivated_msg: 'Utilisateur réactivé.', e_status: 'Impossible de changer le statut.', so_confirm_t: 'Déconnecter %name de tous les appareils ?', so_confirm_b: 'Tout téléphone ou navigateur connecté cesse de fonctionner immédiatement. À utiliser pour un appareil perdu ou saisi.', sign_out: 'Déconnecter', so_done: 'Déconnecté de tous les appareils.', e_so: 'Impossible de déconnecter l’utilisateur.', rc_confirm_t: 'Réinitialiser le code d’accès de %name ?', rc_confirm_b: 'Son code et son QR actuels cessent de fonctionner immédiatement — vous devrez partager le nouveau.', reset_code: 'Réinitialiser le code', e_rc: 'Impossible de réinitialiser le code.', rm_confirm_t: 'Retirer %name ?', rm_confirm_b: 'Supprime son identifiant et son historique de pointage/panique. Irréversible.', remove: 'Retirer', user_removed: 'Utilisateur supprimé.', e_rm: 'Impossible de supprimer l’utilisateur.', inv_sent: 'Invitation envoyée.', inv_stub: 'Invitation créée — l’e-mail n’est pas configuré, rien n’a été envoyé.', inv_fail: 'Invitation créée, mais l’e-mail n’a pas pu être envoyé (vérifiez la configuration).', e_inv: 'Impossible d’envoyer l’invitation.', e_inv_net: 'Impossible d’envoyer l’invitation. Réessayez.', copied: 'Copié.', retry: 'Réessayer', loading: 'Chargement…', no_users: 'Aucun utilisateur — ajoutez-en un.', search_users: 'Rechercher par nom, e-mail ou téléphone…', no_match: 'Aucun utilisateur ne correspond.', you: 'vous', suspended: 'suspendu', access_code: 'Code d’accès :', show_qr: 'Afficher QR / lien', none: 'aucun', gen_code: 'Générer un code', edit: 'Modifier', suspend: 'Suspendre', reactivate: 'Réactiver', signout_devices: 'Déconnecter les appareils', role_org_admin: 'Administrateur', role_team_leader: 'Chef d’équipe', role_field_coordinator: 'Coordinateur de terrain', add_user_t: 'Ajouter un utilisateur', full_name: 'Nom complet', email: 'E-mail', phone_opt: 'Téléphone (facultatif)', role: 'Rôle', fc_note: 'Un code d’accès unique est généré automatiquement — vous obtiendrez un code + QR à partager après l’ajout.', password8: 'Mot de passe (8 car. min)', adding: 'Ajout…', invite_t: 'Inviter par e-mail', invite_desc: 'Ils recevront un lien à usage unique pour définir leur nom et mot de passe/PIN et rejoindre votre organisation.', team_opt: 'Équipe (facultatif)', no_team: 'Aucune équipe', sending: 'Envoi…', send_invite: 'Envoyer l’invitation', edit_user_t: 'Modifier l’utilisateur', phone: 'Téléphone', status: 'Statut', active: 'Actif', suspended_opt: 'Suspendu', team: 'Équipe', keep_team: 'Conserver l’équipe actuelle', regen_label: 'Régénérer le code d’accès (l’ancien cesse de fonctionner)', reset_pw: 'Réinitialiser le mot de passe (facultatif, 8 car. min)', saving: 'Enregistrement…', save: 'Enregistrer', access_code_title: 'Code d’accès', share_desc: 'Partagez ceci avec l’agent de terrain. Il saisit le code ou scanne le QR pour se connecter.', gen_qr: 'Génération du QR…', copy_code: 'Copier le code', copy_link: 'Copier le lien' },
  ar: { title: 'المستخدمون', sub: 'الأشخاص الذين يمكنهم تسجيل الدخول إلى منظمتك.', invite_email: '✉ دعوة بالبريد', add_user: '+ إضافة مستخدم', e_admin_only: 'يمكن لمسؤول المنظمة فقط إدارة المستخدمين.', e_load: 'تعذّر تحميل المستخدمين.', user_added: 'تمت إضافة المستخدم.', e_add: 'تعذّرت إضافة المستخدم.', user_updated: 'تم تحديث المستخدم.', e_upd: 'تعذّر تحديث المستخدم.', suspended_msg: 'تم تعليق المستخدم.', reactivated_msg: 'تمت إعادة تفعيل المستخدم.', e_status: 'تعذّر تغيير الحالة.', so_confirm_t: 'تسجيل خروج %name من كل الأجهزة؟', so_confirm_b: 'يتوقف أي هاتف أو متصفح مسجّل الدخول فوراً. استخدمها لجهاز مفقود أو مُصادَر.', sign_out: 'تسجيل الخروج', so_done: 'تم تسجيل الخروج من كل الأجهزة.', e_so: 'تعذّر تسجيل خروج المستخدم.', rc_confirm_t: 'إعادة تعيين رمز وصول %name؟', rc_confirm_b: 'يتوقف رمزه و QR الحاليان فوراً — ستحتاج لمشاركة الجديد.', reset_code: 'إعادة تعيين الرمز', e_rc: 'تعذّرت إعادة تعيين الرمز.', rm_confirm_t: 'إزالة %name؟', rm_confirm_b: 'يحذف حسابه وسجلّ تسجيلاته/استغاثاته. لا يمكن التراجع.', remove: 'إزالة', user_removed: 'تمت إزالة المستخدم.', e_rm: 'تعذّرت إزالة المستخدم.', inv_sent: 'تم إرسال الدعوة.', inv_stub: 'أُنشئت الدعوة — البريد غير مُعدّ، لم يُرسَل شيء.', inv_fail: 'أُنشئت الدعوة، لكن فشل إرسال البريد (تحقق من الإعداد).', e_inv: 'تعذّر إرسال الدعوة.', e_inv_net: 'تعذّر إرسال الدعوة. حاول مرة أخرى.', copied: 'تم النسخ.', retry: 'إعادة المحاولة', loading: 'جارٍ التحميل…', no_users: 'لا مستخدمين بعد — أضف واحداً.', search_users: 'ابحث بالاسم أو البريد أو الهاتف…', no_match: 'لا مستخدمين يطابقون بحثك.', you: 'أنت', suspended: 'معلّق', access_code: 'رمز الوصول:', show_qr: 'عرض QR / رابط', none: 'لا يوجد', gen_code: 'توليد رمز', edit: 'تعديل', suspend: 'تعليق', reactivate: 'إعادة تفعيل', signout_devices: 'تسجيل خروج الأجهزة', role_org_admin: 'مسؤول المنظمة', role_team_leader: 'قائد فريق', role_field_coordinator: 'منسّق ميداني', add_user_t: 'إضافة مستخدم', full_name: 'الاسم الكامل', email: 'البريد الإلكتروني', phone_opt: 'الهاتف (اختياري)', role: 'الدور', fc_note: 'يُولَّد رمز وصول فريد تلقائياً — ستحصل على رمز + QR للمشاركة بعد الإضافة.', password8: 'كلمة المرور (8 أحرف على الأقل)', adding: 'جارٍ الإضافة…', invite_t: 'دعوة بالبريد', invite_desc: 'سيحصلون على رابط لمرة واحدة لتعيين اسمهم وكلمة المرور/الرمز والانضمام لمنظمتك.', team_opt: 'الفريق (اختياري)', no_team: 'بلا فريق', sending: 'جارٍ الإرسال…', send_invite: 'إرسال الدعوة', edit_user_t: 'تعديل المستخدم', phone: 'الهاتف', status: 'الحالة', active: 'نشط', suspended_opt: 'معلّق', team: 'الفريق', keep_team: 'الإبقاء على الفريق الحالي', regen_label: 'إعادة توليد رمز الوصول (يتوقف القديم)', reset_pw: 'إعادة تعيين كلمة المرور (اختياري، 8 أحرف على الأقل)', saving: 'جارٍ الحفظ…', save: 'حفظ', access_code_title: 'رمز الوصول', share_desc: 'شاركه مع العامل الميداني. يكتب الرمز أو يمسح QR لتسجيل الدخول.', gen_qr: 'جارٍ إنشاء QR…', copy_code: 'نسخ الرمز', copy_link: 'نسخ رابط الدخول' },
} as const

const ROLES = [
  { value: 'org_admin', label: 'Org admin' },
  { value: 'team_leader', label: 'Team leader' },
  { value: 'field_coordinator', label: 'Field coordinator' },
]
const ROLE_LABEL: Record<string, string> = { org_admin: 'Org admin', team_leader: 'Team leader', field_coordinator: 'Field coordinator' }

interface User { id: string; full_name: string | null; email: string; phone: string | null; role: string; status: string; login_code: string | null; team_id: string | null }
type AddForm = { full_name: string; email: string; phone: string; role: string; password: string }
type EditForm = { id: string; full_name: string; phone: string; role: string; status: string; password: string; regenerate: boolean; team_id: string }

export default function NgoUsersPage() {
  const confirm = useConfirm()
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
  const [users, setUsers] = useState<User[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [add, setAdd] = useState<AddForm | null>(null)
  const [edit, setEdit] = useState<EditForm | null>(null)
  const [share, setShare] = useState<{ name: string; code: string } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ email: string; role: string; team_id: string } | null>(null)
  const [query, setQuery] = useState('')
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])

  const linkFor = (code: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/ngo/login?code=${code}`

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/ngo/users', { cache: 'no-store' })
      if (res.status === 403) { setError(t('e_admin_only')); return }
      if (!res.ok) { setError(t('e_load')); return }
      const data = await res.json()
      setUsers(data.users ?? []); setMe(data.me ?? null)
    } catch { setError(t('e_load')) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Render a QR for the share modal locally (no network — code never leaves the app).
  useEffect(() => {
    setQr(null)
    if (!share) return
    let cancelled = false
    import('qrcode').then((QR) => QR.toDataURL(linkFor(share.code), { width: 220, margin: 1 }))
      .then((url) => { if (!cancelled) setQr(url) }).catch(() => {})
    return () => { cancelled = true }
  }, [share])

  async function createUser() {
    if (!add) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(add) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setAdd(null); await load(); if (data.login_code) setShare({ name: add.full_name, code: data.login_code }); else setMsg(t('user_added')) }
      else setError(data.error ?? t('e_add'))
    } finally { setBusy(false) }
  }

  async function saveEdit() {
    if (!edit) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const payload: Record<string, unknown> = { full_name: edit.full_name, phone: edit.phone, role: edit.role, status: edit.status }
      if (edit.password) payload.password = edit.password
      if (edit.regenerate) payload.regenerate_code = true
      if (edit.team_id) payload.team_id = edit.team_id // '' = leave team unchanged; server no-ops if already on it
      const res = await fetch(`/api/ngo/users/${edit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { const name = edit.full_name; setEdit(null); await load(); if (data.login_code) setShare({ name, code: data.login_code }); else setMsg(t('user_updated')) }
      else setError(data.error ?? t('e_upd'))
    } finally { setBusy(false) }
  }

  async function toggleStatus(u: User) {
    const next = u.status === 'active' ? 'suspended' : 'active'
    setMsg(null); setError(null)
    const res = await fetch(`/api/ngo/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setMsg(next === 'suspended' ? t('suspended_msg') : t('reactivated_msg')); await load() }
    else setError(data.error ?? t('e_status'))
  }

  async function signOutDevices(u: User) {
    if (!(await confirm({ title: t('so_confirm_t').replace('%name', u.full_name || u.email), body: t('so_confirm_b'), danger: true, confirmLabel: t('sign_out') }))) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch(`/api/ngo/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revoke_sessions: true }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMsg(t('so_done'))
      else setError(data.error ?? t('e_so'))
    } catch { setError(t('e_so')) }
    finally { setBusy(false) }
  }

  async function resetCode(u: User) {
    if (!(await confirm({ title: t('rc_confirm_t').replace('%name', u.full_name || u.email), body: t('rc_confirm_b'), danger: true, confirmLabel: t('reset_code') }))) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch(`/api/ngo/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regenerate_code: true }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.login_code) { await load(); setShare({ name: u.full_name ?? 'Worker', code: data.login_code }) }
      else setError(data.error ?? t('e_rc'))
    } finally { setBusy(false) }
  }

  async function removeUser(u: User) {
    if (!(await confirm({ title: t('rm_confirm_t').replace('%name', u.full_name || u.email), body: t('rm_confirm_b'), danger: true, confirmLabel: t('remove') }))) return
    setMsg(null); setError(null)
    const res = await fetch(`/api/ngo/users/${u.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setMsg(t('user_removed')); await load() }
    else setError(data.error ?? t('e_rm'))
  }

  // Load teams for the invite modal's optional picker AND the edit modal's team selector.
  useEffect(() => {
    if (!invite && !edit) return
    fetch('/api/ngo/teams', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { teams: [] }))
      .then((d) => setTeams(d.teams ?? [])).catch(() => {})
    // Depend on open-state only (not the form objects) so typing doesn't refetch each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!invite, edit?.id])

  async function sendInvite() {
    if (!invite) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/users/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invite.email.trim(), role: invite.role, team_id: invite.team_id || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setInvite(null)
        setMsg(data.email_status === 'sent' ? t('inv_sent')
          : data.email_status === 'stubbed' ? t('inv_stub')
          : t('inv_fail'))
      } else setError(data.error ?? t('e_inv'))
    } catch { setError(t('e_inv_net')) }
    finally { setBusy(false) }
  }

  function copy(text: string) { navigator.clipboard?.writeText(text).then(() => setMsg(t('copied'))).catch(() => {}) }

  return (
    <div style={wrap} dir={isRtl ? 'rtl' : 'ltr'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
          <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>{t('sub')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { setInvite({ email: '', role: 'team_leader', team_id: '' }); setError(null); setMsg(null) }} style={ghostBtn}>{t('invite_email')}</button>
          <button type="button" onClick={() => setAdd({ full_name: '', email: '', phone: '', role: 'team_leader', password: '' })} style={primaryBtn}>{t('add_user')}</button>
        </div>
      </div>

      {msg && <div style={okBox}>{msg}</div>}
      {error && <div style={errorBox}>{error} <button type="button" onClick={load} style={retryBtn}>{t('retry')}</button></div>}
      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>{t('loading')}</div>}
      {!loading && users.length === 0 && !error && <div style={{ color: '#484f58', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>{t('no_users')}</div>}

      {users.length > 5 && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search_users')} style={{ ...field, marginBottom: 12 }} />
      )}
      {(() => {
        const q = query.trim().toLowerCase()
        const shown = q ? users.filter((u) => `${u.full_name ?? ''} ${u.email} ${u.phone ?? ''} ${t(`role_${u.role}`)}`.toLowerCase().includes(q)) : users
        return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q && shown.length === 0 && <div style={{ color: '#484f58', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>{t('no_match')}</div>}
        {shown.map((u) => (
          <div key={u.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {u.full_name || '—'}{u.id === me && <span style={{ fontSize: 11, color: '#58a6ff', marginInlineStart: 8 }}>{t('you')}</span>}
                  {u.status === 'suspended' && <span style={{ fontSize: 11, color: '#f85149', marginInlineStart: 8 }}>{t('suspended')}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                  {t(`role_${u.role}`)} · {u.email}{u.phone ? ` · ${u.phone}` : ''}
                </div>
                {u.role === 'field_coordinator' && (
                  <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6 }}>
                    {t('access_code')} {u.login_code
                      ? <><code style={codeChip}>{u.login_code}</code> <button type="button" onClick={() => setShare({ name: u.full_name ?? 'Worker', code: u.login_code! })} style={linkBtn}>{t('show_qr')}</button> <button type="button" onClick={() => resetCode(u)} disabled={busy} style={linkBtn}>{t('reset_code')}</button></>
                      : <><span style={{ color: '#d29922' }}>{t('none')}</span> <button type="button" onClick={() => resetCode(u)} disabled={busy} style={linkBtn}>{t('gen_code')}</button></>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={() => setEdit({ id: u.id, full_name: u.full_name ?? '', phone: u.phone ?? '', role: u.role, status: u.status, password: '', regenerate: false, team_id: u.team_id ?? '' })} style={miniBtn}>{t('edit')}</button>
                <button type="button" onClick={() => toggleStatus(u)} style={miniBtn}>{u.status === 'active' ? t('suspend') : t('reactivate')}</button>
                <button type="button" onClick={() => signOutDevices(u)} style={miniBtn}>{t('signout_devices')}</button>
                <button type="button" onClick={() => removeUser(u)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>{t('remove')}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
        )
      })()}

      {add && (
        <Modal title={t('add_user_t')} onClose={() => setAdd(null)}>
          <L label={t('full_name')}><input style={field} value={add.full_name} onChange={(e) => setAdd({ ...add, full_name: e.target.value })} /></L>
          <L label={t('email')}><input style={field} type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></L>
          <L label={t('phone_opt')}><input style={field} value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} /></L>
          <L label={t('role')}>
            <select style={field} value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{t(`role_${r.value}`)}</option>)}
            </select>
          </L>
          {add.role === 'field_coordinator'
            ? <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>{t('fc_note')}</div>
            : <L label={t('password8')}><input style={field} type="password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} /></L>}
          <button type="button" onClick={createUser} disabled={busy} style={{ ...primaryBtn, marginTop: 4, opacity: busy ? 0.6 : 1 }}>{busy ? t('adding') : t('add_user_t')}</button>
        </Modal>
      )}

      {invite && (
        <Modal title={t('invite_t')} onClose={() => setInvite(null)}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{t('invite_desc')}</div>
          <L label={t('email')}><input style={field} type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></L>
          <L label={t('role')}>
            <select style={field} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{t(`role_${r.value}`)}</option>)}
            </select>
          </L>
          <L label={t('team_opt')}>
            <select style={field} value={invite.team_id} onChange={(e) => setInvite({ ...invite, team_id: e.target.value })}>
              <option value="">{t('no_team')}</option>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
          </L>
          <button type="button" onClick={sendInvite} disabled={busy || !invite.email.includes('@')} style={{ ...primaryBtn, marginTop: 4, opacity: busy || !invite.email.includes('@') ? 0.6 : 1 }}>{busy ? t('sending') : t('send_invite')}</button>
        </Modal>
      )}

      {edit && (
        <Modal title={t('edit_user_t')} onClose={() => setEdit(null)}>
          <L label={t('full_name')}><input style={field} value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></L>
          <L label={t('phone')}><input style={field} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></L>
          <L label={t('role')}>
            <select style={field} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{t(`role_${r.value}`)}</option>)}
            </select>
          </L>
          <L label={t('status')}>
            <select style={field} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              <option value="active">{t('active')}</option>
              <option value="suspended">{t('suspended_opt')}</option>
            </select>
          </L>
          <L label={t('team')}>
            <select style={field} value={edit.team_id} onChange={(e) => setEdit({ ...edit, team_id: e.target.value })}>
              <option value="">{edit.team_id ? t('keep_team') : t('no_team')}</option>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
          </L>
          {edit.role === 'field_coordinator'
            ? <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e6edf3', marginBottom: 10 }}>
                <input type="checkbox" checked={edit.regenerate} onChange={(e) => setEdit({ ...edit, regenerate: e.target.checked })} />
                {t('regen_label')}
              </label>
            : <L label={t('reset_pw')}><input style={field} type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></L>}
          <button type="button" onClick={saveEdit} disabled={busy} style={{ ...primaryBtn, marginTop: 4, opacity: busy ? 0.6 : 1 }}>{busy ? t('saving') : t('save')}</button>
        </Modal>
      )}

      {share && (
        <Modal title={`${t('access_code_title')} — ${share.name}`} onClose={() => setShare(null)}>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>{t('share_desc')}</div>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <code style={{ ...codeChip, fontSize: 22, padding: '8px 14px', letterSpacing: '0.15em' }}>{share.code}</code>
          </div>
          {qr
            ? <div style={{ textAlign: 'center', marginBottom: 12 }}><img src={qr} alt="login QR" width={200} height={200} style={{ borderRadius: 8 }} /></div>
            : <div style={{ textAlign: 'center', color: '#8b949e', fontSize: 12, marginBottom: 12 }}>{t('gen_qr')}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => copy(share.code)} style={{ ...miniBtn, flex: 1 }}>{t('copy_code')}</button>
            <button type="button" onClick={() => copy(linkFor(share.code))} style={{ ...miniBtn, flex: 1 }}>{t('copy_link')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={labelStyle}>{label}</label>{children}</div>
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={modal}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 760, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14 }
const field: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const primaryBtn: React.CSSProperties = { height: 38, padding: '0 16px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const ghostBtn: React.CSSProperties = { height: 38, padding: '0 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#c9d1d9', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const miniBtn: React.CSSProperties = { height: 30, padding: '0 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'system-ui' }
const codeChip: React.CSSProperties = { background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '2px 8px', color: '#e6edf3', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }
const modal: React.CSSProperties = { width: 360, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const okBox: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'none', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 4, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }
