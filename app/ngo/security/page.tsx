'use client'

import { useEffect, useState, useCallback } from 'react'
import { useConfirm, SkeletonRows } from '@/lib/ngo-ui'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'

const LANG = {
  en: { title: 'Security', subtitle_pre: 'Two-factor authentication (authenticator app).', recommended: 'Recommended', subtitle_post: '— it protects your account even if your password is stolen.', loading: 'Loading…', e_load: 'Could not load 2FA status.', e_action: 'Action failed. Please try again.', save_codes: 'Save your recovery codes', codes_desc: 'Each works once if you lose your authenticator. Store them safely — they won’t be shown again.', copy_codes: 'Copy codes', copied: '✓ Copied', download: 'Download .txt', on_title: '✓ 2FA is on', remaining: 'recovery codes remaining', remaining_1: 'recovery code remaining', enter_disable: 'Enter a current code to disable', ph_code: '6-digit or recovery code', disable: 'Disable 2FA', off_pre: '2FA is', off: 'off', setup: 'Set up 2FA', scan: 'Scan with your authenticator', gen_qr: 'Generating QR…', manual: 'Or enter this key manually:', enter_confirm: 'Enter the 6-digit code to confirm', verify: 'Verify & enable', need_app: 'Need an authenticator app? Get Google Authenticator —', iphone: 'iPhone', android: 'Android', also_work: '(Authy or Microsoft Authenticator also work).', enabled_msg: 'Two-factor authentication is on.', disabled_msg: 'Two-factor authentication disabled.', confirm_disable_title: 'Disable two-factor authentication?', confirm_disable: 'Disable' },
  fr: { title: 'Sécurité', subtitle_pre: 'Authentification à deux facteurs (application d’authentification).', recommended: 'Recommandé', subtitle_post: '— elle protège votre compte même si votre mot de passe est volé.', loading: 'Chargement…', e_load: 'Impossible de charger l’état 2FA.', e_action: 'Échec de l’action. Réessayez.', save_codes: 'Enregistrez vos codes de secours', codes_desc: 'Chacun fonctionne une fois si vous perdez votre authentificateur. Conservez-les en lieu sûr — ils ne seront plus affichés.', copy_codes: 'Copier les codes', copied: '✓ Copié', download: 'Télécharger .txt', on_title: '✓ 2FA activée', remaining: 'codes de secours restants', remaining_1: 'code de secours restant', enter_disable: 'Saisissez un code actuel pour désactiver', ph_code: 'Code à 6 chiffres ou de secours', disable: 'Désactiver la 2FA', off_pre: 'La 2FA est', off: 'désactivée', setup: 'Configurer la 2FA', scan: 'Scannez avec votre authentificateur', gen_qr: 'Génération du QR…', manual: 'Ou saisissez cette clé manuellement :', enter_confirm: 'Saisissez le code à 6 chiffres pour confirmer', verify: 'Vérifier et activer', need_app: 'Besoin d’une application d’authentification ? Installez Google Authenticator —', iphone: 'iPhone', android: 'Android', also_work: '(Authy ou Microsoft Authenticator fonctionnent aussi).', enabled_msg: 'Authentification à deux facteurs activée.', disabled_msg: 'Authentification à deux facteurs désactivée.', confirm_disable_title: 'Désactiver l’authentification à deux facteurs ?', confirm_disable: 'Désactiver' },
  ar: { title: 'الأمان', subtitle_pre: 'المصادقة الثنائية (تطبيق مصادقة).', recommended: 'موصى به', subtitle_post: '— تحمي حسابك حتى لو سُرقت كلمة المرور.', loading: 'جارٍ التحميل…', e_load: 'تعذّر تحميل حالة المصادقة الثنائية.', e_action: 'فشل الإجراء. حاول مرة أخرى.', save_codes: 'احفظ رموز الاسترداد', codes_desc: 'يعمل كل رمز مرة واحدة إذا فقدت تطبيق المصادقة. احفظها بأمان — لن تُعرض مرة أخرى.', copy_codes: 'نسخ الرموز', copied: '✓ تم النسخ', download: 'تنزيل .txt', on_title: '✓ المصادقة الثنائية مفعّلة', remaining: 'رموز استرداد متبقية', remaining_1: 'رمز استرداد متبقٍ', enter_disable: 'أدخل رمزاً حالياً للتعطيل', ph_code: 'رمز من 6 أرقام أو رمز استرداد', disable: 'تعطيل المصادقة الثنائية', off_pre: 'المصادقة الثنائية', off: 'معطّلة', setup: 'إعداد المصادقة الثنائية', scan: 'امسح عبر تطبيق المصادقة', gen_qr: 'جارٍ إنشاء رمز QR…', manual: 'أو أدخل هذا المفتاح يدوياً:', enter_confirm: 'أدخل الرمز المكوّن من 6 أرقام للتأكيد', verify: 'تحقّق وفعّل', need_app: 'تحتاج تطبيق مصادقة؟ ثبّت Google Authenticator —', iphone: 'آيفون', android: 'أندرويد', also_work: '(يعمل أيضاً Authy أو Microsoft Authenticator).', enabled_msg: 'تم تفعيل المصادقة الثنائية.', disabled_msg: 'تم تعطيل المصادقة الثنائية.', confirm_disable_title: 'تعطيل المصادقة الثنائية؟', confirm_disable: 'تعطيل' },
} as const

