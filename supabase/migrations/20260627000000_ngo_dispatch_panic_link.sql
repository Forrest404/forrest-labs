-- Link a panic-response dispatch to its panic_events row (data-retention fix, audit C1).
--
-- Before: app/api/ngo/safety/panic/[id]/dispatch wrote the worker's NAME + place + an exact
-- google-maps link into ngo_dispatches.note. purge_ngo_location() never touches dispatch
-- notes, so the most sensitive datum (a named worker in duress, with coordinates) outlived
-- the retention window indefinitely and survived even after the panic row itself was purged.
--
-- After: the dispatch carries a panic_id reference; the responder/leader views resolve the
-- live location from the panic_events row (which IS purged). ON DELETE SET NULL means when
-- the panic is purged or its user removed, the link drops and the location naturally
-- disappears — retention is honoured. The note becomes a generic, identity-free string.
--
-- Additive + idempotent; code tolerates the column's absence (pre-migration fallback).

alter table ngo_dispatches
  add column if not exists panic_id uuid references panic_events (id) on delete set null;

create index if not exists ngo_dispatches_panic_id
  on ngo_dispatches (panic_id) where panic_id is not null;
