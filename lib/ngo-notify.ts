import 'server-only'
import { randomBytes } from 'crypto'

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

export async function sendPush(topic: string | null, opts: {
  title: string
  body: string
  priority?: Priority
  tags?: string
}): Promise<void> {
  const channel = topic ?? process.env.NTFY_CHANNEL
  if (!channel) {
    console.log('[push-stub] no channel configured →', scrubSensitive(opts.title))
    return
  }
  await fetch(`https://ntfy.sh/${channel}`, {
    method: 'POST',
    headers: {
      Title: scrubSensitive(opts.title),
      Priority: opts.priority ?? 'default',
      Tags: opts.tags ?? 'bell',
      'Content-Type': 'text/plain',
    },
    body: scrubSensitive(opts.body),
  }).catch((err) => console.error('[push] ntfy failed:', err))
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

// Push (one broadcast to the org's own topic) + SMS (per recipient phone) to everyone
// in `roles` for an org. Bodies must already be generic (no names/coords/map links).
export async function notifyOrgRoles(
  supabase: any,
  orgId: string,
  roles: string[],
  msg: { title: string; body: string; priority?: Priority; tags?: string },
): Promise<{ pushed: boolean; smsCount: number }> {
  const { data: users } = await supabase
    .from('ngo_users')
    .select('phone')
    .eq('org_id', orgId)
    .in('role', roles)
    .eq('status', 'active')

  const topic = await resolveOrgTopic(supabase, orgId)
  await sendPush(topic, msg)

  const body = scrubSensitive(`${msg.title} — ${msg.body}`)
  const phones = (users ?? []).map((u: any) => u.phone).filter(Boolean) as string[]
  await Promise.all(phones.map((p) => sendSms(p, body)))
  return { pushed: true, smsCount: phones.length }
}

// Push (one broadcast to the org's own topic) + SMS to the field coordinators on a
// specific team. Resolves the team's org so the push lands on that org's topic.
export async function notifyTeam(
  supabase: any,
  teamId: string,
  msg: { title: string; body: string; priority?: Priority; tags?: string },
): Promise<{ pushed: boolean; smsCount: number }> {
  // Resolve the team's org so the push lands on that org's own topic.
  const { data: team } = await supabase
    .from('ngo_teams').select('org_id').eq('id', teamId).maybeSingle()
  const topic = team?.org_id ? await resolveOrgTopic(supabase, team.org_id) : (process.env.NTFY_CHANNEL ?? null)
  await sendPush(topic, msg)

  // Recipient phones (same query shape as before — field members on this team).
  const { data: members } = await supabase
    .from('team_members')
    .select('ngo_users ( phone, status )')
    .eq('team_id', teamId)
    .not('ngo_user_id', 'is', null)

  const body = scrubSensitive(`${msg.title} — ${msg.body}`)
  const phones = (members ?? [])
    .map((m: any) => (Array.isArray(m.ngo_users) ? m.ngo_users[0] : m.ngo_users))
    .filter((u: any) => u && u.status === 'active' && u.phone)
    .map((u: any) => u.phone) as string[]
  await Promise.all(phones.map((p) => sendSms(p, body)))
  return { pushed: true, smsCount: phones.length }
}
