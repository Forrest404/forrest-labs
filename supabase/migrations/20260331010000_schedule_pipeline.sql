-- ============================================================
-- Schedule the verification pipeline with pg_cron
-- ============================================================
-- Replaces the old placeholder cron job (which POSTed to a literal
-- "https://[project-ref].supabase.co/..." URL and never ran) with real,
-- working schedules for the three Edge Functions that keep the live map
-- populated:
--
--   cluster-reports — clusters incoming civilian reports        (every 5 min)
--   fetch-news      — pulls RSS, stores articles, creates strikes (every 15 min)
--   detect-strikes  — links/boosts + creates strikes from backlog (every 15 min, offset)
--
-- SECRET HANDLING: the service-role key is NOT stored in this file. It is
-- read at run time from Supabase Vault. Create it once (Dashboard → Project
-- Settings → Vault, or SQL), before/after applying this migration:
--
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
-- Until that secret exists the Authorization header resolves to NULL and the
-- HTTP calls 401 — scheduling itself still succeeds.
--
-- Prerequisites (enable once in the dashboard): pg_cron, pg_net extensions.
-- This migration targets a Supabase environment (cron/net/vault schemas);
-- like the existing alerts/warning_clusters publication statements it is not
-- expected to run on a plain Postgres.
-- ============================================================

-- ── Remove stale / placeholder jobs (guarded; unschedule throws if absent) ──
do $$
declare
  stale text;
begin
  foreach stale in array array[
    'cluster-reports-every-minute',
    'cluster-reports',
    'fetch-news',
    'detect-strikes'
  ]
  loop
    if exists (select 1 from cron.job where jobname = stale) then
      perform cron.unschedule(stale);
    end if;
  end loop;
end $$;

-- ── cluster-reports — every 5 minutes ──
select cron.schedule(
  'cluster-reports',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url     := 'https://pheoekxgeczfqqyobema.supabase.co/functions/v1/cluster-reports',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb
  );
  $job$
);

-- ── fetch-news — every 15 minutes (minute 0,15,30,45) ──
select cron.schedule(
  'fetch-news',
  '0,15,30,45 * * * *',
  $job$
  select net.http_post(
    url     := 'https://pheoekxgeczfqqyobema.supabase.co/functions/v1/fetch-news',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb
  );
  $job$
);

-- ── detect-strikes — every 15 minutes, offset 2 min so it runs after fetch-news ──
select cron.schedule(
  'detect-strikes',
  '2,17,32,47 * * * *',
  $job$
  select net.http_post(
    url     := 'https://pheoekxgeczfqqyobema.supabase.co/functions/v1/detect-strikes',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb
  );
  $job$
);
