import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const NTFY_CHANNEL = Deno.env.get('NTFY_CHANNEL')

// ─── Types ────────────────────────────────────────────────────────────────────

interface RSSItem {
  title: string
  link: string
  description: string
  pub_date: string
}

interface ArticleAnalysis {
  relevance_score: number
  summary: string
  location: string
  lat: number | null
  lon: number | null
  event_type: string
  casualties: number | null
  url?: string
  title?: string
}

interface Feed {
  name: string
  url: string
  filter: string[]
  credibility: 'official' | 'media'
  auto_create: boolean
}

// ─── Feeds ────────────────────────────────────────────────────────────────────

const RSS_FEEDS: Feed[] = [
  {
    name: 'Lebanese MoPH',
    url: 'https://www.moph.gov.lb/en/Pages/rss',
    filter: ['killed', 'injured', 'strike', 'airstrike', 'attack'],
    credibility: 'official',
    auto_create: true,
  },
  {
    name: 'OCHA Lebanon',
    url: 'https://reliefweb.int/country/lbn/rss.xml',
    filter: ['strike', 'killed', 'airstrike', 'attack', 'Lebanon'],
    credibility: 'official',
    auto_create: true,
  },
  {
    name: 'UNIFIL',
    url: 'https://unifil.unmissions.org/rss.xml',
    filter: ['incident', 'firing', 'strike', 'violation', 'Lebanon'],
    credibility: 'official',
    auto_create: true,
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    filter: ['Lebanon', 'Beirut', 'Hezbollah', 'airstrike', 'strike', 'killed'],
    credibility: 'media',
    auto_create: false,
  },
  {
    name: 'Reuters',
    url: 'https://feeds.reuters.com/reuters/METopNews',
    filter: ['Lebanon', 'Beirut', 'airstrike', 'strike', 'killed', 'Hezbollah'],
    credibility: 'media',
    auto_create: false,
  },
  {
    name: 'BBC Middle East',
    url: 'http://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
    filter: ['Lebanon', 'Beirut', 'airstrike', 'strike'],
    credibility: 'media',
    auto_create: false,
  },
]

// ─── RSS Parser ───────────────────────────────────────────────────────────────

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml))) {
    const item = match[1]
    const get = (tag: string) => {
      const m = item.match(
        new RegExp(
          `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|` +
            `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
        ),
      )
      return m ? (m[1] ?? m[2] ?? '').trim() : ''
    }
    items.push({
      title: get('title'),
      link: get('link'),
      description: get('description'),
      pub_date: get('pubDate'),
    })
  }
  return items
}

// ─── Claude Analysis ──────────────────────────────────────────────────────────

async function analyseArticle(
  title: string,
  description: string,
  source: string,
): Promise<ArticleAnalysis> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Analyse this news article about Lebanon. Return ONLY valid JSON, no other text.

Title: ${title}
Text: ${description.slice(0, 500)}
Source: ${source}

Return:
{
  "relevance_score": 0.0-1.0 (how relevant to civilian safety in Lebanon),
  "summary": "one sentence summary",
  "location": "most specific place name mentioned",
  "lat": latitude as number or null,
  "lon": longitude as number or null,
  "event_type": "airstrike|ground_operation|evacuation|casualties|warning|other",
  "casualties": number or null
}

For coordinates use these reference points:
Beirut: 33.8938, 35.5018
South Lebanon: 33.27, 35.20
Nabatieh: 33.3772, 35.4836
Baalbek: 34.0044, 36.2110
Sidon: 33.5631, 35.3714
If location unclear: null for both coords.`,
        },
      ],
    }),
  })
  const data = await res.json()
  const text = (data.content?.[0]?.text as string) ?? '{}'
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim()) as ArticleAnalysis
  } catch {
    return { relevance_score: 0, summary: '', location: '', lat: null, lon: null, event_type: 'other', casualties: null }
  }
}

// ─── Find Nearby Cluster ─────────────────────────────────────────────────────

async function findNearbyCluster(
  supabase: ReturnType<typeof createClient>,
  lat: number | null,
  lon: number | null,
): Promise<{ id: string; confidence: number } | null> {
  if (!lat || !lon) return null

  const oneDayAgo = new Date(Date.now() - 86400000).toISOString()

  const { data } = await supabase
    .from('clusters')
    .select('id, centroid_lat, centroid_lon, status')
    .in('status', ['confirmed', 'auto_confirmed', 'pending_review', 'news_verified', 'official_verified'])
    .gte('created_at', oneDayAgo)

  if (!data?.length) return null

  let best: { id: string; distance: number } | null = null

  for (const cluster of data) {
    const dlat = (cluster.centroid_lat as number) - lat
    const dlon = (cluster.centroid_lon as number) - lon
    const dist = Math.sqrt(dlat * dlat + dlon * dlon) * 111
    if (dist < 10 && (!best || dist < best.distance)) {
      best = { id: cluster.id as string, distance: dist }
    }
  }

  if (!best) return null
  const confidence = Math.max(0, 1 - best.distance / 10)
  return { id: best.id, confidence: Math.round(confidence * 100) }
}

// ─── Alert + Notification Helpers ─────────────────────────────────────────────

async function createAlertRecord(
  supabase: ReturnType<typeof createClient>,
  clusterId: string,
  sourceName: string,
  locationName: string,
): Promise<void> {
  await supabase
    .from('alerts')
    .upsert(
      {
        cluster_id: clusterId,
        confirmed_by: sourceName,
        radius_metres: 400,
        location_name: locationName,
      },
      { onConflict: 'cluster_id', ignoreDuplicates: true },
    )
}

