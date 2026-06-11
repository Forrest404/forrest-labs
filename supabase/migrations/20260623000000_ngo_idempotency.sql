-- Idempotency keys for queued offline safety writes.
--
-- The field client queues check-ins and panics in IndexedDB and re-flushes them when
-- the connection returns. On flaky 2G a write can reach the server while the response
-- is lost, so the client keeps the item and re-sends it — creating a DUPLICATE row.
-- A duplicate check-in pollutes the safety log; a duplicate panic is dangerous noise.
--
-- Each queued action now carries a stable, client-generated `client_token`. We persist
-- it on the row and enforce a partial UNIQUE index, so a re-flush of the same action is
-- a no-op (the route detects the existing row and returns success without re-inserting
-- or re-firing notifications). Additive only: nullable column + partial unique index
-- (enforced only when a token is present), so existing rows and any token-less write are
-- unaffected.

alter table check_ins    add column if not exists client_token text;
alter table panic_events add column if not exists client_token text;

create unique index if not exists check_ins_client_token_key
  on check_ins (client_token) where client_token is not null;
create unique index if not exists panic_events_client_token_key
  on panic_events (client_token) where client_token is not null;
