import { createClient } from 'npm:@supabase/supabase-js@2'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Report {
  id: string
  lat: number
  lon: number
  distance_band: string
  event_types: string[]
  session_hash: string
  ip_hash: string
  media_status: string
  created_at: string
}

interface Cluster {
  centroid_lat: number
  centroid_lon: number
  report_ids: string[]
  spread_metres: number
  time_window_seconds: number
  unique_sessions: number
  unique_ips: number
  dominant_event_types: string[]
  display_radius_metres: number
  report_count: number
}

// ── Haversine ─────────────────────────────────────────────────────────────────

function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Centroid (3D Cartesian average, not naive lat/lon average) ────────────────

function calculateCentroid(
  points: Array<{ lat: number; lon: number }>,
): { lat: number; lon: number } {
  let x = 0, y = 0, z = 0
  for (const p of points) {
    const latR = p.lat * Math.PI / 180
    const lonR = p.lon * Math.PI / 180
    x += Math.cos(latR) * Math.cos(lonR)
    y += Math.cos(latR) * Math.sin(lonR)
    z += Math.sin(latR)
  }
  const n = points.length
  x /= n; y /= n; z /= n
  const lon = Math.atan2(y, x) * 180 / Math.PI
  const hyp = Math.sqrt(x * x + y * y)
  const lat = Math.atan2(z, hyp) * 180 / Math.PI
  return { lat, lon }
}

// ── Spread (std dev of distances from centroid) ───────────────────────────────

function calculateSpread(
  reports: Report[],
  centroid: { lat: number; lon: number },
): number {
  if (reports.length < 2) return 0
  const distances = reports.map((r) =>
    haversineMetres(r.lat, r.lon, centroid.lat, centroid.lon)
  )
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length
  const variance = distances.reduce(
    (sum, d) => sum + Math.pow(d - mean, 2),
    0,
  ) / distances.length
  return Math.sqrt(variance)
}

// ── Display radius ────────────────────────────────────────────────────────────

function calculateDisplayRadius(reports: Report[]): number {
  const bandValues: Record<string, number> = {
    'under_500m': 300,
    '500m_1km': 750,
    '1km_3km': 2000,
    'over_3km': 4000,
  }
  const values = reports.map((r) => bandValues[r.distance_band] ?? 750)
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return Math.min(Math.max(avg, 150), 5000)
}

// ── Dominant event types ──────────────────────────────────────────────────────

