import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, clearCookieOnResponse } from '@/lib/admin/auth'
import { writeAuditLog } from '@/lib/admin/audit'

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)

  if (session) {
    await writeAuditLog({
      action: 'admin_logout',
      entityType: 'auth',
      sessionId: session.sessionId,
      notes: 'Admin logged out',
    })
  }

  const response = NextResponse.json({ success: true })
  clearCookieOnResponse(response as unknown as Response)
  return response
}
