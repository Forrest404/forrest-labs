import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { getUserPushTopic, sendPush } from '@/lib/ngo-notify'
import { rateLimit, tooMany } from '@/lib/rate-limit'

// POST /api/ngo/notify/test — fire a generic test push to the caller's org topic so a user
// can confirm their ntfy subscription is working after setting it up. Any authenticated NGO
// role. Rate-limited per user (3 / minute) so the button can't be used to spam the org topic.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!session) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })

  const supabase = createServiceClient()
  const rl = await rateLimit(supabase, {
    bucket: 'auth:ngo-notify-test', identifier: session.userId, max: 3, windowSec: 60,
  })
  if (!rl.ok) return tooMany(rl.retryAfter, 'Too many test alerts. Wait a minute and try again.')

  const { topic } = await getUserPushTopic(supabase, session.userId, session.orgId)
  const res = await sendPush(topic, {
    title: 'NOUR test notification',
    body: 'Push notifications are working. You can close this.',
    priority: 'high',
    tags: 'white_check_mark',
  })
  return NextResponse.json({ ok: res.ok, stubbed: res.stubbed })
}
