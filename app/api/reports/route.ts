import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit, tooMany } from '@/lib/rate-limit'
import { isBlocked } from '@/lib/abuse'

// ── helpers ───────────────────────────────────────────────────────────────────

async function sha256hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const buffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

// ── rate limiting ─────────────────────────────────────────────────────────────
// Durable (Supabase-backed) so it survives cold starts and coordinates across Vercel
// instances. Keyed by the hashed IP (raw IP is never stored). 1 report / 10 min.

const RATE_LIMIT = 1
const RATE_WINDOW_SEC = 10 * 60 // 10 minutes

// ── validation ────────────────────────────────────────────────────────────────

const DISTANCE_BANDS = ['under_500m', '500m_1km', '1km_3km', 'over_3km'] as const
const EVENT_TYPES = [
  'large_explosion', 'shockwave', 'smoke_fire',
  'aircraft', 'ground_shook', 'other',
] as const

type DistanceBand = typeof DISTANCE_BANDS[number]
type EventType    = typeof EVENT_TYPES[number]

interface ReportBody {
  lat:           number
  lon:           number
  distance_band: DistanceBand
  event_types:   EventType[]
  session_id:    string
}

function isDistanceBand(v: unknown): v is DistanceBand {
  return DISTANCE_BANDS.includes(v as DistanceBand)
}

function isEventTypeArray(v: unknown): v is EventType[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((item) => EVENT_TYPES.includes(item as EventType))
  )
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Hash IP immediately — never use or store raw IP address
  const ip_hash = await sha256hex(clientIp(req))

  // Durable rate limit (uses hashed IP, not raw)
  const supabase = createServiceClient()
  const limit = await rateLimit(supabase, { bucket: 'public:report', identifier: ip_hash, max: RATE_LIMIT, windowSec: RATE_WINDOW_SEC })
  if (!limit.ok) return tooMany(limit.retryAfter, 'Too many reports. Please wait before submitting again.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { lat, lon, distance_band, event_types, session_id } = body as ReportBody

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return NextResponse.json({ error: 'lat and lon must be numbers' }, { status: 400 })
  }
  if (lat < -90 || lat > 90) {
    return NextResponse.json(
      { error: 'lat must be between -90 and 90' },
      { status: 400 },
    )
  }
  if (lon < -180 || lon > 180) {
    return NextResponse.json(
      { error: 'lon must be between -180 and 180' },
      { status: 400 },
    )
  }
  if (!isDistanceBand(distance_band)) {
    return NextResponse.json({ error: 'Invalid distance_band' }, { status: 400 })
  }
  if (!isEventTypeArray(event_types)) {
    return NextResponse.json({ error: 'event_types must be a non-empty array of valid values' }, { status: 400 })
  }
  if (typeof session_id !== 'string' || session_id.trim().length === 0) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
  }

  // Hash session_id before storage — never persist raw values
  const session_hash = await sha256hex(session_id)

  // Abuse blocklist (set by an admin in the Fraud & Abuse view): a blocked IP/session
  // cannot submit. Generic response — don't reveal the block.
  if (await isBlocked(supabase, ip_hash, session_hash)) {
    return NextResponse.json({ error: 'This submission could not be accepted.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({ lat, lon, distance_band, event_types, session_hash, ip_hash })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to insert report:', error.message)
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id as string })
}
