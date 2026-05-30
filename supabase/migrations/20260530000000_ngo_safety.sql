-- NGO people & safety — additive only. Never alters/drops existing tables.

-- Per-org proof-of-life window (minutes). Drives missed-check-in escalation.
alter table ngo_organisations
  add column if not exists checkin_window_minutes int not null default 240;

-- Log of escalations sent, so the scheduled job doesn't re-alert the same level
-- repeatedly for the same overdue streak.
create table if not exists safety_escalations (
  id          uuid        primary key default gen_random_uuid(),
  ngo_user_id uuid        not null references ngo_users (id) on delete cascade,
  level       text        not null check (level in ('amber', 'red')),
  created_at  timestamptz not null default now()
);
create index if not exists safety_escalations_user on safety_escalations (ngo_user_id, created_at desc);

-- Service-role only, matching every other NGO table (no public policy).
alter table safety_escalations enable row level security;
