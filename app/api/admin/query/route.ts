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
  dominant_event_types: string[]
}

function classifyRegion(lat: number, lon: number): string {
  if (lat > 33.8 && lon > 35.4 && lon < 35.6) return 'Beirut'
  if (lat < 33.4) return 'South Lebanon'
  if (lon > 35.8) return 'Bekaa Valley'
  if (lat > 33.4 && lat < 33.7 && lon < 35.5) return 'Sidon area'
  return 'Other'
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
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 86400000).toISOString()
  const twoDaysAgo = new Date(now.getTime() - 172800000).toISOString()

  let totalReports = 0
  let reportsToday = 0
  let reportsPrevDay = 0
  let confirmed = 0
  let autoConfirmed = 0
  let pendingReview = 0
  let discarded = 0
  let activeWarnings = 0
  let conversions = 0
  let recentClusters: ClusterRow[] = []

  try {
    const [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10] = await Promise.all([
      supabase.from('reports').select('*', { count: 'exact', head: true }),
      supabase.from('reports').select('*', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
      supabase.from('reports').select('*', { count: 'exact', head: true }).gte('created_at', twoDaysAgo).lt('created_at', oneDayAgo),
      supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
      supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('status', 'auto_confirmed'),
      supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('clusters').select('*', { count: 'exact', head: true }).eq('status', 'discarded'),
      supabase.from('warning_clusters').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('warning_clusters').select('*', { count: 'exact', head: true }).eq('status', 'strike_confirmed'),
      supabase.from('clusters')
        .select('id, status, confidence_score, report_count, centroid_lat, centroid_lon, location_name, created_at, dominant_event_types')
        .in('status', ['confirmed', 'auto_confirmed'])
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    totalReports = r1.count ?? 0
    reportsToday = r2.count ?? 0
    reportsPrevDay = r3.count ?? 0
    confirmed = r4.count ?? 0
    autoConfirmed = r5.count ?? 0
    pendingReview = r6.count ?? 0
    discarded = r7.count ?? 0
    activeWarnings = r8.count ?? 0
    conversions = r9.count ?? 0
    recentClusters = (r10.data ?? []) as ClusterRow[]
  } catch (err) {
    console.error('[admin/query] Database queries failed:', err)
  }

  // Regional breakdown
  const regions: Record<string, number> = {}
  for (const c of recentClusters) {
    const region = classifyRegion(c.centroid_lat, c.centroid_lon)
    regions[region] = (regions[region] ?? 0) + 1
  }

  const trend = reportsPrevDay > 0
    ? Math.round(((reportsToday - reportsPrevDay) / reportsPrevDay) * 100)
    : 0

  const clusterSummary = recentClusters
    .slice(0, 20)
    .map(
      (c) =>
        `- ${c.location_name || c.centroid_lat.toFixed(3) + ',' + c.centroid_lon.toFixed(3)}: ${c.report_count} reports, ${c.confidence_score}% confidence, ${new Date(c.created_at).toLocaleDateString()}`,
    )
    .join('\n') || 'No data available'

  const regionalBreakdown = Object.entries(regions)
    .map(([r, n]) => `${r}: ${n} incidents`)
    .join('\n') || 'No regional data'

  let answer = 'Unable to process query. Try again.'

  try {
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
        system: `You are an intelligence analyst assistant for Forrest Labs. You analyse civilian safety data from Lebanon to help humanitarian responders.

CURRENT DATA SUMMARY:
Total reports: ${totalReports}
Reports in last 24h: ${reportsToday}
Reports in previous 24h: ${reportsPrevDay}
Trend: ${trend > 0 ? '+' : ''}${trend}%

Confirmed incidents: ${confirmed}
Auto-confirmed: ${autoConfirmed}
Pending review: ${pendingReview}
Discarded: ${discarded}

Active evacuation warnings: ${activeWarnings}
Warning-to-strike conversions: ${conversions}

REGIONAL BREAKDOWN:
${regionalBreakdown}

RECENT CONFIRMED INCIDENTS (last 20):
${clusterSummary}

Answer the analyst's question directly and factually. If the data does not support a confident answer, say so clearly and explain what additional data would be needed. Never invent numbers. Keep answers under 200 words.`,
        messages: [{ role: 'user', content: question }],
      }),
    })

    if (!aiRes.ok) {
      console.error('[admin/query] Claude API error:', aiRes.status, await aiRes.text())
    } else {
      const aiData = await aiRes.json()
      answer = (aiData.content?.[0]?.text as string) ?? 'Unable to process query. Try again.'
    }
  } catch (err) {
    console.error('[admin/query] Claude API call failed:', err)
  }

  return NextResponse.json({
    answer,
    question,
    context: {
      total_reports: totalReports,
      confirmed,
      auto_confirmed: autoConfirmed,
      pending: pendingReview,
      warnings: activeWarnings,
    },
  })
}