// Per-user 2FA (TOTP) enrolment for org_admin / team_leader. Optional but recommended.
// Setup → scan QR → verify a code → enabled, with one-time recovery codes shown once.

export default function NgoSecurityPage() {
  const confirm = useConfirm()
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [recoveryRemaining, setRecoveryRemaining] = useState(0)
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/2fa', { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setEnabled(!!d.enabled); setRecoveryRemaining(d.recovery_remaining ?? 0) }
      else setError(t('e_load'))
    } catch { setError(t('e_load')) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    setQr(null)
    if (!setup?.uri) return
    let off = false
    import('qrcode').then((QR) => QR.toDataURL(setup.uri, { width: 220, margin: 1 }))
      .then((u) => { if (!off) setQr(u) }).catch(() => {})
    return () => { off = true }
  }, [setup])

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await fetch('/api/ngo/2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? t('e_action')); return null }
      return d
    } catch { setError(t('e_action')); return null }
    finally { setBusy(false) }
  }

  // Recovery codes are shown once. Let the user keep a copy by clipboard or a .txt download.
  const codesText = useCallback(
    () => `NOUR for NGOs — two-factor recovery codes\nEach code works once. Keep them somewhere safe and private.\n\n${(recoveryCodes ?? []).join('\n')}\n`,
    [recoveryCodes],
  )
  const copyCodes = useCallback(async () => {
    const text = (recoveryCodes ?? []).join('\n')
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const ta = document.createElement('textarea')
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      }
      setCopied(true); window.setTimeout(() => setCopied(false), 2000)
    } catch { setError('Could not copy. Select the codes and copy them manually.') }
  }, [recoveryCodes])
  const downloadCodes = useCallback(() => {
    try {
      const blob = new Blob([codesText()], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'nour-recovery-codes.txt'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { setError('Could not download. Copy the codes instead.') }
  }, [codesText])

  const startSetup = async () => { const d = await act('setup'); if (d) { setSetup({ secret: d.secret, uri: d.uri }); setRecoveryCodes(null) } }
  const enable = async () => { const d = await act('enable', { code: code.trim() }); if (d) { setRecoveryCodes(d.recovery_codes ?? []); setSetup(null); setCode(''); setMsg(t('enabled_msg')); load() } }
  const disable = async () => { if (!(await confirm({ title: t('confirm_disable_title'), danger: true, confirmLabel: t('confirm_disable') }))) return; const d = await act('disable', { code: code.trim() }); if (d) { setCode(''); setMsg(t('disabled_msg')); load() } }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24, color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }} dir={isRtl ? 'rtl' : 'ltr'}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>{t('title')}</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 20px' }}>{t('subtitle_pre')} <b style={{ color: '#d29922' }}>{t('recommended')}</b> {t('subtitle_post')}</p>

      {msg && <div style={ok}>{msg}</div>}
      {error && <div style={err}>{error}</div>}
      {enabled === null && <SkeletonRows rows={2} height={72} />}

      {recoveryCodes && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#3fb950' }}>{t('save_codes')}</div>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{t('codes_desc')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontFamily: 'monospace', fontSize: 14 }}>
            {recoveryCodes.map((c) => <div key={c} style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>{c}</div>)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={copyCodes} style={neutralBtn}>{copied ? t('copied') : t('copy_codes')}</button>
            <button type="button" onClick={downloadCodes} style={neutralBtn}>{t('download')}</button>
          </div>
        </div>
      )}

      {enabled === true && !recoveryCodes && (
        <div style={card}>
          <div style={{ fontWeight: 600, color: '#3fb950', marginBottom: 6 }}>{t('on_title')}</div>
          <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 14 }}>{recoveryRemaining} {recoveryRemaining === 1 ? t('remaining_1') : t('remaining')}.</div>
          <label style={lbl}>{t('enter_disable')}</label>
          <input style={field} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder={t('ph_code')} />
          <button type="button" onClick={disable} disabled={busy} style={{ ...dangerBtn, marginTop: 12 }}>{busy ? '…' : t('disable')}</button>
        </div>
      )}

      {enabled === false && !setup && (
        <div style={card}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>{t('off_pre')} <b style={{ color: '#d29922' }}>{t('off')}</b>.</div>
          <button type="button" onClick={startSetup} disabled={busy} style={primaryBtn}>{busy ? '…' : t('setup')}</button>
          <AuthApps t={t} />
        </div>
      )}

      {setup && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{t('scan')}</div>
          {qr ? <img src={qr} alt="2FA QR code" width={200} height={200} style={{ background: '#fff', borderRadius: 8, padding: 6 }} /> : <div style={{ color: '#8b949e', fontSize: 13 }}>{t('gen_qr')}</div>}
          <AuthApps t={t} />
          <div style={{ fontSize: 12, color: '#8b949e', margin: '12px 0 4px' }}>{t('manual')}</div>
          <code style={{ display: 'block', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '8px 10px', fontSize: 13, wordBreak: 'break-all' }}>{setup.secret}</code>
          <label style={{ ...lbl, marginTop: 14 }}>{t('enter_confirm')}</label>
          <input style={field} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" />
          <button type="button" onClick={enable} disabled={busy || code.trim().length < 6} style={{ ...primaryBtn, marginTop: 12, opacity: busy || code.trim().length < 6 ? 0.6 : 1 }}>{busy ? '…' : t('verify')}</button>
        </div>
      )}
    </div>
  )
}

// Download prompt for users who don't have an authenticator app yet.
function AuthApps({ t }: { t: (k: string) => string }) {
  return (
    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 12 }}>
      {t('need_app')}{' '}
      <a href="https://apps.apple.com/app/google-authenticator/id388497605" target="_blank" rel="noreferrer noopener" style={{ color: '#58a6ff', textDecoration: 'none' }}>{t('iphone')}</a>
      {' · '}
      <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noreferrer noopener" style={{ color: '#58a6ff', textDecoration: 'none' }}>{t('android')}</a>
      <span style={{ color: '#484f58' }}> {t('also_work')}</span>
    </div>
  )
}

const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 18, marginBottom: 16 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6 }
const field: React.CSSProperties = { width: '100%', maxWidth: 260, height: 44, padding: '0 12px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 16, fontFamily: 'system-ui', outline: 'none', letterSpacing: '0.1em' }
const primaryBtn: React.CSSProperties = { height: 42, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const dangerBtn: React.CSSProperties = { height: 40, padding: '0 16px', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const neutralBtn: React.CSSProperties = { height: 38, padding: '0 14px', background: '#21262d', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const ok: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const err: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
