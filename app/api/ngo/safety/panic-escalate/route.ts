import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession } from '@/lib/ngo-auth'
import { notifyOrgRoles } from '@/lib/ngo-notify'
import { cronAuthOk } from '@/lib/cron-auth'

// Automatic panic escalation. Hit by a scheduler (pg_cron net.http_post or a Vercel
// cron) with ?key=<REVIEW_SECRET_KEY>, or run by an org_admin (scoped to their org).
// A panic that no responder acknowledges keeps widening — it must never sit silently:
//
//   age > 1× window  → level 1 → re-alert team_leaders + org_admins ("UNACKNOWLEDGED")
//   age > 2× window  → level 2 → re-alert org_admins ("STILL UNACKNOWLEDGED")
//
// Window is per-org (ngo_organisations.panic_escalation_minutes, default 5). The
// escalation_level column dedupes so each level fires once. Acknowledging stops it.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  const isAdmin = session?.role === 'org_admin'
  if (!cronAuthOk(request) && !isAdmin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const supabase = createServiceClient()

  const orgQuery = supabase.from('ngo_organisations').select('*').eq('status', 'approved')
  if (isAdmin && session) orgQuery.eq('id', session.orgId)
  const { data: orgs } = await orgQuery

  const now = Date.now()
  let escalated = 0

  for (const org of orgs ?? []) {
    const windowMin = (org as any).panic_escalation_minutes ?? 5
    // Active, unacknowledged panics for this org. Needs the revamp columns; skip if absent.
    const { data: panics, error } = await supabase
      .from('panic_events')
      .select('id, ngo_user_id, created_at, escalation_level')
      .eq('org_id', org.id).is('resolved_at', null).is('cancelled_at', null).is('acknowledged_at', null)
    if (error) continue

    for (const p of panics ?? []) {
      const ageMin = (now - new Date(p.created_at).getTime()) / 60000
      const target = ageMin > 2 * windowMin ? 2 : ageMin > windowMin ? 1 : 0
      const current = (p as any).escalation_level ?? 0
      if (target <= current) continue

      // Sanitised broadcast (security C1): no name/timing detail on the relay.
      if (target >= 2) {
        await notifyOrgRoles(supabase, org.id, ['org_admin'], {
          event: 'panic_escalate',
          title: '🔴 PANIC still unacknowledged',
          body: 'A duress alert is still unacknowledged. Open NOUR and respond now.',
          priority: 'urgent', tags: 'rotating_light',
        })
      } else {
        await notifyOrgRoles(supabase, org.id, ['org_admin', 'team_leader'], {
          event: 'panic_escalate',
          title: '🆘 PANIC unacknowledged',
          body: 'A duress alert is unacknowledged. Open NOUR and respond now.',
          priority: 'urgent', tags: 'rotating_light',
        })
      }
      await supabase.from('panic_events').update({ escalation_level: target, escalated_at: new Date().toISOString() }).eq('id', p.id)
      escalated++
    }
  }

  return NextResponse.json({ escalated })
}
