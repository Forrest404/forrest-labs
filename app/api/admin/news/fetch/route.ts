import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-news`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: '{}',
    })
    const data = (await res.json()) as { processed?: number }
    return NextResponse.json({
      success: true,
      processed: data.processed ?? 0,
    })
  } catch (error) {
    console.error('[admin/news/fetch] Failed:', error)
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
  }
}
