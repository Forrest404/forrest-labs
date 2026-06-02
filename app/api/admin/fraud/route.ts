import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/admin/fraud — surfaces existing fraud/abuse signals (no recomputation):
//  - flagged_clusters: low fraud_score or low source-diversity (gamed) clusters
//  - auto_discarded: recently auto-discarded clusters, with ai_concerns as the "why"
//  - high_volume: sessions/IPs that submitted abnormally many reports (fraud_volume RPC),
//    each annotated with its current block/flag state
//  - blocklist: current flag/block entries
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createServiceClient()
  const FRAUD_FIELDS = 'id, status, location_name, centroid_lat, centroid_lon, report_count, unique_ips, unique_sessions, fraud_score, confidence_score, ai_concerns, created_at'
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  // Gamed/low-quality clusters: lowest fraud_score first, excluding already-discarded
  // (those appear under auto_discarded). Diversity ratio is computed in the UI from the
  // unique_ips/sessions vs report_count that already exist.
  const flaggedP = supabase.from('clusters').select(FRAUD_FIELDS)
    .neq('status', 'discarded')
    .order('fraud_score', { ascending: true, nullsFirst: false })
    .limit(40)

  // Recently auto-discarded clusters — the "why" is ai_concerns + the low scores.
  const discardedP = supabase.from('clusters').select(FRAUD_FIELDS)
    .eq('status', 'discarded')
    .order('created_at', { ascending: false })
    .limit(30)

  const volumeP = supabase.rpc('fraud_volume', { p_since: weekAgo, p_min: 5 })
  const blockedP = supabase.from('blocked_identifiers')
    .select('id, identifier_type, identifier_hash, action, reason, reviewed, created_at')
    .order('created_at', { ascending: false })

  const [flagged, discarded, volume, blocked] = await Promise.all([flaggedP, discardedP, volumeP, blockedP])

  // Annotate each high-volume identifier with its current blocklist state.
  const blockedRows = blocked.data ?? []
  const stateByHash = new Map<string, { action: string; reviewed: boolean }>()
  for (const b of blockedRows) stateByHash.set(b.identifier_hash, { action: b.action, reviewed: b.reviewed })
  const high_volume = (volume.data ?? []).map((v: any) => ({
    identifier_type: v.identifier_type,
    identifier_hash: v.identifier_hash,
    count: Number(v.cnt),
    last_at: v.last_at,
    state: stateByHash.get(v.identifier_hash)?.action ?? null,
  }))

  return NextResponse.json({
    flagged_clusters: flagged.data ?? [],
    auto_discarded: discarded.data ?? [],
    high_volume,
    blocklist: blockedRows,
    volume_available: !volume.error, // false if the fraud_volume migration isn't applied yet
  }, { headers: { 'Cache-Control': 'no-store' } })
}
