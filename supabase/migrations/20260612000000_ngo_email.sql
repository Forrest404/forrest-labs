-- ============================================================
-- Transactional email: single-use tokens + send log (additive)
-- ============================================================
-- Supports invite / password-reset / 2FA-recovery flows and a minimal-PII send log
-- (also the source for durable rate-limiting). Tokens are stored ONLY as a sha256 hash
-- of a cryptographically-random value — never the raw token — so a DB read can't
-- reconstruct a live link. Service-role only (RLS on, no policy).
-- ============================================================

create table if not exists ngo_auth_tokens (
  id            uuid        primary key default gen_random_uuid(),
  kind          text        not null check (kind in ('invite', 'password_reset', 'recovery')),
  token_hash    text        not null unique,            -- sha256 hex of the raw token
  ngo_user_id   uuid        references ngo_users (id) on delete cascade,
  org_id        uuid        not null references ngo_organisations (id) on delete cascade,
  email         text,
  role          text,                                   -- invite: role to assign
  team_id       uuid        references ngo_teams (id) on delete cascade,
  created_by    uuid        references ngo_users (id) on delete set null,
  expires_at    timestamptz not null,
  used_at       timestamptz,                            -- set on consume → single-use
  created_at    timestamptz not null default now()
);
create index if not exists ngo_auth_tokens_hash    on ngo_auth_tokens (token_hash);
create index if not exists ngo_auth_tokens_expires on ngo_auth_tokens (expires_at);
alter table ngo_auth_tokens enable row level security;

-- Send log: who/what/when (never the token or body). Doubles as the durable rate-limit
-- source — count rows for a recipient_hash + kind within a window.
create table if not exists ngo_email_log (
  id             uuid        primary key default gen_random_uuid(),
  kind           text        not null,
  recipient_hash text        not null,                  -- sha256 hex of the email address
  org_id         uuid        references ngo_organisations (id) on delete set null,
  status         text        not null default 'sent',   -- sent | stubbed | failed
  created_at     timestamptz not null default now()
);
create index if not exists ngo_email_log_rate on ngo_email_log (recipient_hash, kind, created_at);
create index if not exists ngo_email_log_org  on ngo_email_log (org_id);
alter table ngo_email_log enable row level security;
