import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit, tooMany } from '@/lib/rate-limit'
import { isBlocked } from '@/lib/abuse'

// Public, no-account area-alert subscription. The civilian picks an area (lat/lon + radius);
// we mint a high-entropy ntfy topic they subscribe to. A scheduled job (api/alerts/dispatch)
// matches new verified incidents / warnings to subscribed areas and publishes to the topic.
// Privacy: IP is hashed for abuse control only; the topic is unguessable.

const NTFY_BASE_URL = (process.env.NTFY_BASE_URL ?? 'https://ntfy.sh').replace(/\/+$/, '')
// Lebanon bounding box (per CLAUDE.md) — keep subscriptions to the operating area.
const LB = { minLat: 33.05, maxLat: 34.69, minLon: 35.10, maxLon: 36.62 }
const SUB_MAX = 5            // 5 subscribe actions
const SUB_WINDOW = 60 * 60   // per hour, per hashed IP

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip_hash = await sha256hex(clientIp(req))
  const supabase = createServiceClient()

  const limit = await rateLimit(supabase, { bucket: 'public:alert-sub', identifier: ip_hash, max: SUB_MAX, windowSec: SUB_WINDOW })
  if (!limit.ok) return tooMany(limit.retryAfter, 'Too many subscriptions from this device. Please wait and try again.')
  if (await isBlocked(supabase, ip_hash, ip_hash)) {
    return NextResponse.json({ error: 'This request could not be accepted.' }, { status: 403 })
  }

  let body: { lat?: unknown; lon?: unknown; radius_metres?: unknown; lang?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const lat = Number(body.lat), lon = Number(body.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 })
  if (lat < LB.minLat || lat > LB.maxLat || lon < LB.minLon || lon > LB.maxLon) {
    return NextResponse.json({ error: 'Area must be within Lebanon.' }, { status: 400 })
  }
  let radius = Math.round(Number(body.radius_metres ?? 5000))
  if (!Number.isFinite(radius)) radius = 5000
  radius = Math.max(500, Math.min(50000, radius))
  const lang = (['en', 'fr', 'ar'] as const).includes(body.lang as any) ? (body.lang as string) : 'en'

  const topic = `nour-area-${randomBytes(24).toString('base64url')}` // ~192 bits, unguessable
  const { error } = await supabase
    .from('alert_subscriptions')
    .insert({ topic, lat, lon, radius_metres: radius, lang, ip_hash })
  if (error) return NextResponse.json({ error: 'Could not create the subscription.' }, { status: 500 })

  // The civilian subscribes by opening this in the ntfy app or web (no account needed).
  return NextResponse.json({
    success: true,
    topic,
    subscribe_url: `${NTFY_BASE_URL}/${topic}`,
    radius_metres: radius,
  })
}

// Unsubscribe (best-effort): deactivate by topic. Knowing the unguessable topic authorises it.
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  let body: { topic?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
  if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  const supabase = createServiceClient()
  await supabase.from('alert_subscriptions').update({ active: false }).eq('topic', topic)
  return NextResponse.json({ success: true })
}
