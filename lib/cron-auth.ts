import 'server-only'
import { timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

// Shared auth for scheduler-invoked endpoints (pg_cron / Vercel cron): missed-check-in
// escalation, panic auto-escalation, new-incident scan. Accepts the shared REVIEW_SECRET_KEY
// either as an `x-cron-key` request HEADER (preferred — keeps the secret out of URLs and out
// of pg_net's persisted request log) or as a `?key=` query param (back-compat for existing
// callers and manual admin runs). Timing-safe compare; false if either side is missing.
export function cronAuthOk(request: NextRequest): boolean {
  const secret = process.env.REVIEW_SECRET_KEY
  if (!secret) return false
  const provided = request.headers.get('x-cron-key') ?? new URL(request.url).searchParams.get('key')
  if (!provided) return false
  const a = Buffer.from(provided), b = Buffer.from(secret)
  if (a.length !== b.length) return false
  try { return timingSafeEqual(a, b) } catch { return false }
}
