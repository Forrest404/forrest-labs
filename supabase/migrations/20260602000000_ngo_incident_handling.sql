-- NGO incident handling: dismiss / auto-complete / reopen.
-- Public clusters are READ-ONLY to NGOs, so an org's handling state for a cluster
-- lives in this NGO-owned overlay table. A row means the org has dismissed or
-- completed that incident; no row = active. Additive only — civilian tables untouched.
create table if not exists ngo_cluster_status (
  org_id     uuid        not null references ngo_organisations (id) on delete cascade,
  cluster_id uuid        not null references clusters (id) on delete cascade,
  status     text        not null check (status in ('dismissed', 'completed')),
  updated_by uuid        references ngo_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (org_id, cluster_id)
);
-- Service-role only, matching every other ngo_* table (no public policy).
alter table ngo_cluster_status enable row level security;

-- Custom (org-created) incidents gain 'dismissed' alongside open/resolved.
-- This widens our own NGO table's check constraint; no civilian table is affected.
alter table ngo_incidents drop constraint if exists ngo_incidents_status_check;
alter table ngo_incidents add constraint ngo_incidents_status_check
  check (status in ('open', 'resolved', 'dismissed'));
