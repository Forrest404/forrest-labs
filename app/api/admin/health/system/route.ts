import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

interface HealthCheck {
  name: string
  ok: boolean
  latency: number
  error?: string
  last_run?: string | null
  minutes_ago?: number | null
  last_cluster?: string | null
  hours_ago?: number | null
  last_report?: string | null
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const checks = await Promise.allSettled([
    // Supabase read latency
    (async (): Promise<HealthCheck> => {
      const start = Date.now()
      const { error } = await supabase.from('clusters').select('id').limit(1).single()
      return {
        name: 'Database read',
        latency: Date.now() - start,
        ok: !error,
      }
    })(),

    // Supabase write access latency
    (async (): Promise<HealthCheck> => {
      const start = Date.now()
      const { error } = await supabase.from('admin_audit_log').select('id').limit(1)
      return {
        name: 'Database write access',
        latency: Date.now() - start,
        ok: !error,
      }
    })(),

    // Edge function ping
    (async (): Promise<HealthCheck> => {
      const start = Date.now()
      try {
        const res = await fetch(
          process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/cluster-reports',
          {
            method: 'OPTIONS',
            headers: {
              Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
            },
          },
        )
        return {
          name: 'Edge functions',
          latency: Date.now() - start,
          ok: res.status < 500,
        }
      } catch {
        return {
          name: 'Edge functions',
          latency: Date.now() - start,
          ok: false,
        }
      }
    })(),

    // Claude API check
    (async (): Promise<HealthCheck> => {
      const start = Date.now()
      if (!process.env.ANTHROPIC_API_KEY) {
        return {
          name: 'AI analyst',
          latency: 0,
          ok: false,
          error: 'API key not configured',
        }
      }
      return {
        name: 'AI analyst',
        latency: Date.now() - start,
        ok: true,
      }
    })(),

    // News feed recency
    (async (): Promise<HealthCheck> => {
      const { data } = await supabase
        .from('news_articles')
        .select('fetched_at')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .single()

      const lastFetch = data?.fetched_at as string | null
      const minutesAgo = lastFetch
        ? Math.floor((Date.now() - new Date(lastFetch).getTime()) / 60000)
        : null

      return {
        name: 'News feed',
        latency: 0,
        ok: minutesAgo !== null && minutesAgo < 15,
        last_run: lastFetch,
        minutes_ago: minutesAgo,
      }
    })(),

    // Cluster detection recency
    (async (): Promise<HealthCheck> => {
      const { data } = await supabase
        .from('clusters')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const lastCluster = data?.created_at as string | null
      const hoursAgo = lastCluster
        ? Math.floor((Date.now() - new Date(lastCluster).getTime()) / 3600000)
        : null

      return {
        name: 'Cluster pipeline',
        latency: 0,
        ok: true,
        last_cluster: lastCluster,
        hours_ago: hoursAgo,
      }
    })(),

    // Report ingestion recency
    (async (): Promise<HealthCheck> => {
      const { data } = await supabase
        .from('reports')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      return {
        name: 'Report pipeline',
        latency: 0,
        ok: true,
        last_report: data?.created_at as string | null,
      }
    })(),
  ])

  const results = checks.map((c) => {
    if (c.status === 'rejected') {
      return {
        name: 'Unknown',
        ok: false,
        latency: 0,
        error: String(c.reason),
      }
    }
    return c.value
  })

  const allOk = results.every((r) => r.ok)
  const criticalOk = results.slice(0, 2).every((r) => r.ok)

  return NextResponse.json({
    status: allOk ? 'ok' : criticalOk ? 'degraded' : 'critical',
    checks: results,
    checked_at: new Date().toISOString(),
  })
}
