import 'server-only'

// Shared abuse blocklist check for civilian intake. Returns true if either the IP hash or
// the session hash is on the blocklist with action='block' (a 'flag' is a watch-only marker
// and does NOT block). Fails OPEN on a DB error — a blocklist hiccup must never take down
// civilian reporting. Identifiers are already hashed by the caller; we never see raw values.
export async function isBlocked(supabase: any, ipHash: string | null, sessionHash: string | null): Promise<boolean> {
  const hashes = [ipHash, sessionHash].filter(Boolean) as string[]
  if (hashes.length === 0) return false
  try {
    const { data } = await supabase
      .from('blocked_identifiers')
      .select('id')
      .eq('action', 'block')
      .in('identifier_hash', hashes)
      .limit(1)
    return (data?.length ?? 0) > 0
  } catch {
    return false // fail open — never block legitimate reporting on an infra error
  }
}
