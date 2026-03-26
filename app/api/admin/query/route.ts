import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

interface ClusterRow {
  location_name: string | null
  centroid_lat: number
  centroid_lon: number
  report_count: number
  confidence_score: number
  created_at: string
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { question?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { question } = body
  if (!question || typeof question !== 'string' || question.length > 500) {
    return NextResponse.json({ error: 'Question required (max 500 chars)' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const [
    { count: totalReports },
    { count: confirmedClusters },
    { count: pendingClusters },
    { count: activeWarnings },
    { data: recentClusters },
  ] = await Promise.all([
    supabase.from('reports').select('*', { count: 'exact', head: true }),
    supabase
      .from('clusters')
      .select('*', { count: 'exact', head: true })
      .in('status', ['confirmed', 'auto_confirmed']),
    supabase
      .from('clusters')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_review'),
    supabase
      .from('warning_clusters')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('clusters')
      .select('id, status, confidence_score, report_count, centroid_lat, centroid_lon, location_name, created_at, dominant_event_types')
      .in('status', ['confirmed', 'auto_confirmed'])
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const clusterSummary = (recentClusters as ClusterRow[] | null)
    ?.map(
      (c) =>
        `- ${c.location_name || c.centroid_lat.toFixed(3) + ',' + c.centroid_lon.toFixed(3)}: ${c.report_count} reports, ${c.confidence_score}% confidence, ${new Date(c.created_at).toLocaleDateString()}`,
    )
    .join('\n') ?? 'No data available'

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `You are an intelligence analyst assistant for Forrest Labs, a civilian safety reporting system monitoring Lebanon. You answer questions about the incident data concisely and factually.

Current system state:
- Total reports: ${totalReports}
- Confirmed incidents: ${confirmedClusters}
- Pending review: ${pendingClusters}
- Active warnings: ${activeWarnings}

Recent confirmed incidents:
${clusterSummary}

Answer the analyst's question directly and concisely. If you cannot answer from the available data, say so clearly. Never make up numbers. Keep answers under 150 words.`,
      messages: [{ role: 'user', content: question }],
    }),
  })

  const aiData = await aiRes.json()
  const answer = (aiData.content?.[0]?.text as string) ?? 'Unable to process query.'

  return NextResponse.json({
    answer,
    question,
    context: {
      total_reports: totalReports,
      confirmed: confirmedClusters,
      pending: pendingClusters,
      warnings: activeWarnings,
    },
  })
}
