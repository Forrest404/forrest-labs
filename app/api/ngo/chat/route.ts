import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { rateLimit, tooMany, MUTATION_MAX, MUTATION_WINDOW } from '@/lib/rate-limit'
import { resolveTeamId } from '@/lib/ngo-safety'
import { validateChatUrl } from '@/lib/ngo-chat'

const PLATFORMS = ['signal', 'whatsapp', 'telegram', 'other']

// GET /api/ngo/chat — chat links VISIBLE to the caller, always org-scoped.
//  • org_admin / team_leader → every link in the org (org + all team scopes).
//  • field_coordinator       → org-scope links + team-scope links for THEIR team.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  // Any signed-in org member may VIEW links in scope (field_coordinator included).
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const orgId = session!.orgId
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('chat_links')
    .select('id, label, platform, url, scope, team_id, description, created_at, updated_at, ngo_teams ( name ), creator:ngo_users ( full_name )')
    .eq('org_id', orgId) // org-scope: never another org's links
    .order('created_at', { ascending: false })
  if (error) {
    console.error('chat links load failed:', error)
    return NextResponse.json({ error: 'Could not load chat links' }, { status: 500 })
  }

  let rows = data ?? []
  // Field coordinators only see org-scope links + their own team's team-scope links.
  if (session!.role === 'field_coordinator') {
    const myTeam = await resolveTeamId(supabase, session!.userId)
    rows = rows.filter((r: any) => r.scope === 'org' || (r.scope === 'team' && r.team_id && r.team_id === myTeam))
  }

  const links = rows.map((r: any) => ({
    id: r.id,
    label: r.label,
    platform: r.platform,
    url: r.url,
    scope: r.scope,
    team_id: r.team_id,
    team_name: Array.isArray(r.ngo_teams) ? r.ngo_teams[0]?.name ?? null : r.ngo_teams?.name ?? null,
    description: r.description,
    added_by: Array.isArray(r.creator) ? r.creator[0]?.full_name ?? null : r.creator?.full_name ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))

  return NextResponse.json(
    { links, can_manage: session!.role === 'org_admin' || session!.role === 'team_leader' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// POST /api/ngo/chat — create a link. Managers only.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  { const l = await rateLimit(createServiceClient(), { bucket: 'mut:chat', identifier: session!.userId, max: MUTATION_MAX, windowSec: MUTATION_WINDOW }); if (!l.ok) return tooMany(l.retryAfter) }
  const orgId = session!.orgId
  const supabase = createServiceClient()

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const label = (body.label ?? '').toString().trim()
  if (!label) return NextResponse.json({ error: 'A label is required.' }, { status: 400 })
  if (label.length > 120) return NextResponse.json({ error: 'Label is too long.' }, { status: 400 })

  const v = validateChatUrl((body.url ?? '').toString())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // Platform: trust the validated inference, but honour an explicit valid override.
  const platform = PLATFORMS.includes(body.platform) ? body.platform : v.platform

  const scope = body.scope === 'team' ? 'team' : 'org'
  let teamId: string | null = null
  if (scope === 'team') {
    teamId = (body.team_id ?? '').toString() || null
    if (!teamId) return NextResponse.json({ error: 'A team is required for a team-scope link.' }, { status: 400 })
    // Verify the team belongs to THIS org (no cross-org team references).
    const { data: team } = await supabase.from('ngo_teams').select('id').eq('id', teamId).eq('org_id', orgId).maybeSingle()
    if (!team) return NextResponse.json({ error: 'That team was not found in your organisation.' }, { status: 400 })
  }

  const description = (body.description ?? '').toString().trim().slice(0, 500) || null

  const { data, error } = await supabase
    .from('chat_links')
    .insert({ org_id: orgId, label, platform, url: v.url, scope, team_id: teamId, description, created_by: session!.userId })
    .select('id')
    .single()
  if (error) {
    console.error('chat link create failed:', error)
    return NextResponse.json({ error: 'Could not save the link' }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: data.id })
}
