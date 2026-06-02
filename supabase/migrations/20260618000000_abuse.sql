-- ============================================================
-- Fraud & abuse: blocklist + volume aggregation (additive)
-- ============================================================
-- Lets an admin flag/block an abusive session or IP (by hash — raw values are never
-- stored anywhere), and surfaces persistent high-volume submitters from existing report
-- data. Nothing here recomputes a fraud score; clusters already carry fraud_score and the
-- sub-scores. Enforcement: lib/abuse.ts isBlocked() gates /api/reports + /api/warnings.
-- ============================================================

create table if not exists blocked_identifiers (
  id              uuid        primary key default gen_random_uuid(),
  identifier_type text        not null check (identifier_type in ('ip', 'session')),
  identifier_hash text        not null,                 -- sha256 hash (never a raw IP/session)
  action          text        not null default 'block' check (action in ('flag', 'block')),
  reason          text,
  reviewed        boolean     not null default false,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (identifier_type, identifier_hash)
);
create index if not exists blocked_identifiers_lookup on blocked_identifiers (identifier_hash, action);
alter table blocked_identifiers enable row level security;  -- service-role only; no public policy

-- Persistent high-volume submitters, surfaced from existing reports (rate-limiting caps
-- 1 report / 10 min, so a high count over a window = repeated, deliberate abuse). Returns
-- the worst offenders by ip_hash AND by session_hash in one set.
create or replace function fraud_volume(p_since timestamptz, p_min int)
returns table (identifier_type text, identifier_hash text, cnt bigint, last_at timestamptz)
language sql stable
as $$
  select 'ip'::text, ip_hash, count(*), max(created_at)
  from reports where created_at >= p_since and ip_hash is not null
  group by ip_hash having count(*) >= p_min
  union all
  select 'session'::text, session_hash, count(*), max(created_at)
  from reports where created_at >= p_since and session_hash is not null
  group by session_hash having count(*) >= p_min
  order by 3 desc
  limit 100;
$$;
