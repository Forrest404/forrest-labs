import 'server-only'
import { randomBytes } from 'crypto'
import { sendEmail } from '@/lib/email'

// Notification fan-out for NGO safety events. Two channels:
//  - push  → ntfy.sh (reuses the codebase's existing broadcast-channel pattern)
//  - sms   → a stub today (no provider wired); structured so a real provider
//            (Twilio, an SMS gateway URL, …) drops in by reading env + POSTing.
// CLAUDE.md requires every safety alert to work over SMS as well as push, so the
// call sites always attempt both — the SMS path simply logs until a provider exists.
//
// SECURITY (finding C1): ntfy.sh topics are unauthenticated and world-readable to
// anyone who knows the topic name. Aid-worker names + precise coordinates must NEVER
// be placed on this relay. Two defences, both enforced here:
//   1. Per-org topics — each org gets its OWN high-entropy topic (resolveOrgTopic),
//      so one org's alerts never reach another org and the topic is unguessable.
//   2. Sanitised bodies — call sites send only a generic "something happened, open
//      NOUR" notice; identities, coordinates and map links stay behind the
//      authenticated dashboard. scrubSensitive() is a last-resort backstop that
//      strips coordinate-like tokens even if a call site regresses.
// The legacy global NTFY_CHANNEL is used only as a pre-migration fallback.

type Priority = 'low' | 'default' | 'high' | 'urgent'

// Single source of truth for the ntfy relay base. Defaults to the public ntfy.sh, so
// behaviour is unchanged when NTFY_BASE_URL is unset; setting it (e.g. a self-hosted
// server with auth) is then a one-var change. Trailing slashes trimmed so `${base}/${topic}`
// is always well-formed.
const NTFY_BASE_URL = (process.env.NTFY_BASE_URL ?? 'https://ntfy.sh').replace(/\/+$/, '')

// Strip decimal coordinate pairs / lone high-precision decimals (lat,lon) and bare
// map links as a defence-in-depth backstop. Bodies should already be generic; this
// guarantees nothing coordinate-shaped reaches the relay if a call site regresses.
function scrubSensitive(text: string): string {
  return text
    .replace(/https?:\/\/\S*maps?\S*/gi, '[map in app]')      // google/other map links
    .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[location in app]') // "lat, lon"
    .replace(/-?\d{1,3}\.\d{4,}/g, '[location in app]')        // lone ~11m-precision decimal
}

// Resolve a per-org ntfy topic. Reads ngo_organisations.ntfy_topic; generates and
// persists a high-entropy one on first use. Falls back to the legacy NTFY_CHANNEL only
// when the column is missing (pre-migration) or the DB is unreachable — never silently
// drops an alert.
async function resolveOrgTopic(supabase: any, orgId: string): Promise<string | null> {
  const fallback = process.env.NTFY_CHANNEL ?? null
  try {
    const { data, error } = await supabase
      .from('ngo_organisations').select('ntfy_topic').eq('id', orgId).maybeSingle()
    if (error) return fallback // column absent (pre-migration) or transient — fall back
    if (data?.ntfy_topic) return data.ntfy_topic as string
    const topic = `nour-${randomBytes(24).toString('base64url')}` // ~192 bits, URL-safe
    const { error: upErr } = await supabase
      .from('ngo_organisations').update({ ntfy_topic: topic }).eq('id', orgId)
    if (upErr) return fallback
    return topic
  } catch {
    return fallback
  }
}

// Public accessor for the per-org push topic + relay base. Used by the topic/test API
// routes so EVERY role (field coordinators included) can look up the topic to subscribe.
// Like the internal resolver, this may persist a freshly generated topic on first call —
// idempotent, and already happens on the first alert.
export async function getOrgPushTopic(
  supabase: any,
  orgId: string,
): Promise<{ topic: string | null; baseUrl: string }> {
  const topic = await resolveOrgTopic(supabase, orgId)
  return { topic, baseUrl: NTFY_BASE_URL }
}

export async function sendPush(topic: string | null, opts: {
  title: string
  body: string
  priority?: Priority
  tags?: string
}): Promise<{ ok: boolean; stubbed: boolean }> {
  const channel = topic ?? process.env.NTFY_CHANNEL
  if (!channel) {
    console.log('[push-stub] no channel configured →', scrubSensitive(opts.title))
    return { ok: false, stubbed: true }
  }
  try {
    const res = await fetch(`${NTFY_BASE_URL}/${channel}`, {
      method: 'POST',
      headers: {
        Title: scrubSensitive(opts.title),
        Priority: opts.priority ?? 'default',
        Tags: opts.tags ?? 'bell',
        'Content-Type': 'text/plain',
      },
      body: scrubSensitive(opts.body),
    })
    return { ok: res.ok, stubbed: false }
  } catch (err) {
    console.error('[push] ntfy failed')
    return { ok: false, stubbed: false }
  }
}

