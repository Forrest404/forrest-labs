import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { getOrgPushTopic } from '@/lib/ngo-notify'

// GET /api/ngo/notify/topic — the caller's org push topic + subscribe URLs. Reachable by
// EVERY authenticated NGO role (field coordinators included) so anyone can subscribe in the
// ntfy app. The topic is org-scoped to session.orgId, so no role gate is needed beyond a
// valid session — a user only ever learns their OWN org's topic.
export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!session) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const supabase = createServiceClient()
  const { topic, baseUrl } = await getOrgPushTopic(supabase, session.orgId)
  if (!topic) return NextResponse.json({ error: 'Push not configured' }, { status: 503 })

  const host = baseUrl.replace(/^https?:\/\//, '')
  return NextResponse.json(
    { topic, baseUrl, subscribeUrl: `${baseUrl}/${topic}`, deepLink: `ntfy://${host}/${topic}` },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
