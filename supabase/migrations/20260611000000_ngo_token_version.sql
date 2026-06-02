-- ============================================================
-- NGO per-user session revocation (token_version) — additive
-- ============================================================
-- Lets an org_admin remotely sign a user out of ALL devices immediately (e.g. a lost or
-- seized field phone) without suspending the account. The NGO JWT carries token_version;
-- getNgoSession rejects any token whose version is below the user's current value, so
-- bumping this column invalidates every token already issued to that user on their next
-- request. Default 1 so existing/newly-minted tokens match until a revoke is issued.
-- ============================================================

alter table ngo_users
  add column if not exists token_version int not null default 1;
