-- Field-operative access code: a single unique bearer credential per user (used by
-- field coordinators to sign in by typing the code or scanning a QR/login link).
-- Additive only.
alter table ngo_users add column if not exists login_code text;
create unique index if not exists ngo_users_login_code on ngo_users (login_code) where login_code is not null;
