-- ============================================================
-- Admin manage: allow a report to be discarded (additive)
-- ============================================================
-- The admin Reports page was view-only because reports.status was constrained to
-- ('pending','clustered'). Widen the CHECK to also allow 'discarded' so an admin can flag a
-- bogus/spam report. Additive: every existing value stays valid; only a new value is allowed.
-- (warning_clusters.status has no CHECK, so the admin Warnings actions need no migration.)
-- ============================================================

alter table reports drop constraint if exists reports_status_check;
alter table reports add constraint reports_status_check
  check (status in ('pending', 'clustered', 'discarded'));
