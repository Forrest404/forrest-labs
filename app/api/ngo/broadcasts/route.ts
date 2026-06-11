import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyOrgRoles, notifyTeam } from '@/lib/ngo-notify'
import { rateLimit, tooMany, MUTATION_MAX, MUTATION_WINDOW } from '@/lib/rate-limit'
import { readJsonBody } from '@/lib/http'

// One-way broadcast channel (leader → field staff). PUSH ONLY for now — fired through the
// shared notification engine. SMS is deliberately deferred (see the inert hook in POST).
// Broadcast is a thin layer over the engine: it records who a message is for + their
// delivery/acknowledgement, and asks the engine to send the push.

const MAX_BODY = 280
const TARGETS = ['all', 'team', 'leaders'] as const
const URGENCIES = ['routine', 'urgent'] as const
type Target = (typeof TARGETS)[number]

// Resolve the set of recipient user ids for a target within an org.
async function resolveAudience(supabase: any, orgId: string, target: Target, teamId: string | null): Promise<string[]> {
  if (target === 'team') {
    if (!teamId) return []
    const { data } = await supabase
      .from('team_members')
      .select('ngo_user_id, ngo_users!inner ( status )')
      .eq('team_id', teamId)
      .not('ngo_user_id', 'is', null)
    return (data ?? [])
      .filter((m: any) => (Array.isArray(m.ngo_users) ? m.ngo_users[0] : m.ngo_users)?.status === 'active')
      .map((m: any) => m.ngo_user_id as string)
  }
  const roles = target === 'leaders' ? ['org_admin', 'team_leader'] : ['field_coordinator']
  const { data } = await supabase.from('ngo_users').select('id').eq('org_id', orgId).in('role', roles).eq('status', 'active')
  return (data ?? []).map((u: any) => u.id as string)
}

function targetLabel(b: { target_type: string; team_name?: string | null }): string {
  if (b.target_type === 'team') return `Team: ${b.team_name ?? 'unknown'}`
  if (b.target_type === 'leaders') return 'All leaders'
  return 'All field staff'
}

