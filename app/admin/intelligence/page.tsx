'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsArticle {
  id: string
  title: string
  summary: string | null
  source: string
  url: string
  event_type: string
  location_name: string | null
  location_lat: number | null
  location_lon: number | null
  casualty_count: number | null
  ai_relevance_score: number
  linked_cluster_id: string | null
  status: string
  fetched_at: string
}

interface QueryEntry {
  q: string
  a: string
}

interface AutoDetectedCluster {
  id: string
  status: string
  confidence_score: number
  location_name: string | null
  centroid_lat: number
  centroid_lon: number
  created_at: string
  source_name: string | null
  auto_detected_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  if (m < 1) return 'just now'
  if (m < 60) return m + 'm ago'
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

function confColour(score: number): string {
  if (score >= 85) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

const SOURCE_STYLES: Record<string, { bg: string; color: string }> = {
  'Al Jazeera': { bg: 'rgba(248,81,73,0.1)', color: '#f85149' },
  BBC: { bg: 'rgba(88,166,255,0.1)', color: '#58a6ff' },
  Reuters: { bg: 'rgba(63,185,80,0.1)', color: '#3fb950' },
  'UN OCHA': { bg: 'rgba(163,113,247,0.1)', color: '#a371f7' },
}

const EVENT_COLORS: Record<string, string> = {
  airstrike: '#f85149',
  evacuation: '#d29922',
  casualties: '#f85149',
  warning: '#d29922',
  ground_operation: '#a371f7',
}

const FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Linked', value: 'linked' },
  { label: 'Dismissed', value: 'dismissed' },
] as const

const SUGGESTED_QUESTIONS = [
  'How many incidents in the last 7 days?',
  'Which area had the most strikes this week?',
  'How many reports came from Beirut?',
  'How many warnings became confirmed strikes?',
  'What was the highest confidence cluster?',
  'How many civilians reported in the last 24 hours?',
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const router = useRouter()
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [question, setQuestion] = useState('')
  const [querying, setQuerying] = useState(false)
  const [queryHistory, setQueryHistory] = useState<QueryEntry[]>([])
  const [dataContext, setDataContext] = useState<{ confirmed: number; totalReports: number } | null>(null)
  const [autoDetected, setAutoDetected] = useState<AutoDetectedCluster[]>([])

  const fetchArticles = useCallback(async () => {
    setLoading(true)
    try {
      const url = '/api/admin/news' + (filter !== 'all' ? '?status=' + filter : '')
      const res = await fetch(url)
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = (await res.json()) as { articles?: NewsArticle[] }
      setArticles(data.articles ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [filter, router])

  useEffect(() => { fetchArticles() }, [fetchArticles])

  // Fetch data context for query panel
  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => r.json())
      .then((d: { clusters?: { confirmed?: number; auto_confirmed?: number; news_verified?: number; official_verified?: number }; reports?: { total?: number } }) => {
        setDataContext({
          confirmed: (d.clusters?.confirmed ?? 0) + (d.clusters?.auto_confirmed ?? 0) + (d.clusters?.news_verified ?? 0) + (d.clusters?.official_verified ?? 0),
          totalReports: d.reports?.total ?? 0,
        })
      })
      .catch(() => { /* ignore */ })
  }, [])

  // Fetch auto-detected clusters
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/incidents?filter=news_verified&limit=5').then((r) => r.json()).catch(() => ({ clusters: [] })),
      fetch('/api/admin/incidents?filter=official_verified&limit=5').then((r) => r.json()).catch(() => ({ clusters: [] })),
    ]).then(([newsData, officialData]) => {
      const merged = [
        ...((newsData as { clusters?: AutoDetectedCluster[] }).clusters ?? []),
        ...((officialData as { clusters?: AutoDetectedCluster[] }).clusters ?? []),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setAutoDetected(merged)
    })
  }, [])

  async function handleDismiss(id: string) {
    await fetch('/api/admin/news/' + id + '/dismiss', { method: 'POST' })
    setArticles((prev) => prev.filter((a) => a.id !== id))
  }

  async function handleLink(id: string) {
    await fetch('/api/admin/news/' + id + '/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cluster_id: null }),
    })
    fetchArticles()
  }

  async function handleQuery() {
    if (!question.trim() || querying) return
    setQuerying(true)
    const q = question
    setQuestion('')
    try {
      const res = await fetch('/api/admin/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = (await res.json()) as { answer?: string }
      setQueryHistory((prev) => [{ q, a: data.answer ?? 'No response' }, ...prev])
    } catch {
      setQueryHistory((prev) => [{ q, a: 'Query failed. Try again.' }, ...prev])
    } finally {
      setQuerying(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 20, height: '100%', minHeight: 0 }}>
      <style>{`
        @keyframes skeleton { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

      {/* ── Left: News feed (60%) ─────────────────────────────────────────── */}
      <div style={{ flex: 6, overflowY: 'auto', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3', marginBottom: 12 }}>
          Intelligence feed
        </div>

        {/* Auto-detections panel */}
        {autoDetected.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a371f7', animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3' }}>Automatically detected</span>
              <span style={{ background: 'rgba(163,113,247,0.1)', border: '1px solid rgba(163,113,247,0.2)', color: '#a371f7', fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600 }}>NEW</span>
            </div>
            {autoDetected.map((cluster) => (
              <div
                key={cluster.id}
                onClick={() => router.push('/admin/incidents/' + cluster.id)}
                style={{
                  background: '#161b22',
                  border: cluster.status === 'official_verified' ? '1px solid rgba(163,113,247,0.3)' : '1px solid rgba(88,166,255,0.2)',
                  borderRadius: 6, padding: '10px 12px', marginBottom: 6, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4,
                    background: cluster.status === 'official_verified' ? 'rgba(163,113,247,0.1)' : 'rgba(88,166,255,0.1)',
                    color: cluster.status === 'official_verified' ? '#a371f7' : '#58a6ff',
                  }}>
                    {cluster.status === 'official_verified' ? 'Official source' : 'News verified'}
                  </span>
                  <span style={{ fontSize: 11, color: '#484f58' }}>{timeAgo(cluster.auto_detected_at ?? cluster.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3', margin: '4px 0' }}>
                  {cluster.location_name ?? cluster.centroid_lat.toFixed(3) + ', ' + cluster.centroid_lon.toFixed(3)}
                </div>
                {cluster.source_name && (
                  <div style={{ fontSize: 11, color: cluster.status === 'official_verified' ? '#a371f7' : '#58a6ff' }}>{cluster.source_name}</div>
                )}
                <div style={{ fontSize: 11, color: confColour(cluster.confidence_score), marginTop: 2 }}>{cluster.confidence_score}% confidence</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              style={{
                height: 28,
                padding: '0 12px',
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'system-ui',
                background: filter === tab.value ? 'rgba(248,81,73,0.1)' : 'transparent',
                border: filter === tab.value ? '1px solid rgba(248,81,73,0.3)' : '1px solid #21262d',
                color: filter === tab.value ? '#f85149' : '#8b949e',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ background: '#161b22', borderRadius: 8, height: 100, marginBottom: 8, animation: 'skeleton 1.5s infinite' }} />
          ))
        ) : articles.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#484f58' }}>No articles found</div>
        ) : (
          articles.map((article) => {
            const accent = EVENT_COLORS[article.event_type] ?? '#484f58'
            const src = SOURCE_STYLES[article.source] ?? { bg: 'rgba(139,148,158,0.1)', color: '#8b949e' }
            const score = article.ai_relevance_score
            const relColor = score >= 0.7 ? '#3fb950' : score >= 0.4 ? '#d29922' : '#484f58'

            return (
              <div key={article.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 14, marginBottom: 8 }}>
                {/* Top row */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: src.bg, color: src.color }}>{article.source}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: `${accent}18`, color: accent }}>{article.event_type.replace(/_/g, ' ')}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: '#484f58' }}>{timeAgo(article.fetched_at)}</span>
                </div>

                {/* Title */}
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e6edf3', margin: '6px 0 4px', lineHeight: 1.45 }}>{article.title}</div>

                {/* Summary */}
                {article.summary && (
                  <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6, marginBottom: 8, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>{article.summary}</div>
                )}

                {/* Location */}
                {article.location_lat != null && (
                  <div style={{ fontSize: 11, color: '#484f58', marginBottom: 4 }}>
                    · {article.location_name ?? ''} ({article.location_lat.toFixed(3)}, {article.location_lon?.toFixed(3)})
                  </div>
                )}

                {/* Casualties */}
                {article.casualty_count != null && article.casualty_count > 0 && (
                  <div style={{ fontSize: 12, color: '#f85149', fontWeight: 500, marginBottom: 4 }}>{article.casualty_count} casualties reported</div>
                )}

                {/* Relevance */}
                <div style={{ fontSize: 11, color: relColor, marginBottom: 6 }}>{Math.round(score * 100)}% relevant</div>

                {/* Matched cluster */}
                {article.linked_cluster_id && (
                  <div
                    onClick={() => router.push('/admin/incidents')}
                    style={{ background: 'rgba(63,185,80,0.06)', border: '1px solid rgba(63,185,80,0.15)', borderRadius: 5, padding: '6px 10px', fontSize: 11, color: '#3fb950', cursor: 'pointer', marginBottom: 6, display: 'inline-block' }}
                  >
                    ↔ Matched to confirmed incident
                  </div>
                )}

                {/* Actions */}
                {article.status === 'new' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button type="button" onClick={() => handleLink(article.id)} style={{ height: 28, fontSize: 11, background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.2)', color: '#3fb950', borderRadius: 5, cursor: 'pointer', padding: '0 10px', fontFamily: 'system-ui' }}>
                      Link to incident
                    </button>
                    <button type="button" onClick={() => handleDismiss(article.id)} style={{ height: 28, fontSize: 11, background: 'transparent', border: '1px solid #21262d', color: '#484f58', borderRadius: 5, cursor: 'pointer', padding: '0 10px', fontFamily: 'system-ui' }}>
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Read full */}
                <div onClick={() => window.open(article.url, '_blank')} style={{ fontSize: 11, color: '#58a6ff', cursor: 'pointer', marginTop: 6 }}>
                  Read full article ↗
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Right: AI query interface (40%) ───────────────────────────────── */}
      <div style={{ flex: 4, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>Ask the data</div>
        <div style={{ fontSize: 12, color: '#484f58', marginBottom: 16 }}>Natural language queries about your incident database</div>

        {/* Query history */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320, marginBottom: 12 }}>
          {queryHistory.length === 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SUGGESTED_QUESTIONS.map((sq) => (
                <button
                  key={sq}
                  type="button"
                  onClick={() => setQuestion(sq)}
                  style={{
                    background: '#161b22',
                    border: '1px solid #21262d',
                    borderRadius: 20,
                    padding: '6px 12px',
                    fontSize: 11,
                    color: '#8b949e',
                    cursor: 'pointer',
                    fontFamily: 'system-ui',
                  }}
                >
                  {sq}
                </button>
              ))}
            </div>
          ) : (
            queryHistory.map((entry, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#e6edf3', marginBottom: 4 }}>Q: {entry.q}</div>
                <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6, background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: '10px 12px', whiteSpace: 'pre-wrap' }}>{entry.a}</div>
              </div>
            ))
          )}
        </div>

        {/* Query input */}
        <div style={{ position: 'relative' }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleQuery()
            }}
            placeholder="Ask anything about your incident data..."
            style={{
              width: '100%',
              minHeight: 72,
              maxHeight: 120,
              background: '#0d1117',
              border: querying ? '1px solid rgba(88,166,255,0.3)' : '1px solid #21262d',
              borderRadius: 6,
              padding: '10px 48px 10px 12px',
              fontSize: 13,
              color: '#e6edf3',
              fontFamily: 'system-ui',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            disabled={querying}
            onClick={handleQuery}
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              width: 32,
              height: 32,
              background: querying ? '#21262d' : '#58a6ff',
              border: 'none',
              borderRadius: 5,
              cursor: querying ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7h12M8 2l6 5-6 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>Ctrl+Enter to submit</div>
        {dataContext && (
          <div style={{ fontSize: 11, color: '#484f58', marginTop: 4 }}>
            Based on {dataContext.confirmed} confirmed incidents and {dataContext.totalReports} total reports
          </div>
        )}
      </div>
    </div>
  )
}
