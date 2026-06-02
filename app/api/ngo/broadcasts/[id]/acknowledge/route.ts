import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'

// POST /api/ngo/broadcasts/[id]/acknowledge — a RECIPIENT confirms they have seen an urgent
// broadcast (mirrors the roll-call "tap if safe" mechanic). Any role can acknowledge their
// own recipient row; composing/sending stays restricted on the main route. Idempotent.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader', 'field_coordinator'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceClient()

  // The caller must be a recipient of this broadcast within their own org.
  const { data: rec } = await supabase
    .from('broadcast_recipients')
    .select('id, delivered_at, acknowledged_at')
    .eq('broadcast_id', id)
    .eq('ngo_user_id', session!.userId)
    .eq('org_id', session!.orgId)
    .maybeSingle()
  if (!rec) return NextResponse.json({ error: 'This broadcast is not addressed to you.' }, { status: 404 })

  if (!rec.acknowledged_at) {
    const now = new Date().toISOString()
    await supabase.from('broadcast_recipients').update({ acknowledged_at: now, delivered_at: rec.delivered_at ?? now }).eq('id', rec.id)
  }
  return NextResponse.json({ success: true })
}
