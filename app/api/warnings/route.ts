import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

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

const warningRateLimitStore = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMIT = 1
const RATE_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

// ── validation ────────────────────────────────────────────────────────────────

const WARNING_TYPES = [
  'official_order', 'phone_call', 'community_warning',
  'leaflet_drop', 'other',
] as const

type WarningType = typeof WARNING_TYPES[number]

interface WarningBody {
  lat: number
  lon: number
  warning_type: WarningType
  source_detail?: string
  session_id: string
}

function isWarningType(v: unknown): v is WarningType {
  return WARNING_TYPES.includes(v as WarningType)
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Hash IP immediately — never use or store raw IP address
  const ip_hash = await sha256hex(clientIp(req))

  // Rate limit check (uses hashed IP, not raw)
  const now = Date.now()
  const existing = warningRateLimitStore.get(ip_hash)

  if (existing) {
    if (now < existing.resetAt) {
      if (existing.count >= RATE_LIMIT) {
        return NextResponse.json(
          { error: 'Too many warnings. Please wait before submitting again.' },
          { status: 429 },
        )
      }
      existing.count++
    } else {
      warningRateLimitStore.set(ip_hash, { count: 1, resetAt: now + RATE_WINDOW_MS })
    }
  } else {
    warningRateLimitStore.set(ip_hash, { count: 1, resetAt: now + RATE_WINDOW_MS })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { lat, lon, warning_type, source_detail, session_id } = body as WarningBody

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return NextResponse.json({ error: 'lat and lon must be numbers' }, { status: 400 })
  }
  if (lat < -90 || lat > 90) {
    return NextResponse.json({ error: 'lat must be between -90 and 90' }, { status: 400 })
  }
  if (lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'lon must be between -180 and 180' }, { status: 400 })
  }
  if (!isWarningType(warning_type)) {
    return NextResponse.json({ error: 'Invalid warning_type' }, { status: 400 })
  }
  if (typeof session_id !== 'string' || session_id.trim().length === 0) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
  }
  if (source_detail !== undefined && source_detail !== null) {
    if (typeof source_detail !== 'string' || source_detail.length > 200) {
      return NextResponse.json(
        { error: 'source_detail must be a string of at most 200 characters' },
        { status: 400 },
      )
    }
  }

  // Hash session_id before storage — never persist raw values
  const session_hash = await sha256hex(session_id)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('warnings')
    .insert({
      lat,
      lon,
      warning_type,
      source_detail: source_detail ?? null,
      session_hash,
      ip_hash,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to insert warning:', error.message)
    return NextResponse.json({ error: 'Failed to save warning' }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id as string })
}
