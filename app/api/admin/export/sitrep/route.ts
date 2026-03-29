import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

interface SitrepBody {
  title: string
  period_start: string
  period_end: string
  include_ai_summary: boolean
}

interface RegionCounts {
  beirut: number
  south: number
  bekaa: number
  sidon: number
  other: number
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: SitrepBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { title, period_start, period_end, include_ai_summary } = body

  if (!title || !period_start || !period_end) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Step 1 — Fetch data for the period
  const [
    { data: clusters },
    { count: totalReports },
    { data: warnings },
  ] = await Promise.all([
    supabase
      .from('clusters')
      .select(
        `
        id, status, confidence_score,
        report_count, centroid_lat,
        centroid_lon, location_name,
        created_at, dominant_event_types,
        ai_reasoning, source_name,
        display_radius_metres
      `,
      )
      .in('status', ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified'])
      .gte('created_at', period_start)
      .lte('created_at', period_end)
      .order('created_at', { ascending: false }),
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', period_start)
      .lte('created_at', period_end),
    supabase
      .from('warning_clusters')
      .select('id, status, location_name, warning_count, created_at')
      .gte('created_at', period_start)
      .lte('created_at', period_end),
  ])

  // Step 2 — Calculate stats
  const byRegion: RegionCounts = {
    beirut: 0,
    south: 0,
    bekaa: 0,
    sidon: 0,
    other: 0,
  }

  clusters?.forEach((c) => {
    if (
      c.centroid_lat > 33.7 &&
      c.centroid_lat < 34.0 &&
      c.centroid_lon > 35.4 &&
      c.centroid_lon < 35.6
    )
      byRegion.beirut++
    else if (c.centroid_lat < 33.5 && c.centroid_lon < 35.5) byRegion.south++
    else if (c.centroid_lon > 35.7) byRegion.bekaa++
    else if (c.centroid_lat > 33.4 && c.centroid_lat < 33.7) byRegion.sidon++
    else byRegion.other++
  })

  const bySource = {
    civilian: clusters?.filter((c) => !c.source_name).length ?? 0,
    news:
      clusters?.filter(
        (c) =>
          c.source_name &&
          !['Lebanese MoPH', 'OCHA Lebanon', 'UNIFIL'].includes(c.source_name as string),
      ).length ?? 0,
    official:
      clusters?.filter((c) =>
        ['Lebanese MoPH', 'OCHA Lebanon', 'UNIFIL'].includes((c.source_name as string) ?? ''),
      ).length ?? 0,
  }

  const avgConfidence = clusters?.length
    ? Math.round(clusters.reduce((s, c) => s + (c.confidence_score as number), 0) / clusters.length)
    : 0

  // Step 3 — AI narrative (if requested)
  let aiNarrative: string | null = null

  if (include_ai_summary && clusters?.length) {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content:
              `Write a 3-paragraph situation report narrative for Lebanon from ` +
              period_start +
              ` to ` +
              period_end +
              `.\n\nData:\n- Total confirmed incidents: ` +
              clusters.length +
              `\n- Total civilian reports: ` +
              totalReports +
              `\n- Active warnings: ` +
              (warnings?.length ?? 0) +
              `\n- By region: Beirut ` +
              byRegion.beirut +
              `, South Lebanon ` +
              byRegion.south +
              `, Bekaa ` +
              byRegion.bekaa +
              `, Sidon ` +
              byRegion.sidon +
              `\n- By source: Civilian ` +
              bySource.civilian +
              `, News ` +
              bySource.news +
              `, Official ` +
              bySource.official +
              `\n\nWrite in the style of a UN OCHA flash update. Factual, concise, no speculation. Focus on civilian impact and geographic distribution. Do not invent details not in the data.`,
          },
        ],
      }),
    })
    const aiData = await aiRes.json()
    aiNarrative = aiData.content?.[0]?.text ?? null
  }

  // Step 4 — Build and store report
  const reportData = {
    title,
    period_start,
    period_end,
    total_incidents: clusters?.length ?? 0,
    total_reports: totalReports ?? 0,
    total_warnings: warnings?.length ?? 0,
    by_region: byRegion,
    by_source: bySource,
    avg_confidence: avgConfidence,
    ai_narrative: aiNarrative,
    incidents: clusters?.map((c) => ({
      id: c.id,
      location: c.location_name,
      lat: c.centroid_lat,
      lon: c.centroid_lon,
      confidence: c.confidence_score,
      reports: c.report_count,
      types: c.dominant_event_types,
      source: c.source_name ?? 'civilian',
      time: c.created_at,
    })),
    warnings: warnings?.map((w) => ({
      id: w.id,
      location: w.location_name,
      reports: w.warning_count,
      status: w.status,
      time: w.created_at,
    })),
  }

  await supabase.from('situation_reports').insert({
    title,
    period_start,
    period_end,
    cluster_ids: clusters?.map((c) => c.id) ?? [],
    summary: aiNarrative?.slice(0, 300) ?? null,
    generated_by: 'founder',
    format: 'json',
    data: reportData,
  })

  return NextResponse.json(reportData)
}
