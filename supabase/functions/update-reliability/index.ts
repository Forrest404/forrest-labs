import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { cluster_id: string; action: 'confirmed' | 'rejected' }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { cluster_id, action } = body
  if (!cluster_id || !action) {
    return new Response(JSON.stringify({ error: 'cluster_id and action required' }), { status: 400 })
  }

  // Get all reports for this cluster
  const { data: reports } = await supabase
    .from('reports')
    .select('session_hash')
    .eq('cluster_id', cluster_id)

  if (!reports || reports.length === 0) {
    return new Response(JSON.stringify({ updated: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get unique session hashes
  const sessionHashes = [...new Set(reports.map((r) => r.session_hash as string))]
  let updated = 0

  for (const sessionHash of sessionHashes) {
    // Fetch existing record
    const { data: existing } = await supabase
      .from('source_reliability')
      .select('*')
      .eq('session_hash', sessionHash)
      .single()

    const totalReports = (existing?.total_reports ?? 0) + 1
    const confirmedReports = (existing?.confirmed_reports ?? 0) + (action === 'confirmed' ? 1 : 0)
    const rejectedReports = (existing?.rejected_reports ?? 0) + (action === 'rejected' ? 1 : 0)
    const reliabilityScore = (confirmedReports / totalReports) * 100
    const flagged = totalReports >= 5 && rejectedReports / totalReports > 0.7
    const flagReason = flagged ? `High rejection rate: ${rejectedReports}/${totalReports}` : null

    await supabase.from('source_reliability').upsert(
      {
        session_hash: sessionHash,
        last_seen: new Date().toISOString(),
        total_reports: totalReports,
        confirmed_reports: confirmedReports,
        rejected_reports: rejectedReports,
        reliability_score: Math.round(reliabilityScore * 10) / 10,
        flagged,
        flag_reason: flagReason,
      },
      { onConflict: 'session_hash' },
    )

    updated++
  }

  return new Response(JSON.stringify({ updated, session_hashes: sessionHashes.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
