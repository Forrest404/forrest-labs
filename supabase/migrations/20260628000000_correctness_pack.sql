-- Correctness pack (audit H2/H3 + perf M7). Additive + idempotent.

-- H2 — prevent double-dispatch: the same team can't be ACTIVELY dispatched to the same
-- target twice. Partial unique indexes (only active rows; null target excluded, so panic
-- responses — both ids null — are unaffected). The create route catches 23505 and returns
-- the existing dispatch instead of a duplicate + duplicate team alert.
create unique index if not exists ngo_dispatches_active_cluster
  on ngo_dispatches (team_id, cluster_id)
  where status in ('assigned', 'en_route', 'on_scene') and cluster_id is not null;
create unique index if not exists ngo_dispatches_active_incident
  on ngo_dispatches (team_id, ngo_incident_id)
  where status in ('assigned', 'en_route', 'on_scene') and ngo_incident_id is not null;

-- H3 — one roll-call response per user. Dedup any existing duplicates (keep earliest),
-- then enforce a unique index so a double-tap on a flaky connection can't inflate the
-- "X of Y safe" headcount. The respond route is 23505-tolerant.
delete from roll_call_responses r
  using roll_call_responses keep
  where r.roll_call_id = keep.roll_call_id
    and r.ngo_user_id = keep.ngo_user_id
    and r.ctid > keep.ctid;
create unique index if not exists roll_call_responses_unique
  on roll_call_responses (roll_call_id, ngo_user_id);

-- M7 — composite indexes matching the hot read paths (separate single-column indexes
-- exist today; these cover the filter+sort in one).
create index if not exists ngo_dispatches_org_time
  on ngo_dispatches (org_id, assigned_at desc);
create index if not exists check_ins_user_time
  on check_ins (ngo_user_id, created_at desc);
