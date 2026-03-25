import { createClient } from 'npm:@supabase/supabase-js@2'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Warning {
  id: string
  lat: number
  lon: number
  warning_type: string
  session_hash: string
  ip_hash: string
  created_at: string
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

// ── Centroid (3D Cartesian average) ───────────────────────────────────────────

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
  warnings: Warning[],
  centroid: { lat: number; lon: number },
): number {
  if (warnings.length < 2) return 0
  const distances = warnings.map((w) =>
    haversineMetres(w.lat, w.lon, centroid.lat, centroid.lon)
  )
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length
  const variance = distances.reduce(
    (sum, d) => sum + Math.pow(d - mean, 2),
    0,
  ) / distances.length
  return Math.sqrt(variance)
}

// ── Dominant warning type ─────────────────────────────────────────────────────

function getDominantWarningType(warnings: Warning[]): string {
  const counts: Record<string, number> = {}
  for (const w of warnings) {
    counts[w.warning_type] = (counts[w.warning_type] ?? 0) + 1
  }
  let best = ''
  let bestCount = 0
  for (const [type, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = type
      bestCount = count
    }
  }
  return best
}

// ── Confidence score (3-part) ─────────────────────────────────────────────────

const TYPE_SCORES: Record<string, number> = {
  official_order: 100,
  phone_call: 90,
  leaflet_drop: 85,
  community_warning: 70,
  other: 50,
}

function calculateConfidence(
  warningCount: number,
  spreadMetres: number,
  dominantType: string,
): number {
  const countScore = Math.min(warningCount / 8, 1.0) * 100
  const spreadScore = Math.min(spreadMetres / 300, 1.0) * 100
  const typeScore = TYPE_SCORES[dominantType] ?? 50

  const confidence = countScore * 0.4 + spreadScore * 0.3 + typeScore * 0.3
  return Math.min(Math.max(Math.round(confidence), 0), 100)
}

// ── Clustering algorithm (greedy, 300 m radius + 3 hour window) ──────────────

function clusterWarnings(warnings: Warning[]): Array<{
  warnings: Warning[]
  centroid: { lat: number; lon: number }
}> {
  const groups: Warning[][] = []

  for (const warning of warnings) {
    let assigned = false
    for (const group of groups) {
      const centroid = calculateCentroid(
        group.map((w) => ({ lat: w.lat, lon: w.lon })),
      )
      const dist = haversineMetres(
        warning.lat, warning.lon,
        centroid.lat, centroid.lon,
      )
      const firstTime = new Date(group[0].created_at).getTime()
      const thisTime = new Date(warning.created_at).getTime()
      const timeDiff = Math.abs(thisTime - firstTime) / 1000

      if (dist <= 300 && timeDiff <= 10800) {
        group.push(warning)
        assigned = true
        break
      }
    }
    if (!assigned) groups.push([warning])
  }

  return groups
    .filter((g) => g.length >= 3)
    .map((groupWarnings) => ({
      warnings: groupWarnings,
      centroid: calculateCentroid(
        groupWarnings.map((w) => ({ lat: w.lat, lon: w.lon })),
      ),
    }))
}

// ── Reverse geocode ───────────────────────────────────────────────────────────

