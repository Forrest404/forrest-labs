import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NTFY_CHANNEL = Deno.env.get('NTFY_CHANNEL')

interface ClusterRow {
  id: string
  centroid_lat: number
  centroid_lon: number
  confidence_score: number
  report_count: number
  display_radius_metres: number
  location_name: string | null
  ai_reasoning: string | null
  status: string
}

interface NewsRow {
  id: string
  source: string
  title: string
  url: string
  summary: string | null
  location_name: string | null
  location_lat: number | null
  location_lon: number | null
  ai_relevance: number
  casualty_count: number | null
  event_type: string | null
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const results = { checked: 0, auto_confirmed: 0, boosted: 0 }

  const twoHoursAgo = new Date(Date.now() - 7200000).toISOString()

  // STEP 1 — Check pending clusters that have news article matches
  const { data: pendingClusters } = await supabase
    .from('clusters')
    .select('*')
    .eq('status', 'pending_review')
    .gte('created_at', twoHoursAgo)

  for (const cluster of (pendingClusters ?? []) as ClusterRow[]) {
    results.checked++

    const { data: nearbyNews } = await supabase
      .from('news_articles')
      .select('*')
      .not('location_lat', 'is', null)
      .gte('published_at', twoHoursAgo)
      .gte('ai_relevance', 0.6)

    const matching = ((nearbyNews ?? []) as NewsRow[]).filter((article) => {
      if (!article.location_lat || !article.location_lon) return false
      const dlat = article.location_lat - cluster.centroid_lat
      const dlon = article.location_lon - cluster.centroid_lon
      const km = Math.sqrt(dlat * dlat + dlon * dlon) * 111
      return km < 8
    })

    if (matching.length === 0) continue

    const hasOfficialSource = matching.some((a) =>
      ['Lebanese MoPH', 'OCHA Lebanon', 'UNIFIL'].includes(a.source),
    )
    const hasMultipleMediaSources = new Set(matching.map((a) => a.source)).size >= 2

    let scoreBoost = 15
    if (hasOfficialSource) scoreBoost = 45
    else if (hasMultipleMediaSources) scoreBoost = 25

    const newScore = Math.min((cluster.confidence_score ?? 50) + scoreBoost, 100)

    if (newScore >= 85) {
      const sourceNames = [...new Set(matching.map((a) => a.source))].join(', ')

      await supabase
        .from('clusters')
        .update({
          status: hasOfficialSource ? 'official_verified' : 'news_verified',
          confidence_score: newScore,
          source_name: sourceNames,
          source_url: matching[0].url,
          auto_detected_at: new Date().toISOString(),
          ai_reasoning: (cluster.ai_reasoning ?? '') + ` [Auto-verified by: ${sourceNames}]`,
          reviewed_by: 'auto_detection',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', cluster.id)

      await supabase
        .from('alerts')
        .upsert(
          {
            cluster_id: cluster.id,
            confirmed_by: 'auto_detection',
            radius_metres: cluster.display_radius_metres,
            location_name: cluster.location_name,
          },
          { onConflict: 'cluster_id', ignoreDuplicates: true },
        )

      for (const article of matching) {
        await supabase
          .from('news_articles')
          .update({ linked_cluster_id: cluster.id, status: 'linked' })
          .eq('id', article.id)
      }

      if (NTFY_CHANNEL) {
        await fetch(`https://ntfy.sh/${NTFY_CHANNEL}`, {
          method: 'POST',
          headers: {
            'Title': `⚡ AUTO-VERIFIED: ${cluster.location_name ?? 'Strike detected'}`,
            'Priority': hasOfficialSource ? 'urgent' : 'high',
            'Tags': 'white_check_mark',
            'Content-Type': 'text/plain',
          },
          body: [
            `${newScore}% confidence · ${sourceNames}`,
            `${cluster.report_count} civilian reports`,
            'Published to live map automatically',
          ].join('\n'),
        }).catch((err) => console.error('ntfy failed:', err))
      }

      results.auto_confirmed++
    } else if (newScore > cluster.confidence_score) {
      await supabase
        .from('clusters')
        .update({
          confidence_score: newScore,
          source_name: matching.map((a) => a.source).join(', '),
        })
        .eq('id', cluster.id)

      results.boosted++
    }
  }

  // STEP 2 — Check for breaking news with no matching civilian reports (official only)
  const { data: unlinkedOfficial } = await supabase
    .from('news_articles')
    .select('*')
    .eq('status', 'new')
    .not('location_lat', 'is', null)
    .gte('ai_relevance', 0.8)
    .in('source', ['Lebanese MoPH', 'OCHA Lebanon', 'UNIFIL'])
    .gte('published_at', twoHoursAgo)

  for (const article of (unlinkedOfficial ?? []) as NewsRow[]) {
    if (!article.location_lat || !article.location_lon) continue

    // Check if cluster already exists nearby
    const { data: existing } = await supabase
      .from('clusters')
      .select('id')
      .gte('centroid_lat', article.location_lat - 0.09)
      .lte('centroid_lat', article.location_lat + 0.09)
      .gte('centroid_lon', article.location_lon - 0.09)
      .lte('centroid_lon', article.location_lon + 0.09)
      .gte('created_at', twoHoursAgo)
      .limit(1)

    if (existing?.length) continue

    const { data: newCluster } = await supabase
      .from('clusters')
      .insert({
        centroid_lat: article.location_lat,
        centroid_lon: article.location_lon,
        report_ids: [],
        report_count: 0,
        spread_metres: 0,
        time_window_seconds: 0,
        unique_sessions: 0,
        unique_ips: 0,
        confidence_score: 90,
        volume_subscore: 0,
        diversity_subscore: 0,
        timing_subscore: 100,
        context_subscore: 90,
        media_subscore: 0,
        fraud_score: 100,
        status: 'official_verified',
        dominant_event_types: [article.event_type ?? 'airstrike'],
        ai_reasoning: `Auto-detected from ${article.source}: ${article.summary ?? article.title}`,
        ai_concerns: [],
        display_radius_metres: 400,
        location_name: article.location_name,
        source_type: 'official',
        source_url: article.url,
        source_name: article.source,
        auto_detected_at: new Date().toISOString(),
        reviewed_by: 'auto_detection',
        reviewed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!newCluster) continue

    await supabase
      .from('alerts')
      .upsert(
        {
          cluster_id: newCluster.id as string,
          confirmed_by: article.source,
          radius_metres: 400,
          location_name: article.location_name,
        },
        { onConflict: 'cluster_id', ignoreDuplicates: true },
      )

    await supabase
      .from('news_articles')
      .update({ linked_cluster_id: newCluster.id, status: 'linked' })
      .eq('id', article.id)

    results.auto_confirmed++

    if (NTFY_CHANNEL) {
      await fetch(`https://ntfy.sh/${NTFY_CHANNEL}`, {
        method: 'POST',
        headers: {
          'Title': `📡 Breaking: ${article.location_name ?? 'Lebanon'}`,
          'Priority': 'urgent',
          'Tags': 'satellite',
          'Content-Type': 'text/plain',
        },
        body: [
          `${article.source} · 90% confidence`,
          article.summary ?? article.title,
          article.casualty_count ? `${article.casualty_count} casualties` : '',
          'Added to live map automatically',
        ]
          .filter(Boolean)
          .join('\n'),
      }).catch((err) => console.error('ntfy failed:', err))
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  })
})