function getDominantEventTypes(
  reports: Report[],
  topN: number = 3,
): string[] {
  const counts: Record<string, number> = {}
  for (const r of reports) {
    for (const et of r.event_types) {
      counts[et] = (counts[et] ?? 0) + 1
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([type]) => type)
}

// ── 5-part confidence score with fraud multiplier ────────────────────────────

function calculateConfidence(
  cluster: Cluster & { centroid_lat: number; centroid_lon: number },
  reports: Report[],
): {
  confidence_score: number
  volume_subscore: number
  diversity_subscore: number
  timing_subscore: number
  context_subscore: number
  media_subscore: number
  fraud_score: number
} {
  const {
    report_count,
    spread_metres,
    time_window_seconds,
    unique_sessions,
    unique_ips,
    centroid_lat,
    centroid_lon,
  } = cluster

  // VOLUME SUBSCORE (weight 25%) — 12 reports saturates this part
  const volume_subscore = Math.min(report_count / 12, 1.0) * 100

  // DIVERSITY SUBSCORE (weight 25%)
  const spread_norm = Math.min(spread_metres / 400, 1.0)
  const session_ratio = unique_sessions / report_count
  const ip_ratio = unique_ips / report_count
  const diversity_subscore = (
    spread_norm * 0.5 +
    session_ratio * 0.3 +
    ip_ratio * 0.2
  ) * 100

  // TIMING SUBSCORE (weight 20%) — piecewise ramp
  let timing_subscore: number
  const t = time_window_seconds
  if (t < 10) timing_subscore = 10
  else if (t < 120) timing_subscore = (t / 120) * 70
  else if (t <= 600) timing_subscore = 100
  else if (t <= 1800) timing_subscore = 100 - ((t - 600) / 1200) * 40
  else timing_subscore = 60

  // CONTEXT SUBSCORE (weight 15%) — Lebanon bounding box
  const inLebanon = (
    centroid_lat >= 33.05 &&
    centroid_lat <= 34.69 &&
    centroid_lon >= 35.10 &&
    centroid_lon <= 36.62
  )
  const context_subscore = inLebanon ? 90 : 50

  // MEDIA SUBSCORE (weight 15%)
  const hasApprovedMedia = reports.some((r) => r.media_status === 'approved')
  const hasProcessingMedia = reports.some((r) => r.media_status === 'processing')
  const media_subscore = hasApprovedMedia ? 90 : hasProcessingMedia ? 60 : 50

  // FRAUD SCORE (multiplier on final score)
  const ip_score = ip_ratio * 100
  const session_score = session_ratio * 100
  const avg_interval = time_window_seconds / Math.max(report_count - 1, 1)
  const timing_entropy = t < 10
    ? 0
    : Math.min(avg_interval / 60, 1.0) * 100
  const fraud_score = (
    ip_score * 0.35 +
    session_score * 0.35 +
    timing_entropy * 0.30
  )
  const fraud_multiplier = fraud_score / 100

  // FINAL SCORE
  const raw_score = (
    volume_subscore * 0.25 +
    diversity_subscore * 0.25 +
    timing_subscore * 0.20 +
    context_subscore * 0.15 +
    media_subscore * 0.15
  )
  const confidence_score = Math.min(
    Math.max(Math.round(raw_score * fraud_multiplier), 0),
    100,
  )

  return {
    confidence_score,
    volume_subscore: Math.round(volume_subscore),
    diversity_subscore: Math.round(diversity_subscore),
    timing_subscore: Math.round(timing_subscore),
    context_subscore: Math.round(context_subscore),
    media_subscore: Math.round(media_subscore),
    fraud_score: Math.round(fraud_score),
  }
}

// ── Clustering algorithm (greedy, 300 m radius + 5400 s window) ───────────────

function clusterReports(reports: Report[]): Array<{
  reports: Report[]
  centroid: { lat: number; lon: number }
}> {
  const groups: Report[][] = []

  for (const report of reports) {
    let assigned = false
    for (const group of groups) {
      const centroid = calculateCentroid(
        group.map((r) => ({ lat: r.lat, lon: r.lon })),
      )
      const dist = haversineMetres(
        report.lat, report.lon,
        centroid.lat, centroid.lon,
      )
      const firstTime = new Date(group[0].created_at).getTime()
      const thisTime = new Date(report.created_at).getTime()
      const timeDiff = Math.abs(thisTime - firstTime) / 1000

      if (dist <= 300 && timeDiff <= 5400) {
        group.push(report)
        assigned = true
        break
      }
    }
    if (!assigned) groups.push([report])
  }

  return groups
    .filter((g) => g.length >= 2)
    .map((groupReports) => ({
      reports: groupReports,
      centroid: calculateCentroid(
        groupReports.map((r) => ({ lat: r.lat, lon: r.lon })),
      ),
    }))
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Fetch pending reports from last 3 hours
    const threeHoursAgo = new Date(
      Date.now() - 3 * 60 * 60 * 1000,
    ).toISOString()

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .eq('status', 'pending')
      .gte('created_at', threeHoursAgo)
      .order('created_at', { ascending: true })

    if (reportsError) throw reportsError

    if (!reports || reports.length < 2) {
      return new Response(
        JSON.stringify({
          processed: 0,
          message: 'Not enough reports to cluster',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 2. Run clustering
    const clusteredGroups = clusterReports(reports as Report[])

    // 3. Process each cluster
    let processed = 0

    for (const { reports: clusterReports, centroid } of clusteredGroups) {
      const reportIds = clusterReports.map((r) => r.id)
      const firstReport = clusterReports[0]
      const lastReport = clusterReports[clusterReports.length - 1]

      const timeWindow = Math.round(
        (new Date(lastReport.created_at).getTime() -
          new Date(firstReport.created_at).getTime()) / 1000,
      )

      const uniqueSessions = new Set(
        clusterReports.map((r) => r.session_hash),
      ).size
      const uniqueIps = new Set(
        clusterReports.map((r) => r.ip_hash),
      ).size

      const spread = calculateSpread(clusterReports, centroid)
      const displayRadius = calculateDisplayRadius(clusterReports)
      const dominantTypes = getDominantEventTypes(clusterReports)

      const clusterData: Cluster & { centroid_lat: number; centroid_lon: number } = {
        report_count: clusterReports.length,
        spread_metres: spread,
        time_window_seconds: timeWindow,
        unique_sessions: uniqueSessions,
        unique_ips: uniqueIps,
        centroid_lat: centroid.lat,
        centroid_lon: centroid.lon,
        display_radius_metres: displayRadius,
        dominant_event_types: dominantTypes,
        report_ids: reportIds,
      }

      const scores = calculateConfidence(clusterData, clusterReports)

      // 4. Determine status
      let status: string
      if (scores.confidence_score >= 85) status = 'auto_confirmed'
      else if (scores.confidence_score >= 50) status = 'pending_review'
      else status = 'discarded'

      // 5. Check for existing cluster with overlapping reports
      const { data: existing } = await supabase
        .from('clusters')
        .select('id, report_ids')
        .overlaps('report_ids', reportIds)
        .maybeSingle()

      let clusterId: string

      if (existing) {
        // Update existing cluster
        const { data: updated } = await supabase
          .from('clusters')
          .update({
            ...scores,
            centroid_lat: centroid.lat,
            centroid_lon: centroid.lon,
            report_ids: reportIds,
            report_count: clusterReports.length,
            spread_metres: spread,
            time_window_seconds: timeWindow,
            unique_sessions: uniqueSessions,
            unique_ips: uniqueIps,
            dominant_event_types: dominantTypes,
            display_radius_metres: displayRadius,
            status,
          })
          .eq('id', existing.id)
          .select('id')
          .single()
        clusterId = updated?.id ?? existing.id
      } else {
        // Insert new cluster
        const { data: inserted, error: insertError } = await supabase
          .from('clusters')
          .insert({
            ...scores,
            centroid_lat: centroid.lat,
            centroid_lon: centroid.lon,
            report_ids: reportIds,
            report_count: clusterReports.length,
            spread_metres: spread,
            time_window_seconds: timeWindow,
            unique_sessions: uniqueSessions,
            unique_ips: uniqueIps,
            dominant_event_types: dominantTypes,
            display_radius_metres: displayRadius,
            status,
          })
          .select('id')
          .single()
        if (insertError) throw insertError
        clusterId = inserted!.id
      }

      // 6. Update reports to point to this cluster
      await supabase
        .from('reports')
        .update({ cluster_id: clusterId, status: 'clustered' })
        .in('id', reportIds)

      // 7. If auto_confirmed, create alert
      if (status === 'auto_confirmed') {
        await supabase
          .from('alerts')
          .upsert(
            {
              cluster_id: clusterId,
              confirmed_by: 'ai_auto',
              radius_metres: displayRadius,
            },
            { onConflict: 'cluster_id', ignoreDuplicates: true },
          )
      }

      processed++
    }

    return new Response(
      JSON.stringify({
        processed,
        total_reports: reports.length,
        clusters_found: clusteredGroups.length,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Clustering error:', error)
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
})
