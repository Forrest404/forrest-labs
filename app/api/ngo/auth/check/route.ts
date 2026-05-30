import { NextRequest, NextResponse } from 'next/server'
import { getNgoSession } from '@/lib/ngo-auth'

export async function GET(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  return NextResponse.json({ role: session.role, org_id: session.orgId })
}
