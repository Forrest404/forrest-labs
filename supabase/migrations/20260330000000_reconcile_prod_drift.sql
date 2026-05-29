-- ============================================================
-- Reconcile tracked migrations with live production
-- ============================================================
-- Production was extended directly in the Supabase dashboard over
-- time; several tables/columns exist in the live DB but were never
-- captured as migrations. This file makes the repo reproduce prod.
--
-- Authored from the live PostgREST OpenAPI schema (exact column
-- names, types, nullability, PK/FK), not guessed.
--
-- STRICTLY ADDITIVE & IDEMPOTENT:
--   * only `add column if not exists` / `create table if not exists`
--   * never alters or drops an existing live column or table
--   * safe to run against prod (no-ops on what already exists) and
--     reproduces prod from scratch on a fresh database
--
-- RLS: every reconciled table is accessed only via the service role
-- (server API routes + edge functions), which bypasses RLS. In prod
-- anon/authenticated read returns 0 rows on all of these. We mirror
-- that by enabling RLS with no public policies (service-role only).
-- Status/type columns are left as free text WITHOUT check
-- constraints: the live allowed-value sets aren't introspectable
-- from PostgREST, and a guessed CHECK could wrongly reject valid
-- rows on a fresh rebuild. Adding a CHECK later is a separate change.
-- ============================================================


-- ── alerts: column added directly in prod, missing from schema.sql ──
alter table alerts
  add column if not exists location_name text;


-- ── news_articles ────────────────────────────────────────────
-- Populated by the fetch-news edge function; read by /api/news.
create table if not exists news_articles (
  id                uuid        primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  fetched_at        timestamptz not null default now(),
  source            text        not null,
  title             text        not null,
  url               text        not null,
  published_at      timestamptz,
  summary           text,
  location_name     text,
  location_lat      float8,
  location_lon      float8,
  event_type        text,
  casualty_count    int,
  ai_relevance      float8,
  linked_cluster_id uuid        references clusters (id) on delete set null,
  match_confidence  float8,
  status            text        not null default 'new'
);
create index if not exists news_articles_published_at
  on news_articles (published_at desc);
create unique index if not exists news_articles_url_key
  on news_articles (url);


-- ── source_reliability ───────────────────────────────────────
-- Maintained by the update-reliability edge function.
create table if not exists source_reliability (
  session_hash      text        primary key,
  first_seen        timestamptz default now(),
  last_seen         timestamptz default now(),
  total_reports     int         default 0,
  confirmed_reports int         default 0,
  rejected_reports  int         default 0,
  reliability_score float8      default 0,
  flagged           boolean     default false,
  flag_reason       text
);


-- ── admin_audit_log ──────────────────────────────────────────
create table if not exists admin_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  action      text        not null,
  entity_type text        not null,
  entity_id   uuid,
  actor       text        not null,
  details     jsonb,
  ip_hash     text
);
create index if not exists admin_audit_log_created_at
  on admin_audit_log (created_at desc);


-- ── organisations ────────────────────────────────────────────
-- Referenced by teams / dispatches / resources / partner_accounts,
-- so it must be created first.
create table if not exists organisations (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  name             text        not null,
  type             text        not null,
  contact_email    text,
  contact_name     text,
  operational_area text,
  active           boolean     default true
);


-- ── teams ────────────────────────────────────────────────────
create table if not exists teams (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  name            text        not null,
  organisation_id uuid        not null references organisations (id) on delete cascade,
  team_type       text        not null,
  status          text        not null,
  current_lat     float8,
  current_lon     float8,
  location_name   text,
  capacity        int,
  notes           text,
  active          boolean     default true
);
create index if not exists teams_organisation_id
  on teams (organisation_id);


-- ── dispatches ───────────────────────────────────────────────
create table if not exists dispatches (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  team_id         uuid        not null references teams (id) on delete cascade,
  cluster_id      uuid        references clusters (id) on delete set null,
  warning_id      uuid        references warning_clusters (id) on delete set null,
  assigned_by     text        not null,
  assigned_at     timestamptz not null default now(),
  acknowledged_at timestamptz,
  arrived_at      timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  notes           text,
  status          text        not null
);
create index if not exists dispatches_team_id
  on dispatches (team_id);
