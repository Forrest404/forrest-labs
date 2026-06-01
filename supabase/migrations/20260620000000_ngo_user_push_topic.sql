-- ============================================================
-- Per-user push topic (additive)
-- ============================================================
-- Push notifications previously went to a SINGLE per-org ntfy topic, so every alert reached
-- everyone in the org who subscribed — a team-only dispatch still buzzed the whole org. This
-- adds a per-USER topic so push can target exactly the intended recipients (a team, specific
-- users, or a role) and finally honour each user's notif_push / off-duty / quiet-hours.
--
-- The topic is generated lazily (like ngo_organisations.ntfy_topic): resolveUserTopic in
-- lib/ngo-notify.ts fills it on first use and falls back to the org topic if this column is
-- not yet present, so behaviour degrades gracefully mid-migration. No existing column or
-- table is altered.
-- ============================================================

alter table ngo_users add column if not exists push_topic text;
