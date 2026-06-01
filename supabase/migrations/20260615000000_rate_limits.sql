-- ============================================================
-- Durable rate limiting (additive)
-- ============================================================
-- The previous limiters were in-memory Maps: they reset on serverless cold starts and
-- don't coordinate across Vercel instances, so "5 per 15 min" was leaky/bypassable. This
-- moves the counter into Postgres so the limit is enforced globally and atomically.
--
-- consume_rate_limit() is a SINGLE-statement upsert (no check-then-set race): it resets the
-- window when the stored window_start is older than the window, otherwise increments. It
-- returns whether this call is allowed plus seconds until the window resets.
-- ============================================================

create table if not exists rate_limits (
  bucket       text        not null,           -- e.g. 'auth:ngo-login'
  identifier   text        not null,           -- hashed IP, or hashed IP+account
  window_start timestamptz not null default now(),
  count        int         not null default 0,
  primary key (bucket, identifier)
);
alter table rate_limits enable row level security;  -- service-role only; no policy

create or replace function consume_rate_limit(
  p_bucket text,
  p_identifier text,
  p_max int,
  p_window_seconds int
) returns jsonb
language plpgsql
as $$
declare
  v_count int;
  v_window_start timestamptz;
  v_allowed boolean;
begin
  insert into rate_limits as r (bucket, identifier, window_start, count)
  values (p_bucket, p_identifier, now(), 1)
  on conflict (bucket, identifier) do update
    set
      -- stale window → reset to 1; otherwise increment
      count = case
        when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
        else r.count + 1
      end,
      window_start = case
        when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
        else r.window_start
      end
  returning count, window_start into v_count, v_window_start;

  v_allowed := v_count <= p_max;
  return jsonb_build_object(
    'allowed', v_allowed,
    'count', v_count,
    'retry_after', greatest(0, p_window_seconds - extract(epoch from (now() - v_window_start))::int)
  );
end;
$$;

-- Optional housekeeping: drop stale counters. Safe to schedule via pg_cron (not required —
-- stale rows are reset in place by consume_rate_limit and are otherwise harmless).
create or replace function cleanup_rate_limits() returns void
language sql
as $$
  delete from rate_limits where window_start < now() - interval '1 day';
$$;
