import 'server-only'

// Resolve a field coordinator's team via the team_members link
// (team_members.ngo_user_id → team_id). Returns null if they are not on a team.
export async function resolveTeamId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('ngo_user_id', userId)
    .limit(1)
    .maybeSingle()
  return data?.team_id ?? null
}

// How many members of each team are linked to an ACTIVE login account — i.e. who can
// actually receive push/alerts. A team whose roster is name-only (members added without an
// account) returns 0 here: a dispatch to it would reach nobody. Used to warn at dispatch
// time and on the roster. Returns a { teamId: count } map; teams with 0 are simply absent.
export async function notifiableCountsByTeam(supabase: any, teamIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  if (!teamIds.length) return counts
  const { data } = await supabase
    .from('team_members')
    .select('team_id, ngo_users ( status )')
    .in('team_id', teamIds)
    .not('ngo_user_id', 'is', null)
  for (const m of (data ?? []) as any[]) {
    const u = Array.isArray(m.ngo_users) ? m.ngo_users[0] : m.ngo_users
    if (u && u.status === 'active') counts[m.team_id] = (counts[m.team_id] ?? 0) + 1
  }
  return counts
}

// Call AFTER deleting a team_members row. If that member had a field-coordinator
// login and is no longer on any team, delete the login so removing someone from
// their team actually revokes their dashboard access (and frees their email).
// getNgoSession re-checks the user each request, so this logs them out within one
// poll. Non-field roles (e.g. an org_admin who happened to be on a roster) are
// left untouched.
export async function revokeOrphanedMemberLogin(supabase: any, ngoUserId: string | null | undefined): Promise<boolean> {
  if (!ngoUserId) return false
  const { data: user } = await supabase.from('ngo_users').select('role').eq('id', ngoUserId).maybeSingle()
  if (!user || user.role !== 'field_coordinator') return false
  const { count } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('ngo_user_id', ngoUserId)
  if ((count ?? 0) > 0) return false // still on another team — keep their login
  await supabase.from('ngo_users').delete().eq('id', ngoUserId)
  return true
}
