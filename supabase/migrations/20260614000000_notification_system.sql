-- ============================================================
-- Unified notification system: delivery log + per-event prefs (additive)
-- ============================================================
-- One urgency-driven module (lib/ngo-notify.ts) records every send here so a FAILED
-- CRITICAL alert is visible, not silent. The log holds NO message body and NO recipient
-- address — only who (ngo_user_id, nullable for the org-topic push), event, urgency,
-- channel, status. It also backs flood-protection counts for NON-critical events.
--
-- HARD RULE: CRITICAL (panic, roll_call) — and HIGH — are NEVER muted by prefs/quiet
-- hours/off-duty/flood. The prefs tables below only ever hold NORMAL/LOW event types, so
-- there is no row that could silence a life-safety alert.
-- ============================================================

create table if not exists notification_log (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references ngo_organisations (id) on delete cascade,
  ngo_user_id uuid        references ngo_users (id) on delete set null,  -- null = org-topic push
  event_type  text        not null,
  urgency     text        not null,                                      -- critical|high|normal|low
  channel     text        not null,                                      -- push|sms|email
  status      text        not null,                                      -- sent|failed|stubbed|throttled|skipped
  created_at  timestamptz not null default now()
);
create index if not exists notification_log_org  on notification_log (org_id, created_at desc);
create index if not exists notification_log_rate on notification_log (ngo_user_id, event_type, created_at);
alter table notification_log enable row level security;

-- Per-user channel choice for the tunable NORMAL/LOW events only. Absent row → org default.
create table if not exists user_notification_prefs (
  id          uuid        primary key default gen_random_uuid(),
  ngo_user_id uuid        not null references ngo_users (id) on delete cascade,
  org_id      uuid        not null references ngo_organisations (id) on delete cascade,
  event_type  text        not null,
  push        boolean     not null default true,
  sms         boolean     not null default false,
  email       boolean     not null default false,
  unique (ngo_user_id, event_type)
);
create index if not exists user_notification_prefs_user on user_notification_prefs (ngo_user_id);
alter table user_notification_prefs enable row level security;

-- Per-org default routing for the tunable NORMAL/LOW events. Absent row → built-in default.
create table if not exists org_notification_defaults (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null references ngo_organisations (id) on delete cascade,
  event_type text        not null,
  enabled    boolean     not null default true,
  push       boolean     not null default true,
  sms        boolean     not null default false,
  email      boolean     not null default false,
  unique (org_id, event_type)
);
create index if not exists org_notification_defaults_org on org_notification_defaults (org_id);
alter table org_notification_defaults enable row level security;

-- Per-user availability. While off duty: no operational (HIGH/NORMAL/LOW) notifications,
-- and the missed-check-in scan skips this user. Panic + roll-call still always deliver.
alter table ngo_users
  add column if not exists off_duty boolean not null default false;

-- Tracks the last new-incident scan per org so the cron only alerts on genuinely new
-- in-area clusters (never re-alerts).
create table if not exists ngo_incident_scan_state (
  org_id       uuid        primary key references ngo_organisations (id) on delete cascade,
  last_scan_at timestamptz not null default now()
);
alter table ngo_incident_scan_state enable row level security;
