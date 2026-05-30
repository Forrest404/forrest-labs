import 'server-only'

// Notification fan-out for NGO safety events. Two channels:
//  - push  → ntfy.sh (reuses the codebase's existing broadcast-channel pattern)
//  - sms   → a stub today (no provider wired); structured so a real provider
//            (Twilio, an SMS gateway URL, …) drops in by reading env + POSTing.
// CLAUDE.md requires every safety alert to work over SMS as well as push, so the
// call sites always attempt both — the SMS path simply logs until a provider exists.

type Priority = 'low' | 'default' | 'high' | 'urgent'

export async function sendPush(opts: {
  title: string
  body: string
  priority?: Priority
  tags?: string
}): Promise<void> {
  const channel = process.env.NTFY_CHANNEL
  if (!channel) {
    console.log('[push-stub] NTFY_CHANNEL unset →', opts.title, '::', opts.body)
    return
  }
  await fetch(`https://ntfy.sh/${channel}`, {
    method: 'POST',
    headers: {
      Title: opts.title,
      Priority: opts.priority ?? 'default',
      Tags: opts.tags ?? 'bell',
      'Content-Type': 'text/plain',
    },
    body: opts.body,
  }).catch((err) => console.error('[push] ntfy failed:', err))
}

export async function sendSms(phone: string, body: string): Promise<{ ok: boolean; stubbed: boolean }> {
  // Drop-in point: when an SMS provider is configured, POST to it here.
  const provider = process.env.SMS_PROVIDER_URL
  if (!provider) {
    console.log(`[sms-stub] to=${phone} :: ${body}`)
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

// Push (one broadcast) + SMS (per recipient phone) to everyone in `roles` for an org.
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

  await sendPush(msg)

  const phones = (users ?? []).map((u: any) => u.phone).filter(Boolean) as string[]
  await Promise.all(phones.map((p) => sendSms(p, `${msg.title} — ${msg.body}`)))
  return { pushed: true, smsCount: phones.length }
}

// Push (one broadcast) + SMS to the field coordinators on a specific team.
export async function notifyTeam(
  supabase: any,
  teamId: string,
  msg: { title: string; body: string; priority?: Priority; tags?: string },
): Promise<{ pushed: boolean; smsCount: number }> {
  const { data: members } = await supabase
    .from('team_members')
    .select('ngo_users ( phone, status )')
    .eq('team_id', teamId)
    .not('ngo_user_id', 'is', null)

  await sendPush(msg)

  const phones = (members ?? [])
    .map((m: any) => (Array.isArray(m.ngo_users) ? m.ngo_users[0] : m.ngo_users))
    .filter((u: any) => u && u.status === 'active' && u.phone)
    .map((u: any) => u.phone) as string[]
  await Promise.all(phones.map((p) => sendSms(p, `${msg.title} — ${msg.body}`)))
  return { pushed: true, smsCount: phones.length }
}
