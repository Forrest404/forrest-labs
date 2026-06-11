import 'server-only'
import { createHash } from 'crypto'
import { fetchWithTimeout } from '@/lib/fetch-timeout'

// Single server-side transactional-email module. All app email goes through here so the
// provider can be swapped in one place. Provider = Resend (REST). Mirrors the stub
// pattern of lib/ngo-notify.ts: when unconfigured it returns { stubbed: true } so callers
// can surface a clear "email not configured" state instead of failing silently.
//
// SECURITY: RESEND_API_KEY + EMAIL_FROM are server-only secrets (never NEXT_PUBLIC). We
// NEVER log the token, the raw recipient, or the body — only a sha256 of the address +
// the kind + status, written to ngo_email_log. Email bodies carry minimal PII and NEVER
// any location or operational detail.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.noursystems.org'

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
}

function hashRecipient(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

export interface SendResult { ok: boolean; stubbed: boolean; error?: string }

// Low-level send. Returns stubbed:true when no provider is configured (dev / DNS not yet
// set up); ok:false + error when the provider rejects (e.g. domain not verified) so the
// UI can say "couldn't send — email not verified yet".
export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!key || !from) {
    console.log('[email-stub] not configured — send skipped (recipient + body withheld)')
    return { ok: false, stubbed: true }
  }
  try {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text }),
    })
    if (!res.ok) {
      // Most common cause pre-DNS: domain not verified (403/422). Don't echo the body.
      let detail = ''
      try { detail = ((await res.json()) as any)?.message ?? '' } catch { /* ignore */ }
      console.error(`[email] provider rejected (status ${res.status})`)
      return { ok: false, stubbed: false, error: detail || `provider returned ${res.status}` }
    }
    return { ok: true, stubbed: false }
  } catch (err) {
    console.error('[email] send failed (network)')
    return { ok: false, stubbed: false, error: 'network error reaching email provider' }
  }
}

// Best-effort send log (no token, no body, hashed recipient). Never throws.
export async function logEmail(supabase: any, kind: string, to: string, orgId: string | null, result: SendResult): Promise<void> {
  const status = result.ok ? 'sent' : result.stubbed ? 'stubbed' : 'failed'
  try {
    await supabase.from('ngo_email_log').insert({ kind, recipient_hash: hashRecipient(to), org_id: orgId, status })
  } catch { /* logging must never block the request */ }
}

// Durable rate-limit: how many of this kind went to this recipient in the window.
// Returns true if a new send is ALLOWED (under the cap).
export async function emailRateOk(supabase: any, kind: string, to: string, max: number, windowMinutes: number): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60000).toISOString()
    const { count } = await supabase
      .from('ngo_email_log')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_hash', hashRecipient(to))
      .eq('kind', kind)
      .gte('created_at', since)
    return (count ?? 0) < max
  } catch {
    return true // never block a legitimate send on a rate-check failure
  }
}

// ── Minimal-PII templates ─────────────────────────────────────────────────────
// Plain, low-bandwidth HTML + a text fallback. No location / operational detail, ever.
function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;color:#111;line-height:1.6;max-width:520px;margin:0 auto;padding:24px">`
    + `<h2 style="font-size:18px;margin:0 0 12px">${title}</h2>${bodyHtml}`
    + `<p style="color:#888;font-size:12px;margin-top:28px">NOUR — civilian & aid-worker safety. If you didn’t expect this email, you can ignore it.</p></body></html>`
}

export function approvalEmail(orgName: string): { subject: string; html: string; text: string } {
  const link = `${APP_URL}/ngo/login`
  return {
    subject: 'Your NOUR organisation has been approved',
    html: shell('You’re approved', `<p>“${orgName}” has been approved on NOUR. You can now sign in and set up your teams.</p><p><a href="${link}">Sign in to NOUR →</a></p>`),
    text: `"${orgName}" has been approved on NOUR. Sign in: ${link}`,
  }
}

export function rejectionEmail(orgName: string, reason: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Your NOUR organisation application',
    html: shell('Application not approved', `<p>Your application for “${orgName}” was not approved at this time.</p><p><b>Reason:</b> ${escapeHtml(reason)}</p><p>You can address this and apply again.</p>`),
    text: `Your application for "${orgName}" was not approved. Reason: ${reason}`,
  }
}

export function inviteEmail(orgName: string, token: string): { subject: string; html: string; text: string } {
  const link = `${APP_URL}/ngo/invite?token=${token}`
  return {
    subject: `You’ve been invited to ${orgName} on NOUR`,
    html: shell('Set up your account', `<p>You’ve been invited to join “${orgName}” on NOUR. Use the link below to set your own password and join. The link is single-use and expires soon.</p><p><a href="${link}">Accept invite →</a></p>`),
    text: `You’ve been invited to join "${orgName}" on NOUR. Set up your account (single-use, expiring link): ${link}`,
  }
}

export function resetEmail(token: string): { subject: string; html: string; text: string } {
  const link = `${APP_URL}/ngo/reset?token=${token}`
  return {
    subject: 'Reset your NOUR password',
    html: shell('Reset your password', `<p>We received a request to reset your NOUR password. Use the link below to choose a new one. It’s single-use and expires soon. If you didn’t request this, ignore this email.</p><p><a href="${link}">Reset password →</a></p>`),
    text: `Reset your NOUR password (single-use, expiring link): ${link}`,
  }
}

export function securityNoticeEmail(action: 'enabled' | 'reset'): { subject: string; html: string; text: string } {
  const what = action === 'enabled' ? 'enabled' : 'reset'
  return {
    subject: `Two-factor authentication ${what} on your NOUR account`,
    html: shell(`Two-factor ${what}`, `<p>Two-factor authentication was ${what} on your NOUR account. If this wasn’t you, contact your organisation admin immediately.</p>`),
    text: `Two-factor authentication was ${what} on your NOUR account. If this wasn’t you, contact your org admin.`,
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}
