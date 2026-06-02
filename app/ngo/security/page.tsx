'use client'

import { useEffect, useState, useCallback } from 'react'

// Per-user 2FA (TOTP) enrolment for org_admin / team_leader. Optional but recommended.
// Setup → scan QR → verify a code → enabled, with one-time recovery codes shown once.

export default function NgoSecurityPage() {
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
      else setError('Could not load 2FA status.')
    } catch { setError('Could not load 2FA status.') }
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
      if (!r.ok) { setError(d.error ?? 'Action failed.'); return null }
      return d
    } catch { setError('Action failed. Please try again.'); return null }
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
  const enable = async () => { const d = await act('enable', { code: code.trim() }); if (d) { setRecoveryCodes(d.recovery_codes ?? []); setSetup(null); setCode(''); setMsg('Two-factor authentication is on.'); load() } }
  const disable = async () => { if (!window.confirm('Disable two-factor authentication on your account?')) return; const d = await act('disable', { code: code.trim() }); if (d) { setCode(''); setMsg('Two-factor authentication disabled.'); load() } }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24, color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Security</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 20px' }}>Two-factor authentication (authenticator app). <b style={{ color: '#d29922' }}>Recommended</b> — it protects your account even if your password is stolen.</p>

      {msg && <div style={ok}>{msg}</div>}
      {error && <div style={err}>{error}</div>}
      {enabled === null && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}

      {recoveryCodes && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#3fb950' }}>Save your recovery codes</div>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>Each works once if you lose your authenticator. Store them safely — they won’t be shown again.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontFamily: 'monospace', fontSize: 14 }}>
            {recoveryCodes.map((c) => <div key={c} style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>{c}</div>)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={copyCodes} style={neutralBtn}>{copied ? '✓ Copied' : 'Copy codes'}</button>
            <button type="button" onClick={downloadCodes} style={neutralBtn}>Download .txt</button>
          </div>
        </div>
      )}

      {enabled === true && !recoveryCodes && (
        <div style={card}>
          <div style={{ fontWeight: 600, color: '#3fb950', marginBottom: 6 }}>✓ 2FA is on</div>
          <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 14 }}>{recoveryRemaining} recovery code{recoveryRemaining === 1 ? '' : 's'} remaining.</div>
          <label style={lbl}>Enter a current code to disable</label>
          <input style={field} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="6-digit or recovery code" />
          <button type="button" onClick={disable} disabled={busy} style={{ ...dangerBtn, marginTop: 12 }}>{busy ? '…' : 'Disable 2FA'}</button>
        </div>
      )}

      {enabled === false && !setup && (
        <div style={card}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>2FA is <b style={{ color: '#d29922' }}>off</b>.</div>
          <button type="button" onClick={startSetup} disabled={busy} style={primaryBtn}>{busy ? '…' : 'Set up 2FA'}</button>
          <AuthApps />
        </div>
      )}

      {setup && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Scan with your authenticator</div>
          {qr ? <img src={qr} alt="2FA QR code" width={200} height={200} style={{ background: '#fff', borderRadius: 8, padding: 6 }} /> : <div style={{ color: '#8b949e', fontSize: 13 }}>Generating QR…</div>}
          <AuthApps />
          <div style={{ fontSize: 12, color: '#8b949e', margin: '12px 0 4px' }}>Or enter this key manually:</div>
          <code style={{ display: 'block', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '8px 10px', fontSize: 13, wordBreak: 'break-all' }}>{setup.secret}</code>
          <label style={{ ...lbl, marginTop: 14 }}>Enter the 6-digit code to confirm</label>
          <input style={field} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" />
          <button type="button" onClick={enable} disabled={busy || code.trim().length < 6} style={{ ...primaryBtn, marginTop: 12, opacity: busy || code.trim().length < 6 ? 0.6 : 1 }}>{busy ? '…' : 'Verify & enable'}</button>
        </div>
      )}
    </div>
  )
}

// Download prompt for users who don't have an authenticator app yet.
function AuthApps() {
  return (
    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 12 }}>
      Need an authenticator app? Get Google Authenticator —{' '}
      <a href="https://apps.apple.com/app/google-authenticator/id388497605" target="_blank" rel="noreferrer noopener" style={{ color: '#58a6ff', textDecoration: 'none' }}>iPhone</a>
      {' · '}
      <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noreferrer noopener" style={{ color: '#58a6ff', textDecoration: 'none' }}>Android</a>
      <span style={{ color: '#484f58' }}> (Authy or Microsoft Authenticator also work).</span>
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
