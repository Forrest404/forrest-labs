-- ============================================================
-- Schedule the NGO time-based safety nets (pg_cron) — additive
-- ============================================================
-- AUDIT FINDING F1 (safety-critical): nothing was scheduling the NGO safety endpoints, so an
-- unacknowledged panic never auto-widened up the chain, missed check-ins never escalated, and
-- new-incident-in-area alerts never fired. The INITIAL panic / roll-call / dispatch alerts
-- fire synchronously on their POST and were unaffected — it is only the TIME-BASED follow-ups
-- that need a scheduler. This adds the three jobs, mirroring the civilian pipeline scheduler
-- (20260331020000_reschedule_pipeline_3h.sql).
--
-- Each target is a Next.js route on the app, authenticated by the shared REVIEW_SECRET_KEY.
-- The key is passed as the `x-cron-key` HEADER (not in the URL) so it is NOT persisted in
-- pg_net's request log, read from Vault at run time — exactly how the pipeline jobs read
-- service_role_key from Vault.
--
-- ⚠️ PREREQUISITES (do these in the Supabase dashboard FIRST):
--   1. Store REVIEW_SECRET_KEY in Vault under the name 'review_secret_key':
--        select vault.create_secret('<your REVIEW_SECRET_KEY value>', 'review_secret_key');
--   2. APPLY THIS FILE'S BODY IN THE SQL EDITOR (not `supabase db push`) so the jobs are
--      owned by `postgres` and can read Vault at run time — same caveat as 20260331020000.
--   3. If the app's URL is not https://www.noursystems.org, edit the three urls below.
--
-- Cadence (idempotent: re-running unschedules the old jobs first):
--   panic-escalate  every  1 min   (panic_escalation_minutes default 5 — must catch fast)
--   escalate        every 15 min   (checkin_window_minutes default 240)
--   incident-scan   every 15 min   (civilian pipeline runs ~3-hourly)
-- ============================================================

do $$
declare stale text;
begin
  foreach stale in array array['ngo-panic-escalate', 'ngo-missed-checkin-escalate', 'ngo-incident-scan']
  loop
    if exists (select 1 from cron.job where jobname = stale) then
      perform cron.unschedule(stale);
    end if;
  end loop;
end $$;

-- Unacknowledged-panic auto-escalation — every minute (life-safety; must never sit silently).
select cron.schedule(
  'ngo-panic-escalate',
  '* * * * *',
  $job$
  select net.http_post(
    url     := 'https://www.noursystems.org/api/ngo/safety/panic-escalate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets where name = 'review_secret_key')
    ),
    body    := '{}'::jsonb
  );
  $job$
);

-- Missed-check-in escalation (amber → leaders, red → admins) — every 15 minutes.
select cron.schedule(
  'ngo-missed-checkin-escalate',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := 'https://www.noursystems.org/api/ngo/safety/escalate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets where name = 'review_secret_key')
    ),
    body    := '{}'::jsonb
  );
  $job$
);

-- New-incident-in-area scan (NORMAL alert to leaders) — every 15 minutes.
select cron.schedule(
  'ngo-incident-scan',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := 'https://www.noursystems.org/api/ngo/notify/incident-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key',   (select decrypted_secret from vault.decrypted_secrets where name = 'review_secret_key')
    ),
    body    := '{}'::jsonb
  );
  $job$
);
