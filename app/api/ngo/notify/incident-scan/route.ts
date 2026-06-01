import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { notifyOrgRoles } from '@/lib/ngo-notify'
import { pointInPolygon } from '@/lib/ngo-geo'

// New-incident-in-area scan. NGO-side only — reads the civilian `clusters` table (never
// writes it). Designed to be hit by a scheduler (Vercel cron or pg_cron net.http_post)
// with ?key=<REVIEW_SECRET_KEY>, or run manually by an org_admin (scoped to their org).
// For each org with an operational area, finds high-confidence/official clusters created
// since the last scan whose centroid falls inside the area, and sends ONE NORMAL alert to
// leaders. ngo_incident_scan_state tracks last_scan_at so nothing is re-alerted; the FIRST
// scan for an org just records "now" and never alerts on the backlog.

const ALERT_STATUSES = ['confirmed', 'official_verified', 'news_verified'] // high-confidence/official

function secretOk(request: NextRequest): boolean {
  const key = new URL(request.url).searchParams.get('key')
  const secret = process.env.REVIEW_SECRET_KEY
  if (!key || !secret) return false
  const a = Buffer.from(key), b = Buffer.from(secret)
  if (a.length !== b.length) return false
  try { return timingSafeEqual(a, b) } catch { return false }
}

export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  const isAdmin = session?.role === 'org_admin'
  if (!secretOk(request) && !isAdmin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const orgQuery = supabase.from('ngo_organisations').select('id, operational_area').eq('status', 'approved')
  if (isAdmin && session) orgQuery.eq('id', session.orgId)
  const { data: orgs } = await orgQuery

  const now = new Date().toISOString()
  let scanned = 0, alerted = 0

  for (const org of orgs ?? []) {
    const area = (org as any).operational_area as { type?: string; coordinates?: number[][][] } | null
    if (!area?.coordinates) continue // no drawn area → nothing to scan
    scanned++

    // Last scan time. First run for this org → record now and DON'T alert on history.
    const { data: stateRow } = await supabase.from('ngo_incident_scan_state').select('last_scan_at').eq('org_id', org.id).maybeSingle()
    if (!stateRow) {
      await supabase.from('ngo_incident_scan_state').upsert({ org_id: org.id, last_scan_at: now }, { onConflict: 'org_id' })
      continue
    }
    const since = stateRow.last_scan_at

    const { data: clusters } = await supabase
      .from('clusters')
      .select('id, centroid_lat, centroid_lon, status, created_at')
      .in('status', ALERT_STATUSES)
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200)

    const inArea = (clusters ?? []).filter((c: any) => c.centroid_lat != null && c.centroid_lon != null && pointInPolygon(c.centroid_lon, c.centroid_lat, area))

    if (inArea.length > 0) {
      await notifyOrgRoles(supabase, org.id, ['org_admin', 'team_leader'], {
        event: 'new_incident',
        title: '📍 New incident in your area',
        body: inArea.length === 1 ? 'A new verified incident is in your operational area. Open NOUR.' : `${inArea.length} new verified incidents are in your operational area. Open NOUR.`,
        priority: 'high', tags: 'round_pushpin',
      })
      alerted++
    }
    await supabase.from('ngo_incident_scan_state').update({ last_scan_at: now }).eq('org_id', org.id)
  }

  return NextResponse.json({ success: true, scanned, alerted })
}
