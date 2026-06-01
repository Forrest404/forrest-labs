-- ============================================================
-- Broadcast channel: targeting, urgency, per-recipient delivery + acknowledgement
-- ============================================================
-- Extends the existing `broadcasts` table (one-way leader→field messages) and adds a
-- per-recipient table so the sender can see delivery (read receipts) and, for urgent
-- broadcasts, who has acknowledged. Push is the only channel for now (fired through the
-- existing notification engine); SMS is deferred behind an inert hook in the API.
-- Additive only — nothing existing is dropped or altered destructively.
-- ============================================================

alter table broadcasts
  add column if not exists target_type  text not null default 'all',     -- all | team | leaders
  add column if not exists team_id      uuid references ngo_teams (id) on delete set null,
  add column if not exists urgency      text not null default 'routine',  -- routine | urgent
  add column if not exists client_token text;                             -- idempotency (single-fire)

-- A repeated send with the same client_token returns the SAME broadcast (no double-send).
create unique index if not exists broadcasts_idem
  on broadcasts (org_id, client_token) where client_token is not null;

create table if not exists broadcast_recipients (
  id              uuid        primary key default gen_random_uuid(),
  broadcast_id    uuid        not null references broadcasts (id) on delete cascade,
  org_id          uuid        not null references ngo_organisations (id) on delete cascade,
  ngo_user_id     uuid        not null references ngo_users (id) on delete cascade,
  delivered_at    timestamptz,   -- set when the recipient's client first fetches it (read receipt)
  acknowledged_at timestamptz,   -- set when the recipient taps "Acknowledge" (urgent only)
  created_at      timestamptz not null default now(),
  unique (broadcast_id, ngo_user_id)
);
create index if not exists broadcast_recipients_bcast on broadcast_recipients (broadcast_id);
create index if not exists broadcast_recipients_user  on broadcast_recipients (ngo_user_id, created_at desc);
alter table broadcast_recipients enable row level security;  -- service-role only; no public policy
