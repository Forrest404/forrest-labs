import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'fl_admin_session'
const NGO_COOKIE_NAME = 'fl_ngo_session'
const PUBLIC_PATHS = ['/admin/login', '/api/admin/auth/login']
const NGO_PUBLIC_PATHS = [
  '/ngo/login',
  '/ngo/signup',
  '/api/ngo/auth/login',
  '/api/ngo/auth/signup',
  // Scheduler-invoked; gated by its own ?key=REVIEW_SECRET_KEY check, so it must
  // bypass the cookie gate (the cron caller has no NGO session).
  '/api/ngo/safety/escalate',
]

function getJwtSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret) {
    console.error('[middleware] ADMIN_JWT_SECRET is not set')
    return new TextEncoder().encode('MISSING-SECRET-WILL-REJECT-ALL')
  }
  return new TextEncoder().encode(secret)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
  // Note: '/ngo-review'.startsWith('/ngo') is true, so check ngo-review first.
  const isNgoReview = pathname.startsWith('/ngo-review') || pathname.startsWith('/api/ngo-review')
  const isNgo = !isNgoReview && (pathname.startsWith('/ngo') || pathname.startsWith('/api/ngo'))

  if (!isAdmin && !isNgoReview && !isNgo) {
    return NextResponse.next()
  }

  // ── Admin (existing behaviour, unchanged) ──────────────────────────────────
  if (isAdmin) {
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
      return NextResponse.next()
    }

    const token = request.cookies.get(COOKIE_NAME)?.value

    if (!token) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }

    try {
      await jwtVerify(token, getJwtSecret())
      return NextResponse.next()
    } catch {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('expired', '1')
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete(COOKIE_NAME)
      return response
    }
  }

  // ── NGO approvals (Nour staff; gated by the existing admin cookie) ─────────
  if (isNgoReview) {
    const token = request.cookies.get(COOKIE_NAME)?.value
    if (!token) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
    try {
      await jwtVerify(token, getJwtSecret())
      return NextResponse.next()
    } catch {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('expired', '1')
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete(COOKIE_NAME)
      return response
    }
  }

  // ── NGO platform (fl_ngo_session) ──────────────────────────────────────────
  if (NGO_PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const ngoToken = request.cookies.get(NGO_COOKIE_NAME)?.value
  if (!ngoToken) {
    const loginUrl = new URL('/ngo/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    const { payload } = await jwtVerify(ngoToken, getJwtSecret())
    if (payload.type !== 'ngo') throw new Error('wrong token type')

    // Role routing: field coordinators are limited to their mobile surface.
    if (
      payload.role === 'field_coordinator' &&
      pathname.startsWith('/ngo/') &&
      !pathname.startsWith('/ngo/field')
    ) {
      return NextResponse.redirect(new URL('/ngo/field', request.url))
    }
    return NextResponse.next()
  } catch {
    const loginUrl = new URL('/ngo/login', request.url)
    loginUrl.searchParams.set('expired', '1')
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete(NGO_COOKIE_NAME)
    return response
  }
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/ngo',
    '/ngo/:path*',
    '/ngo-review',
    '/ngo-review/:path*',
    '/api/ngo/:path*',
    '/api/ngo-review/:path*',
  ],
}
