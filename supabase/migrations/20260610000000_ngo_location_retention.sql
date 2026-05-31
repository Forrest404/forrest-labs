-- ============================================================
-- NGO location retention + hard-purge function (additive)
-- ============================================================
-- NOUR holds live aid-worker GPS in a conflict zone. To limit what a breach or a seized
-- device exposes, each org gets a retention window after which location data is HARD-
-- deleted (no soft-delete flag). Default 48h; org_admin adjusts it in settings.
--
-- Scope of the purge (per org, cutoff = now() - location_retention_hours):
--   • check_ins        — every proof-of-life GPS row older than the window
--   • panic_events     — RESOLVED or CANCELLED duress events older than the window.
--                        An ACTIVE (unresolved, uncancelled) panic is NEVER purged,
--                        regardless of age — losing a live duress alert could kill someone.
--   • roll_calls       — older than the window (roll_call_responses cascade via FK)
--   • team_status      — stale last-known position is blanked (row kept, status kept;
--                        only last_lat/last_lon/last_seen_at cleared) so a captured DB
--                        holds no stale coordinates.
-- The function returns row counts only — never coordinates.
-- ============================================================

alter table ngo_organisations
  add column if not exists location_retention_hours int not null default 48;

create or replace function purge_ngo_location(p_org uuid default null)
returns table (
  org_id            uuid,
  check_ins_deleted bigint,
  panics_deleted    bigint,
  roll_calls_deleted bigint,
  team_positions_cleared bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  cutoff timestamptz;
  c_checkins bigint;
  c_panics bigint;
  c_rollcalls bigint;
  c_team bigint;
begin
  for o in
    select id, location_retention_hours
    from ngo_organisations
    where p_org is null or id = p_org
  loop
    cutoff := now() - make_interval(hours => greatest(o.location_retention_hours, 1));

    -- check_ins (no org_id column — scope via the org's users)
    with del as (
      delete from check_ins ci
      using ngo_users u
      where ci.ngo_user_id = u.id
        and u.org_id = o.id
        and ci.created_at < cutoff
      returning 1
    )
    select count(*) into c_checkins from del;

    -- panic_events: only those already resolved or cancelled. Active panics survive.
    with del as (
      delete from panic_events p
      where p.org_id = o.id
        and p.created_at < cutoff
        and (p.resolved_at is not null or p.cancelled_at is not null)
      returning 1
    )
    select count(*) into c_panics from del;

    -- roll_calls (responses cascade on delete)
    with del as (
      delete from roll_calls r
      where r.org_id = o.id
        and r.created_at < cutoff
      returning 1
    )
    select count(*) into c_rollcalls from del;

    -- team_status: blank stale positions for this org's teams (keep row + status)
    with upd as (
      update team_status ts
      set last_lat = null, last_lon = null, last_seen_at = null
      from ngo_teams t
      where ts.team_id = t.id
        and t.org_id = o.id
        and ts.last_seen_at is not null
        and ts.last_seen_at < cutoff
      returning 1
    )
    select count(*) into c_team from upd;

    org_id := o.id;
    check_ins_deleted := c_checkins;
    panics_deleted := c_panics;
    roll_calls_deleted := c_rollcalls;
    team_positions_cleared := c_team;
    return next;
  end loop;
end;
$$;
