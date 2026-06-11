-- ============================================================
-- Civilian area-alert subscriptions (ntfy) — additive
-- ============================================================
-- Lets a civilian subscribe to push alerts for a chosen area (lat/lon + radius). A scheduled
-- dispatch job matches newly-verified incidents / active warnings to subscribed areas and
-- publishes to each subscription's high-entropy ntfy topic. No account; the IP is only stored
-- hashed, for abuse control. Civilian pipeline tables are untouched (read-only by the job).

create table if not exists alert_subscriptions (
  id               uuid             primary key default gen_random_uuid(),
  topic            text             not null unique,         -- high-entropy ntfy topic the user subscribes to
  lat              double precision not null,
  lon              double precision not null,
  radius_metres    int              not null default 5000 check (radius_metres between 500 and 50000),
  lang             text             not null default 'en' check (lang in ('en', 'fr', 'ar')),
  active           boolean          not null default true,
  ip_hash          text,                                     -- hashed (abuse only); raw IP never stored
  created_at       timestamptz      not null default now(),
  last_notified_at timestamptz
);
create index if not exists alert_subscriptions_active_idx on alert_subscriptions (active);
alter table alert_subscriptions enable row level security;  -- service-role only; no public policy

-- Dedup ledger: one row per (subscription, incident/warning) already alerted, so a subscriber
-- is never pinged twice for the same event even if the dispatch window overlaps.
create table if not exists alert_notifications (
  id              uuid        primary key default gen_random_uuid(),
  subscription_id uuid        not null references alert_subscriptions (id) on delete cascade,
  ref_type        text        not null check (ref_type in ('incident', 'warning')),
  ref_id          uuid        not null,
  created_at      timestamptz not null default now(),
  unique (subscription_id, ref_type, ref_id)
);
create index if not exists alert_notifications_sub_idx on alert_notifications (subscription_id);
alter table alert_notifications enable row level security;  -- service-role only; no public policy