// ── GET — role-aware history ───────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const orgId = session!.orgId

  // FIELD COORDINATOR: only broadcasts addressed to them; mark them delivered (read receipt).
  if (session!.role === 'field_coordinator') {
    // withdrawn_at is additive — select it, but fall back to a select without it pre-migration.
    const recBase = (wd: boolean) => `id, delivered_at, acknowledged_at, broadcasts!inner ( id, body, urgency, created_at, sender_id${wd ? ', withdrawn_at' : ''} )`
    let rres: any = await supabase
      .from('broadcast_recipients').select(recBase(true))
      .eq('ngo_user_id', session!.userId).eq('org_id', orgId)
      .order('created_at', { ascending: false }).limit(50)
    if (rres.error && (rres.error.code === '42703' || rres.error.code === 'PGRST204')) {
      rres = await supabase
        .from('broadcast_recipients').select(recBase(false))
        .eq('ngo_user_id', session!.userId).eq('org_id', orgId)
        .order('created_at', { ascending: false }).limit(50)
    }
    // Drop withdrawn broadcasts — a withdrawn message must vanish from the field feed.
    const rows = (rres.data ?? []).filter((r: any) => {
      const b = Array.isArray(r.broadcasts) ? r.broadcasts[0] : r.broadcasts
      return b && !b.withdrawn_at
    })

    const list = rows.map((r: any) => {
      const b = Array.isArray(r.broadcasts) ? r.broadcasts[0] : r.broadcasts
      return { recipient_id: r.id, id: b.id, body: b.body, urgency: b.urgency, created_at: b.created_at, sender_id: b.sender_id, delivered_at: r.delivered_at, acknowledged_at: r.acknowledged_at }
    })
    // Mark unseen (and not withdrawn) as delivered now.
    const unseen = rows.filter((r: any) => !r.delivered_at).map((r: any) => r.id)
    if (unseen.length) await supabase.from('broadcast_recipients').update({ delivered_at: new Date().toISOString() }).in('id', unseen)

    // Attach sender names.
    const senderIds = Array.from(new Set(list.map((b: any) => b.sender_id).filter(Boolean))) as string[]
    const names = await senderNames(supabase, senderIds)
    return NextResponse.json({ broadcasts: list.map((b: any) => ({ ...b, sender_name: names[b.sender_id] ?? 'A leader', target_label: '' })), can_send: false }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // LEADERS / ADMINS: all org broadcasts + delivery/ack counts + audiences for the composer.
  // withdrawn_at / edited_at are additive — select them, fall back without them pre-migration.
  const bcastBase = 'id, body, target_type, team_id, urgency, created_at, sender_id, ngo_teams ( name )'
  let bres: any = await supabase
    .from('broadcasts').select(`${bcastBase}, withdrawn_at, edited_at`)
    .eq('org_id', orgId).order('created_at', { ascending: false }).limit(50)
  if (bres.error && (bres.error.code === '42703' || bres.error.code === 'PGRST204')) {
    bres = await supabase
      .from('broadcasts').select(bcastBase)
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(50)
  }
  // Withdrawn broadcasts are hidden from history (kept in the DB for audit).
  const bcasts = (bres.data ?? []).filter((b: any) => !b.withdrawn_at)

  const ids = (bcasts ?? []).map((b: any) => b.id)
  const counts: Record<string, { total: number; delivered: number; acked: number }> = {}
  if (ids.length) {
    const { data: recs } = await supabase.from('broadcast_recipients').select('broadcast_id, delivered_at, acknowledged_at').in('broadcast_id', ids)
    for (const r of recs ?? []) {
      const c = (counts[r.broadcast_id] ??= { total: 0, delivered: 0, acked: 0 })
      c.total++; if (r.delivered_at) c.delivered++; if (r.acknowledged_at) c.acked++
    }
  }
  const senderIds = Array.from(new Set((bcasts ?? []).map((b: any) => b.sender_id).filter(Boolean))) as string[]
  const names = await senderNames(supabase, senderIds)

  const broadcasts = (bcasts ?? []).map((b: any) => {
    const team_name = Array.isArray(b.ngo_teams) ? b.ngo_teams[0]?.name : b.ngo_teams?.name
    const c = counts[b.id] ?? { total: 0, delivered: 0, acked: 0 }
    return {
      id: b.id, body: b.body, target_type: b.target_type, team_id: b.team_id, urgency: b.urgency,
      created_at: b.created_at, edited_at: b.edited_at ?? null, sender_name: names[b.sender_id] ?? 'A leader',
      target_label: targetLabel({ target_type: b.target_type, team_name }),
      recipient_count: c.total, delivered_count: c.delivered, acknowledged_count: c.acked,
    }
  })

  // Audience sizes for the composer's confirmation step.
  const [{ count: fieldCount }, { count: leaderCount }, { data: teamRows }] = await Promise.all([
    supabase.from('ngo_users').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('role', 'field_coordinator').eq('status', 'active'),
    supabase.from('ngo_users').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('role', ['org_admin', 'team_leader']).eq('status', 'active'),
    supabase.from('ngo_teams').select('id, name').eq('org_id', orgId).order('name'),
  ])
  const teams: { id: string; name: string; count: number }[] = []
  for (const t of teamRows ?? []) {
    const { count } = await supabase.from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', t.id).not('ngo_user_id', 'is', null)
    teams.push({ id: t.id, name: t.name, count: count ?? 0 })
  }

  return NextResponse.json({
    broadcasts,
    can_send: true,
    audiences: { field_count: fieldCount ?? 0, leader_count: leaderCount ?? 0, teams },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

async function senderNames(supabase: any, ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {}
  const { data } = await supabase.from('ngo_users').select('id, full_name').in('id', ids)
  const out: Record<string, string> = {}
  for (const u of data ?? []) out[u.id] = u.full_name
  return out
}

// ── POST — compose + send (org_admin / team_leader only) ───────────────────────
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const orgId = session!.orgId

  const limit = await rateLimit(supabase, { bucket: 'mut:broadcast', identifier: session!.userId, max: MUTATION_MAX, windowSec: MUTATION_WINDOW })
  if (!limit.ok) return tooMany(limit.retryAfter)

  const parsed = await readJsonBody<{ message?: string; target_type?: string; team_id?: string; urgency?: string; client_token?: string }>(request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const message = String(body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'A message is required.' }, { status: 400 })
  if (message.length > MAX_BODY) return NextResponse.json({ error: `Message is too long (max ${MAX_BODY} characters).` }, { status: 400 })

  const target = (TARGETS as readonly string[]).includes(body.target_type ?? '') ? (body.target_type as Target) : 'all'
  const urgency = (URGENCIES as readonly string[]).includes(body.urgency ?? '') ? (body.urgency as string) : 'routine'
  const teamId = target === 'team' ? String(body.team_id ?? '') : null
  if (target === 'team') {
    if (!teamId) return NextResponse.json({ error: 'Choose a team.' }, { status: 400 })
    const { data: team } = await supabase.from('ngo_teams').select('id').eq('id', teamId).eq('org_id', orgId).maybeSingle()
    if (!team) return NextResponse.json({ error: 'Team not found.' }, { status: 404 })
  }
  const clientToken = body.client_token ? String(body.client_token).slice(0, 64) : null

  // Idempotency (single-fire): a repeated send with the same token returns the original.
  if (clientToken) {
    const { data: existing } = await supabase.from('broadcasts').select('id').eq('org_id', orgId).eq('client_token', clientToken).maybeSingle()
    if (existing) {
      const { count } = await supabase.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', existing.id)
      return NextResponse.json({ success: true, broadcast_id: existing.id, sent_count: count ?? 0, duplicate: true })
    }
  }

  // Resolve who this is for BEFORE sending (also the sender's "sent to N" feedback).
  const audience = await resolveAudience(supabase, orgId, target, teamId)

  const { data: bcast, error: insErr } = await supabase
    .from('broadcasts')
    .insert({ org_id: orgId, sender_id: session!.userId, body: message, target_type: target, team_id: teamId, urgency, client_token: clientToken })
    .select('id')
    .single()
  if (insErr || !bcast) {
    // A concurrent double-tap may have lost the unique race — return the winner.
    if (clientToken) {
      const { data: winner } = await supabase.from('broadcasts').select('id').eq('org_id', orgId).eq('client_token', clientToken).maybeSingle()
      if (winner) return NextResponse.json({ success: true, broadcast_id: winner.id, sent_count: audience.length, duplicate: true })
    }
    return NextResponse.json({ error: 'Could not save the broadcast.' }, { status: 500 })
  }

  if (audience.length) {
    const { error: recErr } = await supabase.from('broadcast_recipients').insert(
      audience.map((uid) => ({ broadcast_id: bcast.id, org_id: orgId, ngo_user_id: uid })),
    )
    // If recipient tracking fails, don't leave an untracked broadcast and then push anyway
    // (the "sent to N" + delivery/ack would be a lie). Roll the broadcast back and fail (M2).
    if (recErr) {
      await supabase.from('broadcasts').delete().eq('id', bcast.id)
      return NextResponse.json({ error: 'Could not save the broadcast.' }, { status: 500 })
    }
  }

  // ── Send the PUSH via the existing engine (push channel only). ──
  // Push is now per-USER (each recipient has their own ntfy topic), so the message reaches
  // ONLY the resolved audience — the body is no longer placed on a shared org topic. It is
  // therefore safe to carry the real message for every target. scrubSensitive (in the engine)
  // still strips any coordinate-shaped tokens as a backstop.
  const urgent = urgency === 'urgent'
  const title = urgent ? '🚨 Urgent broadcast' : '📢 Broadcast'
  const msg = { event: 'broadcast', title, body: message, priority: (urgent ? 'urgent' : 'default') as 'urgent' | 'default', tags: urgent ? 'rotating_light' : 'loudspeaker' }
  if (target === 'team') await notifyTeam(supabase, teamId!, msg)
  else if (target === 'leaders') await notifyOrgRoles(supabase, orgId, ['org_admin', 'team_leader'], msg)
  else await notifyOrgRoles(supabase, orgId, ['field_coordinator'], msg)

  // ★ SMS HOOK (DEFERRED — do not implement here). When SMS is enabled, an URGENT broadcast
  // should ALSO fire SMS to `audience`. Intentionally inert for now.
  if (urgent) {
    // TODO(sms): fire SMS to the resolved `audience` for urgent broadcasts once SMS is live.
  }

  return NextResponse.json({ success: true, broadcast_id: bcast.id, sent_count: audience.length })
}
