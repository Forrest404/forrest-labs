import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const start = Date.now()
  try {
    const supabase = createServiceClient()

    const [
      { count: confirmedCount },
      { count: warningCount },
      { count: pendingCount }
    ] = await Promise.all([
      supabase
        .from('clusters')
        .select('*', { count: 'exact', head: true })
        .in('status', ['confirmed', 'auto_confirmed']),
      supabase
        .from('warning_clusters')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase
        .from('clusters')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_review')
    ])

    return NextResponse.json({
      status: 'ok',
      service: 'forrest-labs',
      version: '1.0.0',
      confirmed_incidents: confirmedCount ?? 0,
      active_warnings: warningCount ?? 0,
      pending_review: pendingCount ?? 0,
      latency_ms: Date.now() - start,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('Health check failed:', error)
    return NextResponse.json({
      status: 'error',
      service: 'forrest-labs',
      latency_ms: Date.now() - start,
      timestamp: new Date().toISOString()
    }, {
      status: 500,
      headers: { 'Cache-Control': 'no-cache' }
    })
  }
}
