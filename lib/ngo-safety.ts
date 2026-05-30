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
