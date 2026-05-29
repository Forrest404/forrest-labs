-- ============================================================
-- NGO platform — database foundation (additive, new tables only)
-- ============================================================
-- The NGO dashboard is a separate product surface from the partner
-- portal. It gets its own ngo_* tables and reuses ONLY the existing
-- `clusters` table by read-only FK reference (NGOs read incidents,
-- never write them). No existing table is altered or dropped.
--
-- Conventions match the existing migrations: uuid PKs, timestamptz
-- defaults, CHECK constraints for enum-like fields. All new tables get
-- RLS enabled with NO public policy (service-role-only) — aid-worker
-- locations are sensitive; NGO API routes use the service client.
-- ============================================================

-- ── ngo_organisations ────────────────────────────────────────
create table if not exists ngo_organisations (
  id                      uuid        primary key default gen_random_uuid(),
  name                    text        not null,
  type                    text        not null,
  country                 text,
  operational_area        jsonb,                         -- GeoJSON polygon
  status                  text        not null default 'pending'
                                      check (status in ('pending', 'approved', 'suspended')),
  share_team_presence     boolean     not null default false,
  share_operational_area  boolean     not null default false,
  created_at              timestamptz not null default now()
);

-- ── ngo_users ────────────────────────────────────────────────
create table if not exists ngo_users (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references ngo_organisations (id) on delete cascade,
  email         text        not null unique,
  password_hash text,
  pin_hash      text,
  role          text        not null
                            check (role in ('org_admin', 'team_leader', 'field_coordinator')),
  full_name     text,
  phone         text,
  status        text        not null default 'active'
                            check (status in ('active', 'suspended')),
  created_at    timestamptz not null default now()
);
create index if not exists ngo_users_org_id on ngo_users (org_id);

-- ── ngo_teams ────────────────────────────────────────────────
create table if not exists ngo_teams (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null references ngo_organisations (id) on delete cascade,
  name       text        not null,
  type       text        not null
                         check (type in ('medical', 'rescue', 'assessment', 'shelter', 'logistics')),
  capacity   int,
  created_at timestamptz not null default now()
);
create index if not exists ngo_teams_org_id on ngo_teams (org_id);

-- ── team_members ─────────────────────────────────────────────
create table if not exists team_members (
  id                uuid        primary key default gen_random_uuid(),
  team_id           uuid        not null references ngo_teams (id) on delete cascade,
  ngo_user_id       uuid        references ngo_users (id) on delete set null,
  name              text        not null,
  role              text,
  phone             text,
  emergency_contact text,
  created_at        timestamptz not null default now()
);
create index if not exists team_members_team_id on team_members (team_id);

-- ── team_status ──────────────────────────────────────────────
create table if not exists team_status (
  team_id      uuid        primary key references ngo_teams (id) on delete cascade,
  status       text        not null default 'offline'
                           check (status in ('standby', 'deployed', 'unavailable', 'offline')),
  last_lat     float8,
  last_lon     float8,
  last_seen_at timestamptz
);

-- ── check_ins ────────────────────────────────────────────────
create table if not exists check_ins (
  id          uuid        primary key default gen_random_uuid(),
  ngo_user_id uuid        not null references ngo_users (id) on delete cascade,
  team_id     uuid        references ngo_teams (id) on delete set null,
  lat         float8,
  lon         float8,
  status      text,
  note        text,
  created_at  timestamptz not null default now(),
  synced_at   timestamptz
);
create index if not exists check_ins_ngo_user_id on check_ins (ngo_user_id);
create index if not exists check_ins_team_id on check_ins (team_id);
create index if not exists check_ins_created_at on check_ins (created_at desc);

-- ── panic_events ─────────────────────────────────────────────
create table if not exists panic_events (
  id          uuid        primary key default gen_random_uuid(),
  ngo_user_id uuid        not null references ngo_users (id) on delete cascade,
  team_id     uuid        references ngo_teams (id) on delete set null,
  last_lat    float8,
  last_lon    float8,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid        references ngo_users (id) on delete set null
);
create index if not exists panic_events_ngo_user_id on panic_events (ngo_user_id);
create index if not exists panic_events_created_at on panic_events (created_at desc);

