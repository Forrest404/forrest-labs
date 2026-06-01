import 'server-only'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

// Durable, cross-instance rate limiting backed by the rate_limits table (see migration
// 20260615000000). Use this instead of in-memory Maps, which reset on serverless cold
// starts and don't coordinate across Vercel instances.
//
// Identifiers are hashed before storage so we never persist a raw IP. The limiter FAILS
// OPEN: if the DB check errors, the request is allowed (we never lock out legitimate users
// because of an infra hiccup) — but it's logged.

// Consolidated client-IP extraction (replaces per-route copies). x-forwarded-for is set by
// Vercel; take the first hop.
export function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  return fwd.split(',')[0].trim()
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 32)
}

export interface RateLimitResult { ok: boolean; retryAfter: number }

// Check + consume one unit against `bucket`/`identifier`. `identifier` is hashed here.
export async function rateLimit(
  supabase: any,
  opts: { bucket: string; identifier: string; max: number; windowSec: number },
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_bucket: opts.bucket,
      p_identifier: hash(opts.identifier),
      p_max: opts.max,
      p_window_seconds: opts.windowSec,
    })
    if (error || !data) return { ok: true, retryAfter: 0 } // fail open
    return { ok: !!data.allowed, retryAfter: Number(data.retry_after ?? opts.windowSec) }
  } catch {
    return { ok: true, retryAfter: 0 } // fail open — never block on limiter failure
  }
}

// Convenience: rate-limit by client IP for a bucket.
export async function rateLimitByIp(
  supabase: any, request: NextRequest, bucket: string, max: number, windowSec: number,
): Promise<RateLimitResult> {
  return rateLimit(supabase, { bucket, identifier: clientIp(request), max, windowSec })
}

// Standard 429 with a Retry-After header.
export function tooMany(retryAfter: number, message = 'Too many requests. Please try again later.'): NextResponse {
  const secs = Math.max(1, Math.ceil(retryAfter))
  return NextResponse.json({ error: message }, { status: 429, headers: { 'Retry-After': String(secs) } })
}

// Shared windows.
export const AUTH_MAX = 5
export const AUTH_WINDOW = 15 * 60 // 5 attempts / 15 min
export const MUTATION_MAX = 20
export const MUTATION_WINDOW = 5 * 60 // 20 writes / 5 min
