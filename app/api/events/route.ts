import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClusterRow {
  id: string
  created_at: string
  centroid_lat: number
  centroid_lon: number
  report_count: number
  confidence_score: number
  display_radius_metres: number
  dominant_event_types: string[]
  status: string
  ai_reasoning: string | null
}

interface GeoJsonFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    id: string
    created_at: string
    report_count: number
    confidence_score: number
    radius_metres: number
    event_types: string[]
    status: string
    ai_reasoning: string | null
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    const since = searchParams.get('since')
    const bbox = searchParams.get('bbox')
    const limit = Math.min(
      parseInt(searchParams.get('limit') ?? '100', 10),
      500,
    )

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    // NOTE: the approve endpoint sets status = 'auto_confirmed' for both
    // AI-auto and founder-confirmed clusters. There is no separate 'confirmed'
    // value in the schema, so this single status covers both cases.
    let query = supabase
      .from('clusters')
      .select(`
        id,
        created_at,
        centroid_lat,
        centroid_lon,
        report_count,
        confidence_score,
        display_radius_metres,
        dominant_event_types,
        status,
        ai_reasoning
      `)
      .eq('status', 'auto_confirmed')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (since) {
      const sinceDate = new Date(since)
      if (!isNaN(sinceDate.getTime())) {
        query = query.gte('created_at', sinceDate.toISOString())
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Events API query error:', error.message)
      return NextResponse.json(
        { error: 'Failed to fetch events' },
        { status: 500 },
      )
    }

    let features: GeoJsonFeature[] = (data as ClusterRow[] ?? []).map((cluster) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [cluster.centroid_lon, cluster.centroid_lat] as [number, number],
      },
      properties: {
        id: cluster.id,
        created_at: cluster.created_at,
        report_count: cluster.report_count,
        confidence_score: cluster.confidence_score,
        radius_metres: cluster.display_radius_metres,
        event_types: cluster.dominant_event_types,
        status: cluster.status,
        ai_reasoning: cluster.ai_reasoning,
      },
    }))

    // Bounding-box filter applied after fetch (coordinates live in properties)
    if (bbox) {
      const parts = bbox.split(',').map(Number)
      if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
        const [minLon, minLat, maxLon, maxLat] = parts
        features = features.filter((f) => {
          const [lon, lat] = f.geometry.coordinates
          return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
        })
      }
    }

    const geojson = {
      type: 'FeatureCollection' as const,
      features,
      metadata: {
        generated_at: new Date().toISOString(),
        total_features: features.length,
        source: 'Forrest Labs',
        license: 'Open — attribution required',
      },
    }

    return NextResponse.json(geojson, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=30',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Content-Type': 'application/geo+json',
      },
    })
  } catch (error) {
    console.error('Events API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
