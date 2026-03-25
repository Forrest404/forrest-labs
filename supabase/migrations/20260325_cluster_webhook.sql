-- Schedule the cluster-reports edge function to run every 60 seconds.
--
-- Prerequisites (enable once in the Supabase dashboard):
--   1. Database → Extensions → pg_cron  (enable)
--   2. Database → Extensions → pg_net   (enable)
--
-- Fill in [project-ref] and [service-role-key] before running this SQL
-- in the Supabase SQL editor (Settings → API to find both values).

select cron.schedule(
  'cluster-reports-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://[project-ref].supabase.co/functions/v1/cluster-reports',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer [service-role-key]'
    ),
    body    := '{}'::jsonb
  );
  $$
);