export async function sendSms(phone: string, body: string): Promise<{ ok: boolean; stubbed: boolean }> {
  // Drop-in point: when an SMS provider is configured, POST to it here. Body is
  // sanitised by callers; we also do not log it (it could otherwise leak to server logs).
  const provider = process.env.SMS_PROVIDER_URL
  if (!provider) {
    console.log('[sms-stub] message queued (body withheld from logs)')
    return { ok: true, stubbed: true }
  }
  try {
    await fetch(provider, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, message: body }),
    })
    return { ok: true, stubbed: false }
  } catch (err) {
    console.error('[sms] provider send failed:', err)
    return { ok: false, stubbed: false }
  }
}

// ── Urgency-driven delivery engine ─────────────────────────────────────────────
// Every feature calls one of the resolvers below with an `event`; urgency is fixed per
// event here (never passed in, so it can't be downgraded). CRITICAL + HIGH are life-
// safety / operational and are NEVER muted by prefs, quiet hours, off-duty, or flood
// limits — the engine short-circuits before any preference lookup for them. Only
// NORMAL/LOW consult preferences. This is the hard rule, enforced in code.
export type Urgency = 'critical' | 'high' | 'normal' | 'low'
const EVENT_URGENCY: Record<string, Urgency> = {
  panic: 'critical', roll_call: 'critical', panic_dispatch: 'critical', panic_escalate: 'critical',
  panic_cancel: 'high', missed_checkin: 'high', dispatch: 'high',
  new_incident: 'normal', broadcast: 'normal',
  invite: 'low', password_reset: 'low', report_ready: 'low',
}
export function urgencyOf(event: string): Urgency { return EVENT_URGENCY[event] ?? 'normal' }
function isProtected(u: Urgency): boolean { return u === 'critical' || u === 'high' }

export interface Recipient {
  id: string; phone?: string | null; email?: string | null; off_duty?: boolean
  notif_push?: boolean; notif_sms?: boolean; quiet_start?: number | null; quiet_end?: number | null
}
const RECIPIENT_COLS = 'id, phone, email, off_duty, notif_push, notif_sms, quiet_start, quiet_end'
const FLOOD_MAX = 8
const FLOOD_WINDOW_MIN = 10

function inQuietHours(start: number | null | undefined, end: number | null | undefined): boolean {
  if (start == null || end == null) return false
  const now = new Date()
  const m = now.getUTCHours() * 60 + now.getUTCMinutes()
  return start <= end ? (m >= start && m < end) : (m >= start || m < end)
}

async function logDelivery(supabase: any, orgId: string, userId: string | null, event: string, urgency: Urgency, channel: string, status: string): Promise<void> {
  try { await supabase.from('notification_log').insert({ org_id: orgId, ngo_user_id: userId, event_type: event, urgency, channel, status }) } catch { /* logging never blocks delivery */ }
}

async function floodedFor(supabase: any, userId: string, event: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - FLOOD_WINDOW_MIN * 60000).toISOString()
    const { count } = await supabase.from('notification_log').select('id', { count: 'exact', head: true })
      .eq('ngo_user_id', userId).eq('event_type', event).gte('created_at', since)
    return (count ?? 0) >= FLOOD_MAX
  } catch { return false }
}

interface Routing { enabled: boolean; push: boolean; sms: boolean; email: boolean }
async function orgRouting(supabase: any, orgId: string, event: string): Promise<Routing> {
  const builtin: Routing = { enabled: true, push: true, sms: false, email: false }
  try {
    const { data } = await supabase.from('org_notification_defaults').select('enabled, push, sms, email').eq('org_id', orgId).eq('event_type', event).maybeSingle()
    return data ?? builtin
  } catch { return builtin }
}

