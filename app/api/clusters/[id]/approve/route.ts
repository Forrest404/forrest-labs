import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { NextRequest } from 'next/server'

async function isAuthorised(request: NextRequest): Promise<boolean> {
  // Check admin session cookie first
  const session = await getSessionFromRequest(request)
  if (session) return true

  // Fall back to review secret key
  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  const secret = process.env.REVIEW_SECRET_KEY
  if (!key || !secret) return false

  const keyBuf = Buffer.from(key)
  const secretBuf = Buffer.from(secret)
  if (keyBuf.length !== secretBuf.length) return false

  try {
    return timingSafeEqual(keyBuf, secretBuf)
  } catch {
    return false
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!(await isAuthorised(request))) {
    return new Response(
      buildHtml('#450a0a', '#fca5a5', '✗ Unauthorised', 'Invalid or missing credentials.'),
      { status: 401, headers: { 'Content-Type': 'text/html' } },
    )
  }

  // Validate cluster ID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return new Response(
      buildHtml('#450a0a', '#fca5a5', '✗ Invalid ID', 'Cluster ID is not valid.'),
      { status: 400, headers: { 'Content-Type': 'text/html' } },
    )
  }

  const supabase = createServiceClient()

  const { data: cluster, error: fetchError } = await supabase
    .from('clusters')
    .select('id, status, display_radius_metres, centroid_lat, centroid_lon')
    .eq('id', id)
    .single()

  if (fetchError || !cluster) {
    return new Response(
      buildHtml('#450a0a', '#fca5a5', '✗ Not found', 'Cluster not found.'),
      { status: 404, headers: { 'Content-Type': 'text/html' } },
    )
  }

  if (cluster.status === 'confirmed' || cluster.status === 'auto_confirmed') {
    return new Response(
      buildHtml('#052e16', '#86efac', '✓ Already confirmed', 'This cluster was already confirmed.'),
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )
  }

  if (cluster.status === 'discarded') {
    return new Response(
      buildHtml('#450a0a', '#fca5a5', '✗ Already rejected', 'This cluster was already rejected.'),
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )
  }

  // Update cluster status
  const { error: updateError } = await supabase
    .from('clusters')
    .update({
      status: 'confirmed',
      reviewed_by: 'founder',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    console.error('[approve] Failed to update cluster:', updateError.message)
    return new Response(
      buildHtml('#450a0a', '#fca5a5', '✗ Error', 'Failed to update cluster. Please try again.'),
      { status: 500, headers: { 'Content-Type': 'text/html' } },
    )
  }

  // Reverse-geocode
  const locationName = await getLocationName(cluster.centroid_lat, cluster.centroid_lon)

  // Create alert record
  const { error: alertError } = await supabase
    .from('alerts')
    .upsert(
      {
        cluster_id: id,
        confirmed_by: 'founder',
        radius_metres: cluster.display_radius_metres,
        location_name: locationName,
      },
      { onConflict: 'cluster_id', ignoreDuplicates: true },
    )

  if (alertError) {
    console.error('[approve] Alert upsert failed:', alertError.message)
  }

  // Store location name on cluster (non-fatal)
  const { error: locError } = await supabase
    .from('clusters')
    .update({ location_name: locationName })
    .eq('id', id)

  if (locError) {
    console.error('[approve] Location update failed:', locError.message)
  }

  // Ntfy confirmation
  const ntfyChannel = process.env.NTFY_CHANNEL
  if (ntfyChannel) {
    await fetch(`https://ntfy.sh/${ntfyChannel}`, {
      method: 'POST',
      headers: {
        'Title': 'Forrest Labs - Confirmed',
        'Tags': 'white_check_mark',
        'Priority': 'low',
        'Content-Type': 'text/plain',
      },
      body: `CONFIRMED by founder\n${locationName}\nCluster ${id.slice(0, 8)}`,
    }).catch((err) => {
      console.error('[approve] ntfy notification failed:', err)
    })
  }

  return new Response(
    buildHtml(
      '#052e16',
      '#86efac',
      '✓ Confirmed',
      'Cluster confirmed. The live map has been updated. Aid organisations have been notified.',
    ),
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )
}

async function getLocationName(lat: number, lon: number): Promise<string> {
  try {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return `${lat.toFixed(3)}, ${lon.toFixed(3)}`
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json` +
      `?access_token=${token}&types=neighborhood,locality,place&limit=1`
    const res = await fetch(url)
    const data = (await res.json()) as { features: { place_name: string }[] }
    return data.features?.[0]?.place_name ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`
  } catch {
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`
  }
}

function buildHtml(bg: string, textColor: string, heading: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Forrest Labs</title>
</head>
<body style="
  font-family: system-ui, sans-serif;
  background: ${bg};
  color: ${textColor};
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  margin: 0;
  padding: 40px 20px;
  box-sizing: border-box;
  text-align: center;
  flex-direction: column;
  gap: 12px;
">
  <p style="font-size: 16px; letter-spacing: 0.2em; opacity: 0.6; margin: 0;">FORREST LABS</p>
  <h1 style="font-size: 28px; font-weight: 600; margin: 0;">${heading}</h1>
  <p style="font-size: 16px; opacity: 0.8; margin: 0; max-width: 300px; line-height: 1.6;">${message}</p>
  <a href="/map" style="margin-top: 20px; color: ${textColor}; font-size: 16px; text-decoration: none; border: 1px solid ${textColor}; padding: 10px 20px; border-radius: 8px; opacity: 0.7;">View live map →</a>
</body>
</html>`
}
