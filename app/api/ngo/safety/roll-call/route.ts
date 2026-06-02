import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { notifyOrgRoles } from '@/lib/ngo-notify'

// Team leader / org admin fires a roll call: creates a roll_calls row and pushes
// "Tap if safe" to every field coordinator in the org (push + SMS).
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { message?: string } = {}
  try { body = await request.json() } catch { /* message is optional */ }

  const supabase = createServiceClient()
  const { data: rc, error } = await supabase
    .from('roll_calls')
    .insert({ org_id: session!.orgId, triggered_by: session!.userId, message: body.message ? String(body.message).slice(0, 280) : null })
    .select('id')
    .single()
  if (error || !rc) return NextResponse.json({ error: 'Could not start roll call' }, { status: 500 })

  await notifyOrgRoles(supabase, session!.orgId, ['field_coordinator'], {
    event: 'roll_call',
    title: '🟢 Roll call',
    body: body.message || 'Tap if safe — confirm your status now.',
    priority: 'urgent',
    tags: 'vibration_mode',
  })

  return NextResponse.json({ success: true, roll_call_id: rc.id })
}
