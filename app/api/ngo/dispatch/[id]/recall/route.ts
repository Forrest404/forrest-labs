import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyTeam } from '@/lib/ngo-notify'

// Recall a team: cancel the dispatch, record the reason in the note, notify the
// team. The incident loses its active dispatch and reappears as a coverage gap.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params

  let body: { reason?: string } = {}
  try { body = await request.json() } catch { /* reason optional */ }
  const reason = body.reason ? String(body.reason).slice(0, 300) : null

  const supabase = createServiceClient()
  const { data: d } = await supabase.from('ngo_dispatches').select('id, org_id, team_id, status, note').eq('id', id).maybeSingle()
  if (!d || d.org_id !== session!.orgId) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })
  if (d.status === 'done' || d.status === 'cancelled') {
    return NextResponse.json({ error: 'Dispatch is already closed' }, { status: 400 })
  }

  const note = [d.note, reason ? `Recalled: ${reason}` : 'Recalled'].filter(Boolean).join(' · ')
  const { error } = await supabase.from('ngo_dispatches').update({ status: 'cancelled', note }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Could not recall' }, { status: 500 })

  await notifyTeam(supabase, d.team_id, {
    title: '↩️ Recalled',
    body: `Stand down — your dispatch has been recalled${reason ? `: ${reason}` : ''}.`,
    priority: 'urgent', tags: 'leftwards_arrow_with_hook',
  })

  return NextResponse.json({ success: true })
}
