-- ============================================================
-- Schedule the civilian area-alert dispatcher (pg_cron) — additive
-- ============================================================
-- Runs /api/alerts/dispatch every 5 minutes: it matches newly-verified incidents / active
-- warnings to subscribed areas and pushes to each subscription's ntfy topic (deduped). Mirrors
-- the safety-cron scheduler (20260621000000): the shared REVIEW_SECRET_KEY is passed as the
-- x-cron-key HEADER (kept out of URLs and pg_net's request log), read from Vault at run time.
--
-- ⚠️ PREREQUISITES (Supabase dashboard, same as the safety crons):
--   1. REVIEW_SECRET_KEY must already be in Vault as 'review_secret_key'
--        select vault.create_secret('<REVIEW_SECRET_KEY>', 'review_secret_key');  -- if not done
--   2. APPLY THIS FILE IN THE SQL EDITOR (not `supabase db push`) so the job is owned by
--      `postgres` and can read Vault at run time.
--   3. If the app URL is not https://www.noursystems.org, edit the url below.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'civilian-area-alert-dispatch') then
    perform cron.unschedule('civilian-area-alert-dispatch');
  end if;
end $$;

select cron.schedule(
  'civilian-area-alert-dispatch',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url     := 'https://www.noursystems.org/api/alerts/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets where name = 'review_secret_key')
    ),
    body    := '{}'::jsonb
  );
  $job$
);