create index if not exists dispatches_cluster_id
  on dispatches (cluster_id);


-- ── partner_accounts ─────────────────────────────────────────
create table if not exists partner_accounts (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  organisation_id uuid        not null references organisations (id) on delete cascade,
  email           text        not null,
  password_hash   text        not null,
  role            text        not null,
  active          boolean     default true,
  last_login      timestamptz
);
create unique index if not exists partner_accounts_email_key
  on partner_accounts (email);


-- ── resources ────────────────────────────────────────────────
create table if not exists resources (
  id                  uuid        primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  organisation_id     uuid        not null references organisations (id) on delete cascade,
  resource_type       text        not null,
  name                text        not null,
  quantity_total      int         not null default 0,
  quantity_available  int         not null default 0,
  unit                text,
  low_stock_threshold int,
  notes               text
);
create index if not exists resources_organisation_id
  on resources (organisation_id);


-- ── admin_zones ──────────────────────────────────────────────
create table if not exists admin_zones (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text        not null,
  zone_type  text        not null,
  geojson    jsonb       not null,
  colour     text,
  notes      text,
  created_by text
);


-- ── case_files ───────────────────────────────────────────────
create table if not exists case_files (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text        not null,
  description text,
  status      text        not null,
  cluster_ids uuid[]      default '{}',
  created_by  text        not null,
  tags        text[]      default '{}'
);


-- ── situation_reports ────────────────────────────────────────
create table if not exists situation_reports (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  title        text        not null,
  period_start timestamptz not null,
  period_end   timestamptz not null,
  cluster_ids  uuid[]      default '{}',
  summary      text,
  generated_by text        not null,
  format       text,
  data         jsonb
);


-- ── official_sources ─────────────────────────────────────────
create table if not exists official_sources (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  source_name    text        not null,
  source_type    text        not null,
  url            text        not null,
  title          text        not null,
  published_at   timestamptz,
  location_name  text,
  location_lat   float8,
  location_lon   float8,
  casualty_count int,
  cluster_id     uuid        references clusters (id) on delete set null,
  processed      boolean     default false
);


-- ── updated_at triggers (match schema.sql convention) ────────
-- set_updated_at() is defined in 20260325000000_schema.sql.
drop trigger if exists teams_updated_at on teams;
create trigger teams_updated_at
  before update on teams
  for each row execute function set_updated_at();

drop trigger if exists resources_updated_at on resources;
create trigger resources_updated_at
  before update on resources
  for each row execute function set_updated_at();

drop trigger if exists case_files_updated_at on case_files;
create trigger case_files_updated_at
  before update on case_files
  for each row execute function set_updated_at();


-- ── Row Level Security ───────────────────────────────────────
-- Service-role-only access (the service role bypasses RLS). Enabling
-- RLS with no public policy blocks anon/authenticated, mirroring prod
-- where anon reads return 0 rows on every one of these tables.
alter table news_articles      enable row level security;
alter table source_reliability enable row level security;
alter table admin_audit_log    enable row level security;
alter table organisations      enable row level security;
alter table teams              enable row level security;
alter table dispatches         enable row level security;
alter table partner_accounts   enable row level security;
alter table resources          enable row level security;
alter table admin_zones        enable row level security;
alter table case_files         enable row level security;
alter table situation_reports  enable row level security;
alter table official_sources   enable row level security;


-- ── Realtime publication membership ──────────────────────────
-- Prod has clusters/reports/warnings in supabase_realtime (added via
-- the dashboard), but the migrations only ever declared alerts and
-- warning_clusters. The public map subscribes to realtime on `clusters`
-- (app/map/page.tsx) and has no polling fallback, so without clusters in
-- the publication a fresh rebuild's map would not update live. Capture
-- the full prod membership here. Guarded so it is a no-op when a table
-- is already a member (Postgres has no ADD TABLE IF NOT EXISTS for
-- publications). Assumes the supabase_realtime publication already exists,
-- consistent with the existing alerts/warning_clusters statements.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clusters'
  ) then
    alter publication supabase_realtime add table clusters;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table reports;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'warnings'
  ) then
    alter publication supabase_realtime add table warnings;
  end if;
end $$;
