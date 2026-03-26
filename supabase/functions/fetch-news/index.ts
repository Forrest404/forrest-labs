import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

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
}

const RSS_FEEDS = [
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    filter: ['Lebanon', 'Beirut', 'Hezbollah', 'Nabatieh', 'Tyre', 'Sidon', 'Baalbek', 'Litani'],
  },
  {
    name: 'BBC Middle East',
    url: 'http://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
    filter: ['Lebanon', 'Beirut', 'Hezbollah'],
  },
  {
    name: 'Reuters Middle East',
    url: 'https://feeds.reuters.com/reuters/METopNews',
    filter: ['Lebanon', 'Beirut', 'Hezbollah', 'Israeli strike', 'airstrike'],
  },
  {
    name: 'UN OCHA Lebanon',
    url: 'https://reliefweb.int/country/lbn/rss.xml',
    filter: ['Lebanon'],
  },
]

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

async function findNearbyCluster(
  supabase: ReturnType<typeof createClient>,
  lat: number | null,
  lon: number | null,
): Promise<{ id: string; confidence: number } | null> {
  if (!lat || !lon) return null

  const oneDayAgo = new Date(Date.now() - 86400000).toISOString()

  const { data } = await supabase
    .from('clusters')
    .select('id, centroid_lat, centroid_lon')
    .in('status', ['confirmed', 'auto_confirmed'])
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

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const allArticles: string[] = []

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url)
      const xml = await res.text()
      const items = parseRSS(xml)

      const relevant = items.filter((item) =>
        feed.filter.some((keyword) =>
          (item.title + ' ' + item.description).toLowerCase().includes(keyword.toLowerCase()),
        ),
      )

      for (const item of relevant.slice(0, 5)) {
        const exists = await supabase.from('news_articles').select('id').eq('url', item.link).single()
        if (exists.data) continue

        const analysis = await analyseArticle(item.title, item.description ?? '', feed.name)
        if (analysis.relevance_score < 0.3) continue

        const nearbyCluster = await findNearbyCluster(supabase, analysis.lat, analysis.lon)

        await supabase.from('news_articles').insert({
          source: feed.name,
          title: item.title,
          url: item.link,
          published_at: item.pub_date || null,
          summary: analysis.summary,
          location_name: analysis.location,
          location_lat: analysis.lat,
          location_lon: analysis.lon,
          event_type: analysis.event_type,
          casualty_count: analysis.casualties,
          ai_relevance: analysis.relevance_score,
          linked_cluster_id: nearbyCluster?.id ?? null,
          match_confidence: nearbyCluster?.confidence ?? null,
          status: 'new',
        })

        allArticles.push(item.title)
      }
    } catch (err) {
      console.error('Feed error:', feed.name, err)
    }
  }

  return new Response(
    JSON.stringify({ processed: allArticles.length, articles: allArticles }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
