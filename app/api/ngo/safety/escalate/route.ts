import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { notifyOrgRoles } from '@/lib/ngo-notify'

// Missed-check-in escalation. Designed to be hit by a scheduler (pg_cron
// net.http_post or a Vercel cron) with ?key=<REVIEW_SECRET_KEY>, or run manually
// by an org_admin (scoped to their org).
//
//   elapsed since last check-in  >  2 × window  →  RED   → org_admins
//   elapsed                      >      window  →  AMBER → team_leaders
//
// Window is per-org (ngo_organisations.checkin_window_minutes, default 240).
// safety_escalations dedupes so the same level isn't re-sent every tick; if that
// table hasn't been migrated yet the dedup is skipped (still correct, just chattier).

const LEVEL_RANK: Record<string, number> = { amber: 1, red: 2 }

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

  // Orgs in scope (one org for an admin caller; all approved orgs for the cron).
  const orgQuery = supabase.from('ngo_organisations').select('*').eq('status', 'approved')
  if (isAdmin && session) orgQuery.eq('id', session.orgId)
  const { data: orgs } = await orgQuery

  const now = Date.now()
  let checked = 0, amber = 0, red = 0

  for (const org of orgs ?? []) {
    const windowMin = (org as any).checkin_window_minutes ?? 240
    const { data: coords } = await supabase
      .from('ngo_users')
      .select('id, full_name, created_at')
      .eq('org_id', org.id)
      .eq('role', 'field_coordinator')
      .eq('status', 'active')

    for (const u of coords ?? []) {
      checked++
      const { data: last } = await supabase
        .from('check_ins').select('created_at').eq('ngo_user_id', u.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      const lastActivity = last?.created_at ?? (u as any).created_at
      const elapsedMin = (now - new Date(lastActivity).getTime()) / 60000

      const level = elapsedMin > 2 * windowMin ? 'red' : elapsedMin > windowMin ? 'amber' : null
      if (!level) continue

      // Dedup: skip if this level (or higher) was already sent since last activity.
      try {
        const { data: prior } = await supabase
          .from('safety_escalations').select('level').eq('ngo_user_id', u.id)
          .gte('created_at', lastActivity)
        const maxPrior = (prior ?? []).reduce((m: number, r: any) => Math.max(m, LEVEL_RANK[r.level] ?? 0), 0)
        if (maxPrior >= LEVEL_RANK[level]) continue
      } catch { /* table not migrated yet — proceed without dedup */ }

      // Sanitised broadcast (security C1): no name on the relay; the board shows who.
      if (level === 'red') {
        red++
        await notifyOrgRoles(supabase, org.id, ['org_admin'], {
          title: '🔴 Missed check-in (escalated)',
          body: `A field worker has missed check-in for over ${2 * windowMin} min. Open NOUR.`,
          priority: 'urgent', tags: 'red_circle',
        })
      } else {
        amber++
        await notifyOrgRoles(supabase, org.id, ['team_leader'], {
          title: '🟠 Missed check-in',
          body: `A field worker has missed a check-in (> ${windowMin} min). Open NOUR.`,
          priority: 'high', tags: 'warning',
        })
      }
      try { await supabase.from('safety_escalations').insert({ ngo_user_id: u.id, level }) } catch { /* table not migrated */ }
    }
  }

  return NextResponse.json({ checked, amber, red })
}
