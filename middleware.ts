import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'fl_admin_session'
const PUBLIC_PATHS = ['/admin/login', '/api/admin/auth/login']

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

  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) {
    return NextResponse.next()
  }

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

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
