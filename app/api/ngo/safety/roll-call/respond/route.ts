import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// Field coordinator taps "I'm safe" for a roll call. Idempotent — a repeat tap
// does not create a second response.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { roll_call_id?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const rollCallId = String(body.roll_call_id ?? '')
  if (!rollCallId) return NextResponse.json({ error: 'roll_call_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Roll call must belong to the caller's org.
  const { data: rc } = await supabase.from('roll_calls').select('org_id').eq('id', rollCallId).maybeSingle()
  if (!rc || rc.org_id !== session!.orgId) return NextResponse.json({ error: 'Roll call not found' }, { status: 404 })

  const { data: existing } = await supabase
    .from('roll_call_responses')
    .select('id')
    .eq('roll_call_id', rollCallId)
    .eq('ngo_user_id', session!.userId)
    .maybeSingle()
  if (existing) return NextResponse.json({ success: true, already: true })

  const { error } = await supabase.from('roll_call_responses').insert({
    roll_call_id: rollCallId,
    ngo_user_id: session!.userId,
    safe: true,
    responded_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: 'Could not record response' }, { status: 500 })
  return NextResponse.json({ success: true })
}
