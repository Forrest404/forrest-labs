import { NextRequest, NextResponse } from 'next/server'

// Safe request-body reading. App Router route handlers have NO default body-size limit, so
// a client can stream a very large JSON body into memory. readJsonBody streams with a hard
// byte cap (aborting early once exceeded) and parses defensively, so a route can never be
// forced to buffer or parse an oversized/malformed payload.
//
// Usage:
//   const parsed = await readJsonBody(request)        // 64 KB default
//   if (!parsed.ok) return parsed.response            // 413 (too large) or 400 (malformed)
//   const body = parsed.data

export const DEFAULT_MAX_BODY = 64 * 1024        // 64 KB — plenty for form-style JSON
export const LARGE_MAX_BODY = 256 * 1024         // 256 KB — for GeoJSON areas / reports

type JsonResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

export async function readJsonBody<T = any>(request: NextRequest, maxBytes: number = DEFAULT_MAX_BODY): Promise<JsonResult<T>> {
  const tooLarge = () => ({ ok: false as const, response: NextResponse.json({ error: 'Request body too large' }, { status: 413 }) })
  const malformed = () => ({ ok: false as const, response: NextResponse.json({ error: 'Invalid request' }, { status: 400 }) })

  // Fast reject on a declared oversize length.
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge()

  const reader = request.body?.getReader()
  if (!reader) return malformed() // no body to parse

  let received = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        received += value.length
        if (received > maxBytes) { try { await reader.cancel() } catch {} return tooLarge() }
        chunks.push(value)
      }
    }
  } catch {
    return malformed()
  }

  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return malformed()
  try {
    return { ok: true, data: JSON.parse(text) as T }
  } catch {
    return malformed()
  }
}
