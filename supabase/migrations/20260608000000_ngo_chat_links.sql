-- ============================================================
-- NGO group-chat links (additive, new table only)
-- ============================================================
-- NOUR does NOT host messaging. This table holds links to an org's EXISTING
-- external chat groups (Signal / WhatsApp / Telegram / other) so signed-in members
-- can tap to join. Generalises the per-team ngo_teams.group_chat_url field into an
-- org/team-scoped directory with full CRUD. The existing group_chat_url column is
-- left untouched (still used by the field view). Service-role only (RLS enabled, no
-- public policy); the API enforces org-scope via .eq('org_id', session.orgId).
-- ============================================================

create table if not exists chat_links (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references ngo_organisations (id) on delete cascade,
  label       text        not null,
  platform    text        not null default 'other'
                          check (platform in ('signal', 'whatsapp', 'telegram', 'other')),
  url         text        not null,
  scope       text        not null default 'org'
                          check (scope in ('org', 'team')),
  team_id     uuid        references ngo_teams (id) on delete cascade,   -- required when scope='team'
  description text,
  created_by  uuid        references ngo_users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists chat_links_org_id on chat_links (org_id);
create index if not exists chat_links_org_team on chat_links (org_id, team_id);

alter table chat_links enable row level security;