async function getLocationName(lat: number, lon: number): Promise<string> {
  try {
    const token = Deno.env.get('NEXT_PUBLIC_MAPBOX_TOKEN')
    if (!token) return `${lat.toFixed(3)}, ${lon.toFixed(3)}`
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json` +
      `?access_token=${token}&types=neighborhood,locality,place&limit=1`
    const res = await fetch(url)
    const data = await res.json()
    return data.features?.[0]?.place_name ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`
  } catch {
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`
  }
}

// ── Push notification ─────────────────────────────────────────────────────────

const NTFY_CHANNEL = Deno.env.get('NTFY_CHANNEL')

async function sendWarningNotification(
  locationName: string,
  warningCount: number,
  dominantType: string,
  confidence: number,
): Promise<void> {
  if (!NTFY_CHANNEL) return

  const typeLabel = dominantType.replace(/_/g, ' ')

  await fetch(`https://ntfy.sh/${NTFY_CHANNEL}`, {
    method: 'POST',
    headers: {
      'Title': 'Forrest Labs — Evacuation warning',
      'Priority': 'urgent',
      'Tags': 'warning',
      'Content-Type': 'text/plain',
    },
    body: `${locationName} — ${warningCount} people received warnings · ${typeLabel}\nConfidence: ${confidence}/100`,
  })
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Fetch pending warnings from last 6 hours
    const sixHoursAgo = new Date(
      Date.now() - 6 * 60 * 60 * 1000,
    ).toISOString()

    const { data: warnings, error: warningsError } = await supabase
      .from('warnings')
      .select('*')
      .eq('status', 'pending')
      .gte('created_at', sixHoursAgo)
      .order('created_at', { ascending: true })

    if (warningsError) throw warningsError

    if (!warnings || warnings.length < 3) {
      // Also run expiry before returning
      await supabase
        .from('warning_clusters')
        .update({ status: 'expired' })
        .lt('expires_at', new Date().toISOString())
        .eq('status', 'active')

      return new Response(
        JSON.stringify({
          processed: 0,
          message: 'Not enough warnings to cluster',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 2. Run clustering
    const clusteredGroups = clusterWarnings(warnings as Warning[])

    // 3. Process each cluster
    let processed = 0

    for (const { warnings: groupWarnings, centroid } of clusteredGroups) {
      const warningIds = groupWarnings.map((w) => w.id)

      const spread = calculateSpread(groupWarnings, centroid)
      const dominantType = getDominantWarningType(groupWarnings)
      const confidence = calculateConfidence(
        groupWarnings.length,
        spread,
        dominantType,
      )

      const status = confidence >= 40 ? 'active' : 'discarded'

      // Reverse geocode
      const locationName = await getLocationName(centroid.lat, centroid.lon)

      // Check for existing warning cluster with overlapping warning_ids
      const { data: existing } = await supabase
        .from('warning_clusters')
        .select('id, warning_ids')
        .overlaps('warning_ids', warningIds)
        .maybeSingle()

      const expiresAt = new Date(
        Date.now() + 6 * 60 * 60 * 1000,
      ).toISOString()

      const upsertPayload = {
        centroid_lat: centroid.lat,
        centroid_lon: centroid.lon,
        warning_ids: warningIds,
        warning_count: groupWarnings.length,
        spread_metres: spread,
        dominant_warning_type: dominantType,
        confidence_score: confidence,
        status,
        location_name: locationName,
        expires_at: expiresAt,
      }

      if (existing) {
        await supabase
          .from('warning_clusters')
          .update(upsertPayload)
          .eq('id', existing.id)
      } else {
        const { error: insertError } = await supabase
          .from('warning_clusters')
          .insert(upsertPayload)
        if (insertError) throw insertError
      }

      // Update warnings to point to this cluster
      await supabase
        .from('warnings')
        .update({ status: 'clustered' })
        .in('id', warningIds)

      // Send push notification for active warning clusters
      if (status === 'active') {
        try {
          await sendWarningNotification(
            locationName,
            groupWarnings.length,
            dominantType,
            confidence,
          )
        } catch (notifyError) {
          console.error('Warning push notification failed:', notifyError)
        }
      }

      processed++
    }

    // 4. Auto-expire old active warning clusters
    await supabase
      .from('warning_clusters')
      .update({ status: 'expired' })
      .lt('expires_at', new Date().toISOString())
      .eq('status', 'active')

    return new Response(
      JSON.stringify({
        processed,
        total_warnings: warnings.length,
        clusters_found: clusteredGroups.length,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Warning clustering error:', error)
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
})
