import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const key = searchParams.get('key')
  const reviewSecret = process.env.REVIEW_SECRET_KEY

  // Validate secret key (timing-safe comparison)
  if (!key || !reviewSecret) {
    return new Response(
      buildHtml(
        '#450a0a', '#fca5a5',
        '✗ Unauthorised',
        'Invalid or missing review key.',
      ),
      { status: 401, headers: { 'Content-Type': 'text/html' } },
    )
  }
  try {
    if (!timingSafeEqual(Buffer.from(key), Buffer.from(reviewSecret))) {
      return new Response(
        buildHtml(
          '#450a0a', '#fca5a5',
          '✗ Unauthorised',
          'Invalid or missing review key.',
        ),
        { status: 401, headers: { 'Content-Type': 'text/html' } },
      )
    }
  } catch {
    return new Response(
      buildHtml(
        '#450a0a', '#fca5a5',
        '✗ Unauthorised',
        'Invalid or missing review key.',
      ),
      { status: 401, headers: { 'Content-Type': 'text/html' } },
    )
  }

  // Validate cluster ID format (full UUID check)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return new Response(
      buildHtml(
        '#450a0a', '#fca5a5',
        '✗ Invalid ID',
        'Cluster ID is not valid.',
      ),
      { status: 400, headers: { 'Content-Type': 'text/html' } },
    )
  }

  const supabase = createServiceClient()

  // Check cluster exists
  const { data: cluster, error: fetchError } = await supabase
    .from('clusters')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchError || !cluster) {
    return new Response(
      buildHtml(
        '#450a0a', '#fca5a5',
        '✗ Not found',
        'Cluster not found.',
      ),
      { status: 404, headers: { 'Content-Type': 'text/html' } },
    )
  }

  if (cluster.status === 'confirmed' || cluster.status === 'auto_confirmed') {
    return new Response(
      buildHtml(
        '#450a0a', '#fca5a5',
        '✗ Already confirmed',
        'This cluster was already confirmed and cannot be rejected.',
      ),
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )
  }

  if (cluster.status === 'discarded') {
    return new Response(
      buildHtml(
        '#450a0a', '#fca5a5',
        '✗ Already rejected',
        'This cluster was already rejected.',
      ),
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )
  }

  // Update cluster status
  const { error: updateError } = await supabase
    .from('clusters')
    .update({
      status: 'discarded',
      reviewed_by: 'founder',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    console.error('Failed to reject cluster:', updateError.message)
    return new Response(
      buildHtml(
        '#450a0a', '#fca5a5',
        '✗ Error',
        'Failed to update cluster. Please try again.',
      ),
      { status: 500, headers: { 'Content-Type': 'text/html' } },
    )
  }

  // Replace the ntfy notification with a rejected status
  const ntfyChannel = process.env.NTFY_CHANNEL
  if (ntfyChannel) {
    await fetch(`https://ntfy.sh/${ntfyChannel}`, {
      method: 'POST',
      headers: {
        'Title': 'Forrest Labs - Rejected',
        'Tags': 'x',
        'Priority': 'low',
        'Content-Type': 'text/plain',
      },
      body: `REJECTED by founder\nCluster ${id.slice(0, 8)}`,
    }).catch(() => {})
  }

  return new Response(
    buildHtml(
      '#450a0a', '#fca5a5',
      '✗ Rejected',
      'Cluster rejected and removed from the map.',
    ),
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )
}

function buildHtml(
  bg: string,
  textColor: string,
  heading: string,
  message: string,
): string {
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
  <p style="font-size: 16px; letter-spacing: 0.2em; opacity: 0.6; margin: 0;">
    FORREST LABS
  </p>
  <h1 style="font-size: 28px; font-weight: 600; margin: 0;">
    ${heading}
  </h1>
  <p style="font-size: 16px; opacity: 0.8; margin: 0; max-width: 300px; line-height: 1.6;">
    ${message}
  </p>
  <a href="/map" style="
    margin-top: 20px;
    color: ${textColor};
    font-size: 16px;
    text-decoration: none;
    border: 1px solid ${textColor};
    padding: 10px 20px;
    border-radius: 8px;
    opacity: 0.7;
  ">View live map →</a>
</body>
</html>`
}
