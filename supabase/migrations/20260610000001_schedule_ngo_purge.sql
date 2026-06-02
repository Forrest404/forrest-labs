-- ============================================================
-- Schedule the NGO location purge with pg_cron
-- ============================================================
-- Runs purge_ngo_location() (all orgs) every 30 minutes, IN THE DATABASE — no HTTP
-- call and no secret to expose. Mirrors the existing pipeline schedule
-- (20260331010000_schedule_pipeline.sql). Prerequisite: the pg_cron extension is
-- enabled (same as the verification pipeline). On a plain Postgres without pg_cron
-- this statement is skipped by the guard below rather than erroring.
-- The org_admin "Purge now" button calls the same function via RPC for an immediate run.
-- ============================================================

do $$
begin
  -- Only schedule where pg_cron is installed (Supabase). Guarded so the migration is
  -- safe to apply on a plain Postgres used for local/dev.
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'ngo-location-purge') then
      perform cron.unschedule('ngo-location-purge');
    end if;
    perform cron.schedule(
      'ngo-location-purge',
      '*/30 * * * *',
      $job$ select purge_ngo_location(); $job$
    );
  end if;
end $$;
