import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'fl_admin_session'
const NGO_COOKIE_NAME = 'fl_ngo_session'
const PUBLIC_PATHS = ['/admin/login', '/api/admin/auth/login']
const NGO_PUBLIC_PATHS = [
  '/ngo/login',
  '/ngo/signup',
  // Token-gated public pages + endpoints (invite accept, password reset). The token is
  // the credential; the SEND endpoint (/api/ngo/users/invite) stays session-gated.
  '/ngo/invite',
  '/ngo/reset',
  '/api/ngo/auth/invite',
  '/api/ngo/auth/reset',
  '/api/ngo/auth/login',
  '/api/ngo/auth/signup',
  // Scheduler-invoked; gated by their own ?key=REVIEW_SECRET_KEY check, so they must
  // bypass the cookie gate (the cron caller has no NGO session). NOTE: panic-escalate
  // was previously missing here, so the cron was redirected to login and unacknowledged
  // duress alerts never auto-widened (finding M1).
  '/api/ngo/safety/escalate',
  '/api/ngo/safety/panic-escalate',
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

  // Platform-operator console: gated by the SAME admin cookie as /admin (it is a
  // tier above all NGOs; NGO users never hold fl_admin_session). Treated exactly
  // like the admin gate below.
  const isPlatform = pathname.startsWith('/platform') || pathname.startsWith('/api/platform')
  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
  // Note: '/ngo-review'.startsWith('/ngo') is true, so check ngo-review first.
  const isNgoReview = pathname.startsWith('/ngo-review') || pathname.startsWith('/api/ngo-review')
  const isNgo = !isNgoReview && (pathname.startsWith('/ngo') || pathname.startsWith('/api/ngo'))

  if (!isPlatform && !isAdmin && !isNgoReview && !isNgo) {
    return NextResponse.next()
  }

  // ── Admin + Platform (existing behaviour; both gated by fl_admin_session) ───
  if (isAdmin || isPlatform) {
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
    '/platform',
    '/platform/:path*',
    '/api/platform/:path*',
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
