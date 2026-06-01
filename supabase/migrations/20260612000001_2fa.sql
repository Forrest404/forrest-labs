-- ============================================================
-- Two-factor authentication (TOTP) — additive
-- ============================================================
-- TOTP (authenticator app) is the second factor. It works offline and suits this threat
-- model. Email is used only for recovery codes + a security notice on enable/reset.
--   • admin_security — single-row store for the platform/admin 2FA (admin is an env-based
--     account, not an ngo_users row). Recovery codes stored ONLY as hashes (text[]).
--   • ngo_users.totp_secret / totp_enabled — per-NGO-user, OPTIONAL (recommended). Recovery
--     code hashes live in ngo_recovery_hashes (text[]) on the row.
-- Secrets are needed by the server to verify codes, so totp_secret is stored as the base32
-- secret (sensitivity comparable to a password hash; service-role only, RLS on).
-- ============================================================

create table if not exists admin_security (
  id               text        primary key default 'singleton',
  totp_secret      text,                                -- pending or active base32 secret
  totp_enabled     boolean     not null default false,
  recovery_hashes  text[]      not null default '{}',   -- sha256 hashes of one-time codes
  updated_at       timestamptz not null default now()
);
alter table admin_security enable row level security;

alter table ngo_users
  add column if not exists totp_secret      text,
  add column if not exists totp_enabled     boolean not null default false,
  add column if not exists recovery_hashes  text[]  not null default '{}';
