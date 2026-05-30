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
