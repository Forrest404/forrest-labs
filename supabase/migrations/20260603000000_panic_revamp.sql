-- Panic feature revamp — additive only. Extends panic_events with the columns the
-- full field-safety flow needs (silent mode, reason chips, acknowledgement, resolution
-- note, false-alarm cancel, escalation widening) plus org config. Civilian tables are
-- untouched; all columns are nullable or defaulted so existing inserts keep working.
alter table panic_events
  add column if not exists org_id           uuid references ngo_organisations (id) on delete cascade,
  add column if not exists silent           boolean     not null default false,
  add column if not exists reason           text,
  add column if not exists acknowledged_at  timestamptz,
  add column if not exists acknowledged_by  uuid references ngo_users (id) on delete set null,
  add column if not exists resolution_note  text,
  add column if not exists cancelled_at     timestamptz,
  add column if not exists escalation_level int         not null default 0,
  add column if not exists escalated_at     timestamptz;

-- Backfill org_id on existing rows from the panicking user (clean scoping + retention).
update panic_events pe set org_id = u.org_id
  from ngo_users u where u.id = pe.ngo_user_id and pe.org_id is null;
create index if not exists panic_events_org on panic_events (org_id, created_at desc);

-- Org-admin config (consumed in steps 2 & 5):
--   panic_ack_visible_default — may a field worker see "help has seen this" (silent mode
--                               always suppresses it regardless).
--   panic_escalation_minutes  — widen an unacknowledged panic up the chain after this long.
alter table ngo_organisations
  add column if not exists panic_ack_visible_default boolean not null default true,
  add column if not exists panic_escalation_minutes  int     not null default 5;
