import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Delete any existing demo session reports
  await supabase
    .from('reports')
    .delete()
    .eq('session_hash', 'demo_session_hash_2026')

  await supabase
    .from('reports')
    .delete()
    .eq('session_hash', 'demo_session_hash_b_2026')

  await supabase
    .from('reports')
    .delete()
    .eq('session_hash', 'demo_session_hash_c_2026')

  // Seed fresh reports
  const demoReports = [
    {
      lat: 33.8584,
      lon: 35.5043,
      distance_band: 'under_500m',
      event_types: ['large_explosion', 'smoke_fire'],
      session_hash: 'demo_session_hash_2026',
      ip_hash: 'demo_ip_hash_1',
      status: 'pending',
    },
    {
      lat: 33.8591,
      lon: 35.5038,
      distance_band: 'under_500m',
      event_types: ['large_explosion'],
      session_hash: 'demo_session_hash_b_2026',
      ip_hash: 'demo_ip_hash_2',
      status: 'pending',
    },
    {
      lat: 33.8579,
      lon: 35.5050,
      distance_band: 'under_500m',
      event_types: ['large_explosion', 'ground_shook', 'smoke_fire'],
      session_hash: 'demo_session_hash_c_2026',
      ip_hash: 'demo_ip_hash_3',
      status: 'pending',
    },
  ]

  await supabase.from('reports').insert(demoReports)

  return NextResponse.json({
    success: true,
    message:
      'Demo data reset. Wait 75 seconds for clustering or trigger manually.',
  })
}
