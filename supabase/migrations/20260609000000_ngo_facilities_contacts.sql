-- ============================================================
-- NGO facilities & contacts (additive, new tables only)
-- ============================================================
-- "Where do we take people" (facilities) and "who do we call" (contacts), per org.
-- No existing table is altered. Service-role only (RLS enabled, no public policy);
-- the API enforces org-scope via .eq('org_id', session.orgId), like every ngo_* table.
-- source flags seeded reference rows ('seed') vs org-created ones ('user').
-- status_updated_at is null until the org sets a live status (stale status is dangerous,
-- so the UI surfaces "updated Xago" / "status not set").
-- ============================================================

create table if not exists facilities (
  id                uuid        primary key default gen_random_uuid(),
  org_id            uuid        not null references ngo_organisations (id) on delete cascade,
  name              text        not null,
  type              text        not null default 'other'
                                check (type in ('hospital','clinic','field_hospital','shelter',
                                                'distribution','safe_area','fuel','water','other')),
  lat               double precision,
  lon               double precision,
  status            text        not null default 'unknown'
                                check (status in ('open','closed','full','unknown')),
  capacity_note     text,
  phone             text,
  address           text,
  notes             text,
  source            text        not null default 'user' check (source in ('user','seed')),
  status_updated_at timestamptz,
  created_by        uuid        references ngo_users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists facilities_org_id     on facilities (org_id);
create index if not exists facilities_org_status on facilities (org_id, status);
alter table facilities enable row level security;

create table if not exists contacts (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        not null references ngo_organisations (id) on delete cascade,
  name         text        not null,
  organisation text,
  role         text,
  phone        text,
  notes        text,
  created_by   uuid        references ngo_users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists contacts_org_id on contacts (org_id);
alter table contacts enable row level security;