async function sendAutoDetectNotification(
  article: ArticleAnalysis,
  feed: Feed,
  confidence: number,
): Promise<void> {
  if (!NTFY_CHANNEL) return
  await fetch(`https://ntfy.sh/${NTFY_CHANNEL}`, {
    method: 'POST',
    headers: {
      'Title': `⚡ Auto-detected: ${article.location ?? 'Lebanon'}`,
      'Priority': 'high',
      'Tags': 'rotating_light',
      'Content-Type': 'text/plain',
    },
    body: [
      `${feed.name} · ${confidence}% confidence`,
      article.summary ?? article.title ?? '',
      article.casualties ? `${article.casualties} casualties reported` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }).catch((err) => console.error('Auto-detect ntfy failed:', err))
}

// ─── Process Article ──────────────────────────────────────────────────────────

async function processArticle(
  article: ArticleAnalysis & { url: string; title: string; pub_date: string },
  feed: Feed,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  // Store the article regardless
  await supabase.from('news_articles').insert({
    source: feed.name,
    title: article.title,
    url: article.url,
    published_at: article.pub_date || null,
    summary: article.summary,
    location_name: article.location,
    location_lat: article.lat,
    location_lon: article.lon,
    event_type: article.event_type,
    casualty_count: article.casualties,
    ai_relevance: article.relevance_score,
    status: 'new',
  })

  if (!article.lat || !article.lon) return
  if (article.relevance_score < 0.5) return

  const nearby = await findNearbyCluster(supabase, article.lat, article.lon)

  if (nearby) {
    // Boost existing cluster confidence
    const { data: cluster } = await supabase
      .from('clusters')
      .select('confidence_score, status')
      .eq('id', nearby.id)
      .single()

    if (!cluster) return

    const boost = feed.credibility === 'official' ? 40 : 15
    const newScore = Math.min(((cluster.confidence_score as number) ?? 50) + boost, 100)
    const shouldAutoConfirm = newScore >= 85 && (cluster.status as string) === 'pending_review'

    const updatePayload: Record<string, unknown> = {
      confidence_score: newScore,
      source_url: article.url,
      source_name: feed.name,
    }

    if (shouldAutoConfirm) {
      updatePayload.status = feed.credibility === 'official' ? 'official_verified' : 'news_verified'
      updatePayload.auto_detected_at = new Date().toISOString()
      updatePayload.reviewed_by = 'auto_detection'
      updatePayload.reviewed_at = new Date().toISOString()
    }

    await supabase.from('clusters').update(updatePayload).eq('id', nearby.id)

    // Link news article
    await supabase
      .from('news_articles')
      .update({ linked_cluster_id: nearby.id, status: 'linked', match_confidence: nearby.confidence })
      .eq('url', article.url)

    if (shouldAutoConfirm) {
      await createAlertRecord(supabase, nearby.id, feed.name, article.location)
      await sendAutoDetectNotification(article, feed, newScore)
    }

    return
  }

  // Only create new clusters from official sources
  if (!feed.auto_create || feed.credibility !== 'official') return

  const { data: newCluster } = await supabase
    .from('clusters')
    .insert({
      centroid_lat: article.lat,
      centroid_lon: article.lon,
      report_ids: [],
      report_count: 0,
      spread_metres: 500,
      time_window_seconds: 0,
      unique_sessions: 0,
      unique_ips: 0,
      confidence_score: 92,
      volume_subscore: 0,
      diversity_subscore: 0,
      timing_subscore: 100,
      context_subscore: 90,
      media_subscore: 0,
      fraud_score: 100,
      status: 'official_verified',
      dominant_event_types: [article.event_type ?? 'airstrike'],
      ai_reasoning: `Auto-detected from ${feed.name}: ${article.summary}`,
      ai_concerns: [],
      display_radius_metres: 400,
      location_name: article.location,
      source_type: feed.credibility,
      source_url: article.url,
      source_name: feed.name,
      auto_detected_at: new Date().toISOString(),
      reviewed_by: 'auto_detection',
      reviewed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (!newCluster) return

  await createAlertRecord(supabase, newCluster.id as string, feed.name, article.location)

  await supabase
    .from('news_articles')
    .update({ linked_cluster_id: newCluster.id, status: 'linked', match_confidence: 95 })
    .eq('url', article.url)

  await sendAutoDetectNotification(article, feed, 92)
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const allArticles: string[] = []
  let claudeCalls = 0
  const MAX_CLAUDE_CALLS = 5

  for (const feed of RSS_FEEDS) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(feed.url, { signal: controller.signal })
      clearTimeout(timeout)

      if (!res.ok) {
        console.error(`Feed ${feed.name} returned ${res.status}`)
        continue
      }

      const xml = await res.text()
      const items = parseRSS(xml)

      const relevant = items.filter((item) =>
        feed.filter.some((keyword) =>
          (item.title + ' ' + item.description).toLowerCase().includes(keyword.toLowerCase()),
        ),
      )

      for (const item of relevant.slice(0, 5)) {
        if (!item.link) continue

        // Dedup before Claude
        const exists = await supabase.from('news_articles').select('id').eq('url', item.link).single()
        if (exists.data) continue

        if (claudeCalls >= MAX_CLAUDE_CALLS) break

        const analysis = await analyseArticle(item.title, item.description ?? '', feed.name)
        claudeCalls++

        if (analysis.relevance_score < 0.3) continue

        await processArticle(
          { ...analysis, url: item.link, title: item.title, pub_date: item.pub_date },
          feed,
          supabase,
        )

        allArticles.push(item.title)
      }

      if (claudeCalls >= MAX_CLAUDE_CALLS) break
    } catch (err) {
      console.error('Feed error:', feed.name, err)
    }
  }

  return new Response(
    JSON.stringify({ processed: allArticles.length, articles: allArticles }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
