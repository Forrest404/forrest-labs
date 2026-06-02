-- Track whether an NGO user has finished setting up push notifications, so the one-time
-- "Set up alerts" nudge on the field screen disappears once they're done. Additive + nullable
-- with a default, so existing rows and the live civilian app are unaffected.

alter table ngo_users
  add column if not exists notif_setup_done boolean not null default false;
