-- Allow 'confirmed' as a cluster status for founder-approved clusters
-- (distinct from 'auto_confirmed' which is set by the AI pipeline)

alter table clusters
  drop constraint if exists clusters_status_check;

alter table clusters
  add constraint clusters_status_check
  check (status in ('confirmed', 'auto_confirmed', 'pending_review', 'discarded'));
