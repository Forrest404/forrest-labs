-- ============================================================
-- NGO tables — re-assert Row Level Security (security backstop, finding H2)
-- ============================================================
-- ADDITIVE / IDEMPOTENT. Changes no data and no table structure. Safe to run
-- repeatedly. Does NOT alter the live civilian app.
--
-- WHAT THIS DOES, AND ITS LIMITS — read before relying on it:
--
-- Every ngo_* table is created with RLS enabled and NO policies, which means the
-- Supabase anon/authenticated keys (the ones that could ever reach the browser) are
-- DENIED all access by default. That is the correct posture and this migration simply
-- RE-ASSERTS it, so that if RLS is ever accidentally disabled on one of these tables
-- (a manual change, a bad migration), re-running migrations turns it back on. This
-- closes the "aid-worker location tables become world-readable via the public anon
-- key" failure mode.
--
-- WHAT THIS DOES NOT DO: it does not constrain the SERVICE-ROLE key. The NGO API
-- routes use the service-role client, which BYPASSES RLS unconditionally (FORCE ROW
-- LEVEL SECURITY does not affect a BYPASSRLS role either). Therefore org-scoped RLS
-- policies would give FALSE ASSURANCE — they would not stop a route that forgets its
-- `.eq('org_id', session.orgId)` filter. A true database-level backstop against that
-- class of bug requires moving NGO auth onto Supabase Auth JWTs so policies can read
-- `auth.jwt()->>'org_id'`; that is a deliberate re-architecture, not an additive
-- migration, and is flagged for human decision. Until then, per-org isolation is
-- enforced in the application layer (audited: every route scopes by org_id).
--
-- No CREATE POLICY statements are included here precisely to avoid implying a
-- service-role backstop that does not exist.

do $$
declare t text;
begin
  foreach t in array array[
    'ngo_organisations','ngo_users','ngo_teams','team_members','team_status',
    'check_ins','panic_events','roll_calls','roll_call_responses','ngo_dispatches',
    'on_scene_reports','ngo_notes','broadcasts','safety_escalations','ngo_incidents',
    'ngo_cluster_status'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I enable row level security;', t);
    end if;
  end loop;
end $$;
