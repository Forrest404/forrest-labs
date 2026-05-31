-- Per-team external group-chat link (Signal / WhatsApp / Telegram). Additive only —
-- a single nullable column on the NGO-owned ngo_teams table. The field view opens the
-- worker's team link in one tap; org_admin/team_leader set it on the Teams page.
alter table ngo_teams add column if not exists group_chat_url text;
