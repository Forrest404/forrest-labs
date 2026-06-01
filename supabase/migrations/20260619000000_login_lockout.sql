-- ============================================================
-- Login lockout after repeated wrong passwords (additive)
-- ============================================================
-- Policy: 3 wrong passwords on an account → that account must wait 10 minutes before
-- trying again. This is distinct from the existing IP/account throttle (5 / 15 min):
-- it counts only FAILED credential attempts and is cleared by a correct password.
--
-- Implemented on the existing rate_limits table (see 20260615000000). No table changes —
-- two new helper functions only:
--   peek_rate_limit()  — read the current count WITHOUT incrementing (so checking whether
--                        an account is locked never itself advances the counter).
--   reset_rate_limit() — clear the counter (called on a successful password verification).
-- The failure counter itself is advanced with the existing consume_rate_limit().
-- ============================================================

-- Read-only check: is this bucket/identifier currently at or over the limit? Mirrors the
-- stale-window logic in consume_rate_limit so a window that has aged out reads as cleared.
create or replace function peek_rate_limit(
  p_bucket text,
  p_identifier text,
  p_max int,
  p_window_seconds int
) returns jsonb
language plpgsql
stable
as $$
declare
  v_count int;
  v_window_start timestamptz;
begin
  select count, window_start into v_count, v_window_start
    from rate_limits
    where bucket = p_bucket and identifier = p_identifier;

  -- No row, or the window has aged out → not locked.
  if not found or v_window_start < now() - make_interval(secs => p_window_seconds) then
    return jsonb_build_object('allowed', true, 'count', 0, 'retry_after', 0);
  end if;

  return jsonb_build_object(
    'allowed', v_count < p_max,
    'count', v_count,
    'retry_after', greatest(0, p_window_seconds - extract(epoch from (now() - v_window_start))::int)
  );
end;
$$;

-- Clear a counter (e.g. a correct password resets the wrong-password streak).
create or replace function reset_rate_limit(
  p_bucket text,
  p_identifier text
) returns void
language sql
as $$
  delete from rate_limits where bucket = p_bucket and identifier = p_identifier;
$$;
