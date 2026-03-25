-- ============================================================
-- Forrest Labs — complete database setup
-- Run this once in Supabase → SQL Editor
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
-- Enable pg_cron (scheduled jobs) and pg_net (HTTP from SQL)
-- You must also toggle these in: Database → Extensions
create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;


-- ── reports ──────────────────────────────────────────────────
-- One row per civilian submission.
-- No names, no raw IPs — only hashed identifiers.

create table if not exists reports (
  id               uuid        primary key default gen_random_uuid(),
  lat              float8      not null,
  lon              float8      not null,
  distance_band    text        not null
                               check (distance_band in (
                                 'under_500m', '500m_1km',
                                 '1km_3km',   'over_3km'
                               )),
  event_types      text[]      not null default '{}',
  session_hash     text        not null,   -- SHA-256 of browser session ID
  ip_hash          text        not null,   -- SHA-256 of IP address
  media_url        text,                   -- set by worker after blurring
  media_status     text        not null default 'none'
                               check (media_status in (
                                 'none', 'processing', 'approved', 'rejected'
                               )),
  status           text        not null default 'pending'
                               check (status in (
                                 'pending', 'clustered'
                               )),
  cluster_id       uuid,                   -- FK added after clusters table
  created_at       timestamptz not null default now()
);

-- Index for the clustering query (pending reports, recent first)
create index if not exists reports_status_created_at
  on reports (status, created_at desc);

-- Index for cluster membership lookups
create index if not exists reports_cluster_id
  on reports (cluster_id);


-- ── clusters ─────────────────────────────────────────────────
-- Grouped reports produced by the edge function.

create table if not exists clusters (
  id                    uuid        primary key default gen_random_uuid(),
  centroid_lat          float8      not null,
  centroid_lon          float8      not null,
  report_ids            uuid[]      not null default '{}',
  report_count          int         not null default 0,
  spread_metres         float8      not null default 0,
  time_window_seconds   int         not null default 0,
  unique_sessions       int         not null default 0,
  unique_ips            int         not null default 0,
  dominant_event_types  text[]      not null default '{}',
  display_radius_metres float8      not null default 150,
  status                text        not null default 'pending_review'
                                    check (status in (
                                      'auto_confirmed',
                                      'pending_review',
                                      'discarded'
                                    )),
  -- Confidence score components (0–100 each)
  confidence_score      int         not null default 0,
  volume_subscore       int         not null default 0,
  diversity_subscore    int         not null default 0,
  timing_subscore       int         not null default 0,
  context_subscore      int         not null default 0,
  media_subscore        int         not null default 0,
  fraud_score           int         not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- GIN index so the edge function can do .overlaps('report_ids', [...])
create index if not exists clusters_report_ids_gin
  on clusters using gin (report_ids);

create index if not exists clusters_status
  on clusters (status);


-- ── Add FK from reports → clusters ───────────────────────────

alter table reports
  add constraint fk_reports_cluster
    foreign key (cluster_id) references clusters (id)
    on delete set null;


-- ── alerts ───────────────────────────────────────────────────
-- Confirmed events shown on the public live map.
-- Populated by the edge function when confidence ≥ 85.

create table if not exists alerts (
  id             uuid        primary key default gen_random_uuid(),
  cluster_id     uuid        not null unique references clusters (id) on delete cascade,
  confirmed_by   text        not null default 'ai_auto',
  radius_metres  float8      not null default 150,
  created_at     timestamptz not null default now()
);

create index if not exists alerts_created_at
  on alerts (created_at desc);


-- ── updated_at trigger for clusters ──────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clusters_updated_at on clusters;
create trigger clusters_updated_at
  before update on clusters
  for each row execute function set_updated_at();


-- ── Row Level Security ────────────────────────────────────────

alter table reports  enable row level security;
alter table clusters enable row level security;
alter table alerts   enable row level security;

-- reports: anyone can insert (anonymous civilian), nobody can read
create policy "reports_insert_anon"
  on reports for insert
  to anon, authenticated
  with check (true);

-- clusters: service role only (edge function + API routes)
-- (no public policy = anon/authenticated cannot read or write)

-- alerts: public read for the live map, service role writes
create policy "alerts_select_public"
  on alerts for select
  to anon, authenticated
  using (true);


-- ── Realtime ─────────────────────────────────────────────────
-- Enable Realtime on alerts so the map updates live.
-- Run in Supabase → Table Editor → alerts → Realtime toggle,
-- OR via the publication below:

alter publication supabase_realtime add table alerts;


-- ── pg_cron job — call cluster-reports edge function every minute ──
-- Replace [project-ref] and [service-role-key] before running.

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
