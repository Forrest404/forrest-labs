import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { getUserPushTopic } from '@/lib/ngo-notify'

// GET /api/ngo/notify/topic — the CALLER'S OWN push topic + subscribe URLs. Reachable by
// every authenticated NGO role (field coordinators included) so anyone can subscribe in the
// ntfy app. Each user has their own topic, so push can be targeted (team-only, etc.) and a
// user only ever learns their own topic — scoped to session.userId.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!session) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const supabase = createServiceClient()
  const { topic, baseUrl } = await getUserPushTopic(supabase, session.userId, session.orgId)
  if (!topic) return NextResponse.json({ error: 'Push not configured' }, { status: 503 })

  const host = baseUrl.replace(/^https?:\/\//, '')
  return NextResponse.json(
    { topic, baseUrl, subscribeUrl: `${baseUrl}/${topic}`, deepLink: `ntfy://${host}/${topic}` },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
