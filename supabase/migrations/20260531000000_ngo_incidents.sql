-- NGO custom incidents (911-style dispatch). Additive only — new table + a nullable
-- column on the NGO-owned ngo_dispatches table. Civilian tables untouched.

create table if not exists ngo_incidents (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references ngo_organisations (id) on delete cascade,
  title       text        not null,
  category    text,        -- medical | fire | rescue | flood | shelter | security | other
  severity    text        not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  description text,
  address     text,
  lat         float8      not null,
  lon         float8      not null,
  status      text        not null default 'open' check (status in ('open', 'resolved')),
  created_by  uuid        references ngo_users (id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid        references ngo_users (id) on delete set null
);
create index if not exists ngo_incidents_org on ngo_incidents (org_id, created_at desc);

-- Service-role only, matching every other ngo_* table (no public policy).
alter table ngo_incidents enable row level security;

-- A dispatch can target a custom incident (in addition to a civilian cluster or a
-- panic). Nullable, additive.
alter table ngo_dispatches add column if not exists ngo_incident_id uuid references ngo_incidents (id) on delete set null;
