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

// ── AI analysis ───────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

async function analyseWithClaude(
  cluster: {
    centroid_lat: number
    centroid_lon: number
    report_count: number
    spread_metres: number
    time_window_seconds: number
    unique_sessions: number
    unique_ips: number
    dominant_event_types: string[]
    confidence_score: number
    fraud_score: number
    has_approved_media: boolean
    in_lebanon: boolean
  },
): Promise<{
  confidence_adjustment: number
  reasoning: string
  concerns: string[]
  recommendation: 'confirm' | 'review' | 'discard'
}> {
  const prompt = `Review this cluster of civilian incident reports and assess whether it represents a genuine incident.

CLUSTER DATA:
- Location: ${cluster.centroid_lat.toFixed(4)}, ${cluster.centroid_lon.toFixed(4)}
- Report count: ${cluster.report_count}
- Geographic spread: ${Math.round(cluster.spread_metres)}m
- Time window: ${cluster.time_window_seconds}s
- Unique devices: ${cluster.unique_sessions} of ${cluster.report_count}
- Unique networks: ${cluster.unique_ips} of ${cluster.report_count}
- Event types: ${cluster.dominant_event_types.join(', ')}
- Pre-calculated confidence: ${cluster.confidence_score}/100
- Fraud score: ${cluster.fraud_score}/100
- Has verified media: ${cluster.has_approved_media}
- Known conflict zone: ${cluster.in_lebanon}

FRAUD INDICATORS:
- Device diversity: ${Math.round((cluster.unique_sessions / cluster.report_count) * 100)}%
- Network diversity: ${Math.round((cluster.unique_ips / cluster.report_count) * 100)}%
- Avg seconds between reports: ${Math.round(cluster.time_window_seconds / Math.max(cluster.report_count - 1, 1))}

Return a JSON object with exactly these fields:
{
  "confidence_adjustment": <float 0.7-1.3>,
  "reasoning": "<two sentences max>",
  "concerns": ["<specific concern>"],
  "recommendation": "<confirm|review|discard>"
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `You are a humanitarian analyst reviewing civilian incident reports from a conflict zone. Be concise and factual. Return only valid JSON with no markdown formatting, no code blocks, no preamble.`,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('Anthropic API error body:', errorBody)
    throw new Error(`Anthropic API error: ${response.status} ${errorBody}`)
  }

  const data = await response.json()
  if (!data.content?.[0]?.text) {
    throw new Error('Unexpected Anthropic response shape')
  }
  const text = (data.content[0].text as string).trim()

  // Strip any accidental markdown code blocks
  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()

  const parsed = JSON.parse(cleaned)

  const adjustment = Math.min(
    Math.max(parseFloat(parsed.confidence_adjustment) || 1.0, 0.7),
    1.3,
  )

  const recommendation = ['confirm', 'review', 'discard'].includes(parsed.recommendation)
    ? (parsed.recommendation as 'confirm' | 'review' | 'discard')
    : 'review'

  return {
    confidence_adjustment: adjustment,
    reasoning: String(parsed.reasoning ?? '').slice(0, 500),
    concerns: Array.isArray(parsed.concerns)
      ? parsed.concerns.slice(0, 5).map(String)
      : [],
    recommendation,
  }
}

// ── Push notification ─────────────────────────────────────────────────────────

const NTFY_CHANNEL = Deno.env.get('NTFY_CHANNEL')
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''
const REVIEW_SECRET = Deno.env.get('REVIEW_SECRET_KEY')

async function sendPushNotification(
  clusterId: string,
  centroidLat: number,
  centroidLon: number,
  reportCount: number,
  confidenceScore: number,
  dominantTypes: string[],
  reasoning: string | null,
  concerns: string[],
  status: string,
): Promise<void> {
  if (!NTFY_CHANNEL || !REVIEW_SECRET || !APP_URL) {
    console.log('Push notification skipped: missing env vars')
    return
  }

  const isAuto = status === 'auto_confirmed'

  const location = `${centroidLat.toFixed(3)}, ${centroidLon.toFixed(3)}`
  const types = dominantTypes.join(' · ').replace(/_/g, ' ')
  const reasoningSentence = reasoning ? reasoning.split('.')[0] + '.' : ''

  const body = isAuto
    ? `${location} · ${reportCount} reports · ${confidenceScore}% confidence\n${types}${reasoningSentence ? '\n' + reasoningSentence : ''}`
    : `${location} · ${reportCount} reports · ${confidenceScore}% confidence\n${types}${reasoningSentence ? '\n' + reasoningSentence : ''}${concerns.length > 0 ? '\nConcerns: ' + concerns.join(', ') : ''}`

  const headers: Record<string, string> = {
    'Title': isAuto ? 'Forrest Labs - Auto-confirmed' : 'Forrest Labs - Review needed',
    'Priority': confidenceScore >= 85 ? 'urgent' : 'high',
    'Tags': isAuto ? 'white_check_mark' : 'warning',
    'Content-Type': 'text/plain',
  }

  if (!isAuto) {
    const approveUrl = `${APP_URL}/api/clusters/${clusterId}/approve?key=${REVIEW_SECRET}`
    const rejectUrl = `${APP_URL}/api/clusters/${clusterId}/reject?key=${REVIEW_SECRET}`
    const triageUrl = `${APP_URL}/admin/triage`
    headers['Actions'] =
      `http, Approve, ${approveUrl}, method=GET, clear=true; ` +
      `http, Reject, ${rejectUrl}, method=GET, clear=true; ` +
      `view, Open triage, ${triageUrl}`
  }

  await fetch(`https://ntfy.sh/${NTFY_CHANNEL}`, {
    method: 'POST',
    headers,
    body,
  }).catch((err) => {
    console.error('Push notification failed:', err)
  })
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

      // 4. Determine initial status from calculated score
      let status: string
      if (scores.confidence_score >= 85) status = 'auto_confirmed'
      else if (scores.confidence_score >= 30) status = 'pending_review'
      else status = 'discarded'

      // 4b. AI analysis for non-discarded clusters
      let ai_reasoning: string | null = null
      let ai_concerns: string[] = []
      let final_confidence = scores.confidence_score
      let final_status = status

      if (status === 'pending_review' || status === 'auto_confirmed') {
        try {
          const inLebanon = (
            centroid.lat >= 33.05 &&
            centroid.lat <= 34.69 &&
            centroid.lon >= 35.10 &&
            centroid.lon <= 36.62
          )
          const hasApprovedMedia = clusterReports.some(
            (r) => r.media_status === 'approved',
          )

          const aiResult = await analyseWithClaude({
            centroid_lat: centroid.lat,
            centroid_lon: centroid.lon,
            report_count: clusterReports.length,
            spread_metres: spread,
            time_window_seconds: timeWindow,
            unique_sessions: uniqueSessions,
            unique_ips: uniqueIps,
            dominant_event_types: dominantTypes,
            confidence_score: scores.confidence_score,
            fraud_score: scores.fraud_score,
            has_approved_media: hasApprovedMedia,
            in_lebanon: inLebanon,
          })

          // Apply Claude's adjustment to the score
          final_confidence = Math.min(
            Math.max(
              Math.round(scores.confidence_score * aiResult.confidence_adjustment),
              0,
            ),
            100,
          )

          ai_reasoning = aiResult.reasoning
          ai_concerns = aiResult.concerns

          // Re-threshold based on adjusted score.
          // Claude can only discard if the adjusted score also falls below 30 —
          // the founder always has final say on borderline clusters.
          if (final_confidence >= 85) {
            final_status = 'auto_confirmed'
          } else if (final_confidence >= 30) {
            final_status = 'pending_review'
          } else {
            final_status = 'discarded'
          }
        } catch (aiError) {
          // AI analysis is non-fatal — proceed with pre-calculated score
          console.error('AI analysis failed:', aiError)
          ai_reasoning = 'AI analysis unavailable — using calculated score only'
        }
      }

      // 5. Check for existing cluster with overlapping reports
      const { data: existing } = await supabase
        .from('clusters')
        .select('id, report_ids')
        .overlaps('report_ids', reportIds)
        .maybeSingle()

      let clusterId: string

      const upsertPayload = {
        ...scores,
        confidence_score: final_confidence,
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
        status: final_status,
        ai_reasoning,
        ai_concerns,
      }

      if (existing) {
        // Update existing cluster
        const { data: updated } = await supabase
          .from('clusters')
          .update(upsertPayload)
          .eq('id', existing.id)
          .select('id')
          .single()
        clusterId = updated?.id ?? existing.id
      } else {
        // Insert new cluster
        const { data: inserted, error: insertError } = await supabase
          .from('clusters')
          .insert(upsertPayload)
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

      // 7. If auto_confirmed, create alert and check for matching warning zones
      if (final_status === 'auto_confirmed') {
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

        // Convert active warning zones within 500m to strike_confirmed
        const { data: activeWarnings } = await supabase
          .from('warning_clusters')
          .select('id, centroid_lat, centroid_lon')
          .eq('status', 'active')

        if (activeWarnings) {
          for (const w of activeWarnings) {
            const dist = haversineMetres(
              centroid.lat, centroid.lon,
              w.centroid_lat, w.centroid_lon,
            )
            if (dist <= 500) {
              await supabase
                .from('warning_clusters')
                .update({
                  status: 'strike_confirmed',
                  converted_to_strike: clusterId,
                })
                .eq('id', w.id)
            }
          }
        }
      }

      // 8. Push notification for non-discarded clusters
      if (final_status === 'pending_review' || final_status === 'auto_confirmed') {
        try {
          await sendPushNotification(
            clusterId,
            centroid.lat,
            centroid.lon,
            clusterReports.length,
            final_confidence,
            dominantTypes,
            ai_reasoning,
            ai_concerns,
            final_status,
          )
        } catch (notifyError) {
          console.error('Push notification failed:', notifyError)
        }
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
