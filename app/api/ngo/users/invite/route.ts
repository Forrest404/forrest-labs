import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole, type NgoRole } from '@/lib/ngo-auth'
import { createAuthToken } from '@/lib/ngo-tokens'
import { sendEmail, logEmail, emailRateOk, inviteEmail } from '@/lib/email'

const ROLES: NgoRole[] = ['org_admin', 'team_leader', 'field_coordinator']
const INVITE_TTL_MIN = 72 * 60 // 3 days

// POST /api/ngo/users/invite — email a single-use invite link. org_admin can invite any
// role; a team_leader may invite only team_leader/field_coordinator (no privilege
// escalation). The user row is NOT created here — the invitee sets their own name +
// credential on accept. Rate-limited per recipient (email flooding).
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  let body: { email?: string; role?: string; team_id?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const email = String(body.email ?? '').trim().toLowerCase()
  const role = String(body.role ?? '') as NgoRole
  if (!email.includes('@')) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  if (session!.role === 'team_leader' && role === 'org_admin') {
    return NextResponse.json({ error: 'Team leaders cannot invite org admins' }, { status: 403 })
  }

  const supabase = createServiceClient()

  // If the team is specified, it must belong to this org.
  let teamId: string | null = null
  if (body.team_id) {
    teamId = String(body.team_id)
    const { data: team } = await supabase.from('ngo_teams').select('id').eq('id', teamId).eq('org_id', session!.orgId).maybeSingle()
    if (!team) return NextResponse.json({ error: 'Team not found in your organisation' }, { status: 400 })
  }

  // Already an active member of this org? Avoid duplicate invites.
  const { data: existing } = await supabase
    .from('ngo_users').select('id, status').eq('email', email).eq('org_id', session!.orgId).maybeSingle()
  if (existing && existing.status === 'active') {
    return NextResponse.json({ error: 'That email already has an active account in your organisation.' }, { status: 409 })
  }

  // Durable rate limit (email flooding): max 3 invites to the same address per hour.
  if (!(await emailRateOk(supabase, 'invite', email, 3, 60))) {
    return NextResponse.json({ error: 'Too many invites to that address recently. Try again later.' }, { status: 429 })
  }

  const { data: org } = await supabase.from('ngo_organisations').select('name').eq('id', session!.orgId).maybeSingle()
  const token = await createAuthToken(supabase, 'invite', {
    org_id: session!.orgId, email, role, team_id: teamId, created_by: session!.userId, ttlMinutes: INVITE_TTL_MIN,
  })
  if (!token) return NextResponse.json({ error: 'Could not create the invite' }, { status: 500 })

  const tpl = inviteEmail(org?.name ?? 'your organisation', token.raw)
  const result = await sendEmail({ to: email, ...tpl })
  await logEmail(supabase, 'invite', email, session!.orgId, result)

  if (result.stubbed) return NextResponse.json({ success: true, email_status: 'stubbed', note: 'Invite created — email not configured (set RESEND_API_KEY + EMAIL_FROM).' })
  if (!result.ok) return NextResponse.json({ success: true, email_status: 'failed', note: 'Invite created but the email failed to send (check domain verification).' })
  return NextResponse.json({ success: true, email_status: 'sent' })
}
