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
    const [newsRes, detectRes] = await Promise.all([
      fetch(`${supabaseUrl}/functions/v1/fetch-news`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: '{}',
      }),
      fetch(`${supabaseUrl}/functions/v1/detect-strikes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: '{}',
      }),
    ])

    const [newsData, detectData] = await Promise.all([
      newsRes.json() as Promise<{ processed?: number }>,
      detectRes.json() as Promise<{ auto_confirmed?: number; boosted?: number }>,
    ])

    return NextResponse.json({
      success: true,
      news_fetched: newsData.processed ?? 0,
      strikes_detected: detectData.auto_confirmed ?? 0,
      clusters_boosted: detectData.boosted ?? 0,
    })
  } catch (error) {
    console.error('[admin/detect] Detection failed:', error)
    return NextResponse.json({ error: 'Detection failed' }, { status: 500 })
  }
}
