-- Allow news_verified and official_verified statuses on clusters,
-- introduced by the detect-strikes Edge Function. Without this the
-- function's UPDATE fails the CHECK constraint and the public RLS
-- policy hides any rows that did get through.

alter table clusters
  drop constraint if exists clusters_status_check;

alter table clusters
  add constraint clusters_status_check
  check (status in (
    'confirmed',
    'auto_confirmed',
    'news_verified',
    'official_verified',
    'pending_review',
    'discarded'
  ));

drop policy if exists "clusters_select_confirmed" on clusters;

create policy "clusters_select_confirmed"
  on clusters for select
  to anon, authenticated
  using (status in (
    'confirmed',
    'auto_confirmed',
    'news_verified',
    'official_verified'
  ));
