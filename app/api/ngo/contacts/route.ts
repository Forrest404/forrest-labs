import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { rateLimit, tooMany, MUTATION_MAX, MUTATION_WINDOW } from '@/lib/rate-limit'

const FIELDS = 'id, name, organisation, role, phone, notes, created_at, updated_at'

// GET /api/ngo/contacts — list this org's contacts. Any signed-in member may view
// (field coordinators need "who do we call" + tap-to-call).
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('contacts')
    .select(FIELDS)
    .eq('org_id', session!.orgId)
    .order('name', { ascending: true })
  if (error) {
    console.error('contacts load failed:', error)
    return NextResponse.json({ error: 'Could not load contacts' }, { status: 500 })
  }
  return NextResponse.json(
    { contacts: data ?? [], can_manage: session!.role === 'org_admin' || session!.role === 'team_leader' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// POST /api/ngo/contacts — create. Managers only.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  { const l = await rateLimit(createServiceClient(), { bucket: 'mut:contacts', identifier: session!.userId, max: MUTATION_MAX, windowSec: MUTATION_WINDOW }); if (!l.ok) return tooMany(l.retryAfter) }
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const name = (body.name ?? '').toString().trim()
  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })
  if (name.length > 160) return NextResponse.json({ error: 'Name is too long.' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      org_id: session!.orgId,
      name,
      organisation: str(body.organisation),
      role: str(body.role),
      phone: str(body.phone),
      notes: str(body.notes),
      created_by: session!.userId,
    })
    .select('id')
    .single()
  if (error) {
    console.error('contact create failed:', error)
    return NextResponse.json({ error: 'Could not save the contact' }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: data.id })
}

function str(v: unknown): string | null {
  const s = (v ?? '').toString().trim()
  return s ? s.slice(0, 500) : null
}
