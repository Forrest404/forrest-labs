import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { revokeOrphanedMemberLogin } from '@/lib/ngo-safety'
import { TEAM_TYPES } from '../route'

// Edit / delete a single team. Every operation re-confirms the team belongs to
// the caller's org before touching it, so a team id from another org 404s.

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  let body: { name?: string; type?: string; capacity?: unknown; group_chat_url?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const type = String(body.type ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
  if (!TEAM_TYPES.includes(type as any)) {
    return NextResponse.json({ error: 'Invalid team type' }, { status: 400 })
  }
  const capacity =
    body.capacity === undefined || body.capacity === null || body.capacity === ''
      ? null
      : Number(body.capacity)
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) {
    return NextResponse.json({ error: 'Capacity must be a positive number' }, { status: 400 })
  }

  // Optional external group-chat link. Only set when the key is present so older clients
  // that don't send it leave it untouched. Restrict to safe link schemes (no javascript:).
  let chatProvided = false
  let groupChatUrl: string | null = null
  if (body.group_chat_url !== undefined) {
    chatProvided = true
    const raw = String(body.group_chat_url ?? '').trim()
    if (raw) {
      const ok = /^(https?:\/\/|signal:|whatsapp:|tg:)/i.test(raw)
      if (!ok) return NextResponse.json({ error: 'Chat link must start with https://, signal:, whatsapp: or tg:' }, { status: 400 })
      groupChatUrl = raw.slice(0, 500)
    }
  }

  const supabase = createServiceClient()
  const baseUpdate: Record<string, unknown> = { name, type, capacity }
  // Scope check: update only when org_id matches; .select() tells us if a row hit.
  // Resilient to the chat-link migration not being applied yet: if the column is
  // missing, retry without it so team edits keep working.
  let res: any = await supabase
    .from('ngo_teams')
    .update(chatProvided ? { ...baseUpdate, group_chat_url: groupChatUrl } : baseUpdate)
    .eq('id', id).eq('org_id', session!.orgId)
    .select('id, name, type, capacity').maybeSingle()
  if (res.error && chatProvided && (res.error.code === 'PGRST204' || res.error.code === '42703')) {
    res = await supabase.from('ngo_teams').update(baseUpdate).eq('id', id).eq('org_id', session!.orgId).select('id, name, type, capacity').maybeSingle()
  }
  if (res.error) return NextResponse.json({ error: 'Could not update team' }, { status: 500 })
  if (!res.data) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  return NextResponse.json({ team: res.data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  // Only org_admin may delete a team.
  if (!requireRole(session, ['org_admin'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  const supabase = createServiceClient()

  // Capture the team's members before deletion so we can revoke any field-coordinator
  // logins that end up on no team (deleting the team cascades the membership rows).
  const { data: members } = await supabase.from('team_members').select('ngo_user_id').eq('team_id', id)

  const { data, error } = await supabase
    .from('ngo_teams')
    .delete()
    .eq('id', id)
    .eq('org_id', session!.orgId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Could not delete team' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  let revoked = 0
  for (const m of members ?? []) {
    if (await revokeOrphanedMemberLogin(supabase, m.ngo_user_id)) revoked++
  }
  return NextResponse.json({ success: true, logins_revoked: revoked })
}