// The shared core. Push is a single org-topic broadcast (can't be filtered per-user);
// SMS + email are per-recipient. Critical channels retry. Every attempt is logged.
async function deliver(supabase: any, args: {
  orgId: string; event: string; title: string; body: string; priority?: Priority; tags?: string; recipients: Recipient[]
}): Promise<void> {
  const { orgId, event, title, body, priority, tags, recipients } = args
  const urgency = urgencyOf(event)
  const guarded = isProtected(urgency)
  const smsText = scrubSensitive(`${title} — ${body}`)
  const topic = await resolveOrgTopic(supabase, orgId)

  // Base channels per urgency.
  const base = urgency === 'critical' || urgency === 'high'
    ? { push: true, sms: true, email: false }
    : urgency === 'normal' ? { push: true, sms: false, email: false }
    : { push: false, sms: false, email: true } // low

  // Non-protected: consult org routing (and skip entirely if the org disabled the event).
  const routing = guarded ? null : await orgRouting(supabase, orgId, event)
  if (routing && !routing.enabled) return

  // Per-user prefs for the recipient set (one query), non-protected only.
  const prefMap = new Map<string, { push?: boolean; sms?: boolean; email?: boolean }>()
  if (!guarded && recipients.length) {
    try {
      const { data } = await supabase.from('user_notification_prefs').select('ngo_user_id, push, sms, email')
        .eq('event_type', event).in('ngo_user_id', recipients.map((r) => r.id))
      for (const p of data ?? []) prefMap.set(p.ngo_user_id, { push: p.push, sms: p.sms, email: p.email })
    } catch { /* fall to org defaults */ }
  }

  // ── PUSH: one broadcast to the org topic ──
  const pushOn = base.push && (guarded || (routing ? routing.push : true))
  if (pushOn) {
    let ok = false
    const tries = urgency === 'critical' ? 2 : 1
    for (let a = 0; a < tries && !ok; a++) ok = (await sendPush(topic, { title, body, priority, tags })).ok
    await logDelivery(supabase, orgId, null, event, urgency, 'push', ok ? 'sent' : 'failed')
  }

  // ── Per-recipient SMS + EMAIL ──
  for (const u of recipients) {
    // Non-protected gating: off duty, quiet hours, flood. (None of this applies to
    // CRITICAL/HIGH — those always go through.)
    if (!guarded) {
      if (u.off_duty) continue
      if (inQuietHours(u.quiet_start, u.quiet_end)) continue
      if (await floodedFor(supabase, u.id, event)) { await logDelivery(supabase, orgId, u.id, event, urgency, 'sms', 'throttled'); continue }
    }
    const pref = prefMap.get(u.id)

    // SMS
    const smsWanted = guarded ? base.sms : (u.notif_sms !== false && (pref?.sms ?? routing!.sms))
    if (smsWanted && u.phone) {
      let r = await sendSms(u.phone, smsText)
      if (!r.ok && urgency === 'critical') r = await sendSms(u.phone, smsText) // retry once
      await logDelivery(supabase, orgId, u.id, event, urgency, 'sms', r.stubbed ? 'stubbed' : r.ok ? 'sent' : 'failed')
    }

    // EMAIL (low base, or normal/high opted-in)
    const emailWanted = guarded ? base.email : (base.email || (pref?.email ?? routing!.email))
    if (emailWanted && u.email) {
      const r = await sendEmail({ to: u.email, subject: title, html: `<p>${escapeBasic(body)}</p>`, text: `${title} — ${body}` })
      await logDelivery(supabase, orgId, u.id, event, urgency, 'email', r.stubbed ? 'stubbed' : r.ok ? 'sent' : 'failed')
    }
  }
}

function escapeBasic(s: string): string { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string)) }

// Notify everyone in `roles` for an org. msg.event sets urgency + channels.
export async function notifyOrgRoles(
  supabase: any, orgId: string, roles: string[],
  msg: { event: string; title: string; body: string; priority?: Priority; tags?: string },
): Promise<void> {
  const { data: users } = await supabase.from('ngo_users').select(RECIPIENT_COLS).eq('org_id', orgId).in('role', roles).eq('status', 'active')
  await deliver(supabase, { orgId, event: msg.event, title: msg.title, body: msg.body, priority: msg.priority, tags: msg.tags, recipients: (users ?? []) as Recipient[] })
}

// Notify the active members of a specific team.
export async function notifyTeam(
  supabase: any, teamId: string,
  msg: { event: string; title: string; body: string; priority?: Priority; tags?: string },
): Promise<void> {
  const { data: team } = await supabase.from('ngo_teams').select('org_id').eq('id', teamId).maybeSingle()
  if (!team?.org_id) return
  const { data: members } = await supabase.from('team_members')
    .select(`ngo_users ( ${RECIPIENT_COLS}, status )`).eq('team_id', teamId).not('ngo_user_id', 'is', null)
  const recipients = (members ?? [])
    .map((m: any) => (Array.isArray(m.ngo_users) ? m.ngo_users[0] : m.ngo_users))
    .filter((u: any) => u && u.status === 'active') as Recipient[]
  await deliver(supabase, { orgId: team.org_id, event: msg.event, title: msg.title, body: msg.body, priority: msg.priority, tags: msg.tags, recipients })
}

// Notify an explicit set of users (e.g. a report's generator + admins).
export async function notifyUsers(
  supabase: any, orgId: string, userIds: string[],
  msg: { event: string; title: string; body: string; priority?: Priority; tags?: string },
): Promise<void> {
  if (!userIds.length) return
  const { data: users } = await supabase.from('ngo_users').select(RECIPIENT_COLS).eq('org_id', orgId).in('id', userIds).eq('status', 'active')
  await deliver(supabase, { orgId, event: msg.event, title: msg.title, body: msg.body, priority: msg.priority, tags: msg.tags, recipients: (users ?? []) as Recipient[] })
}
