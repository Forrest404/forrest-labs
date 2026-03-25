-- Allow the public (anon/authenticated) to read confirmed clusters
-- so the live map and Realtime subscriptions work with the browser client.
-- Only confirmed and auto_confirmed rows are visible; pending_review
-- and discarded remain hidden.

create policy "clusters_select_confirmed"
  on clusters for select
  to anon, authenticated
  using (status in ('confirmed', 'auto_confirmed'));
