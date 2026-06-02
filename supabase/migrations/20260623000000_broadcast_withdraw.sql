-- Edit / withdraw a broadcast. Additive + nullable, so existing rows and the live app are
-- unaffected (reads tolerate the columns being absent until this is applied).
--   withdrawn_at — set when a sender withdraws a broadcast: it's removed from the in-app feed
--                  (both leaders' history and field staff's list) but kept for audit. This does
--                  NOT un-send the original push, which already went out.
--   edited_at    — set when the body is corrected after sending, so the UI can show "(edited)".

alter table broadcasts add column if not exists withdrawn_at timestamptz;
alter table broadcasts add column if not exists edited_at    timestamptz;