-- ── roll_calls ───────────────────────────────────────────────
create table if not exists roll_calls (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references ngo_organisations (id) on delete cascade,
  triggered_by uuid       references ngo_users (id) on delete set null,
  message     text,
  created_at  timestamptz not null default now()
);
create index if not exists roll_calls_org_id on roll_calls (org_id);
create index if not exists roll_calls_created_at on roll_calls (created_at desc);

-- ── roll_call_responses ──────────────────────────────────────
create table if not exists roll_call_responses (
  id           uuid        primary key default gen_random_uuid(),
  roll_call_id uuid        not null references roll_calls (id) on delete cascade,
  ngo_user_id  uuid        not null references ngo_users (id) on delete cascade,
  safe         boolean,
  responded_at timestamptz
);
create index if not exists roll_call_responses_roll_call_id on roll_call_responses (roll_call_id);

-- ── ngo_dispatches ───────────────────────────────────────────
-- cluster_id references the EXISTING clusters table (read-only link).
create table if not exists ngo_dispatches (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references ngo_organisations (id) on delete cascade,
  cluster_id  uuid        references clusters (id) on delete set null,
  team_id     uuid        references ngo_teams (id) on delete set null,
  assigned_by uuid        references ngo_users (id) on delete set null,
  status      text        not null default 'assigned'
                          check (status in ('assigned', 'en_route', 'on_scene', 'done', 'cancelled')),
  note        text,
  assigned_at timestamptz not null default now(),
  en_route_at timestamptz,
  on_scene_at timestamptz,
  done_at     timestamptz
);
create index if not exists ngo_dispatches_org_id on ngo_dispatches (org_id);
create index if not exists ngo_dispatches_cluster_id on ngo_dispatches (cluster_id);
create index if not exists ngo_dispatches_team_id on ngo_dispatches (team_id);
create index if not exists ngo_dispatches_assigned_at on ngo_dispatches (assigned_at desc);

-- ── on_scene_reports ─────────────────────────────────────────
create table if not exists on_scene_reports (
  id              uuid        primary key default gen_random_uuid(),
  dispatch_id     uuid        not null references ngo_dispatches (id) on delete cascade,
  people_assisted int,
  services        text,
  new_hazards     text,
  created_at      timestamptz not null default now()
);
create index if not exists on_scene_reports_dispatch_id on on_scene_reports (dispatch_id);

-- ── ngo_notes ────────────────────────────────────────────────
-- cluster_id references the EXISTING clusters table (read-only link).
create table if not exists ngo_notes (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null references ngo_organisations (id) on delete cascade,
  cluster_id uuid        references clusters (id) on delete set null,
  author_id  uuid        references ngo_users (id) on delete set null,
  body       text        not null,
  created_at timestamptz not null default now()
);
create index if not exists ngo_notes_org_id on ngo_notes (org_id);
create index if not exists ngo_notes_cluster_id on ngo_notes (cluster_id);

-- ── broadcasts ───────────────────────────────────────────────
create table if not exists broadcasts (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null references ngo_organisations (id) on delete cascade,
  sender_id  uuid        references ngo_users (id) on delete set null,
  body       text        not null,
  created_at timestamptz not null default now()
);
create index if not exists broadcasts_org_id on broadcasts (org_id);
create index if not exists broadcasts_created_at on broadcasts (created_at desc);

-- ── Row Level Security (service-role only; no public policy) ──
alter table ngo_organisations   enable row level security;
alter table ngo_users           enable row level security;
alter table ngo_teams           enable row level security;
alter table team_members        enable row level security;
alter table team_status         enable row level security;
alter table check_ins           enable row level security;
alter table panic_events        enable row level security;
alter table roll_calls          enable row level security;
alter table roll_call_responses enable row level security;
alter table ngo_dispatches      enable row level security;
alter table on_scene_reports    enable row level security;
alter table ngo_notes           enable row level security;
alter table broadcasts          enable row level security;
