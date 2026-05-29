-- ============================================================
-- Add the news/auto-detection columns to `clusters`
-- ============================================================
-- These columns exist in production (added directly in the dashboard)
-- and are written by the fetch-news / detect-strikes Edge Functions
-- and the cluster approval flow, but no migration declared them — the
-- prior reconciliation (20260330000000) missed them. Without them a
-- fresh rebuild's pipeline INSERT/UPDATE on clusters would fail.
--
-- Strictly additive & idempotent: add-column-if-not-exists only.
-- Types match the live PostgREST schema. No constraints added
-- (source_type is free text in prod; values are 'official' | 'media').
-- ============================================================

alter table clusters add column if not exists location_name    text;
alter table clusters add column if not exists source_type      text;
alter table clusters add column if not exists source_url        text;
alter table clusters add column if not exists source_name       text;
alter table clusters add column if not exists auto_detected_at  timestamptz;
