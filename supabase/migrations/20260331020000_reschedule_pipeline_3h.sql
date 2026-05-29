-- ============================================================
-- Re-schedule the pipeline at a 3-hour cadence (cost reduction)
-- ============================================================
-- Supersedes the 15-min schedule from 20260331010000. Cuts the only
-- paid work (fetch-news → Claude) to once every 3 hours. Combined with
-- the Haiku model swap in the Edge Functions, AI cost drops ~100×.
--
--   fetch-news     → 0  */3 * * *   (top of every 3rd hour)
--   detect-strikes → 20 */3 * * *   (20 min later, so new articles exist)
--   cluster-reports→ 40 */3 * * *   (40 min later)
--
-- ⚠️ AUTHORITATIVE APPLY IS THE SQL EDITOR, NOT `db push`.
-- The cron command reads the service-role key from Vault at run time
-- (vault.decrypted_secrets). Only roles with Vault access (e.g. postgres,
-- which the SQL Editor runs as) can read it. Jobs created by `supabase
-- db push` run under a role that CANNOT read Vault, so they 401 with
-- "Missing authorization header". Run THIS file's body in the Supabase
-- SQL Editor so the jobs are owned by postgres and authenticate correctly.
-- ============================================================

do $$
declare
  stale text;
begin
  foreach stale in array array['cluster-reports', 'fetch-news', 'detect-strikes']
  loop
    if exists (select 1 from cron.job where jobname = stale) then
      perform cron.unschedule(stale);
    end if;
  end loop;
end $$;

-- fetch-news — every 3 hours
select cron.schedule(
  'fetch-news',
  '0 */3 * * *',
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

-- detect-strikes — every 3 hours, 20 min after fetch-news
select cron.schedule(
  'detect-strikes',
  '20 */3 * * *',
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

-- cluster-reports — every 3 hours, 40 min after fetch-news
select cron.schedule(
  'cluster-reports',
  '40 */3 * * *',
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
