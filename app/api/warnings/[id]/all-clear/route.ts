import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid warning cluster ID' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { session_id } = body as { session_id: string }
  if (typeof session_id !== 'string' || session_id.trim().length === 0) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch the warning cluster
  const { data: cluster, error: fetchError } = await supabase
    .from('warning_clusters')
    .select('id, status, all_clear_votes, location_name')
    .eq('id', id)
    .single()

  if (fetchError || !cluster) {
    return NextResponse.json({ error: 'Warning cluster not found' }, { status: 404 })
  }

  if (cluster.status !== 'active') {
    return NextResponse.json({ error: 'Warning is not active' }, { status: 400 })
  }

  // Increment all_clear_votes
  const newVotes = (cluster.all_clear_votes as number) + 1

  if (newVotes >= 5) {
    // Threshold reached — mark as all clear
    const { error: updateError } = await supabase
      .from('warning_clusters')
      .update({
        all_clear_votes: newVotes,
        status: 'all_clear',
        all_clear_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      console.error('Failed to update warning cluster:', updateError.message)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }

    // Send ntfy notification
    const ntfyChannel = process.env.NTFY_CHANNEL
    if (ntfyChannel) {
      const location = (cluster.location_name as string) ?? 'Unknown location'
      await fetch(`https://ntfy.sh/${ntfyChannel}`, {
        method: 'POST',
        headers: {
          'Title': 'Forrest Labs — All clear',
          'Tags': 'white_check_mark',
          'Priority': 'default',
          'Content-Type': 'text/plain',
        },
        body: `All clear reported — ${location}`,
      }).catch(() => {})
    }
  } else {
    // Just increment
    const { error: updateError } = await supabase
      .from('warning_clusters')
      .update({ all_clear_votes: newVotes })
      .eq('id', id)

    if (updateError) {
      console.error('Failed to update warning cluster:', updateError.message)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, votes: newVotes })
}
