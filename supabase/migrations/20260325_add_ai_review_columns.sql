-- ============================================================
-- Session 3 additions to the clusters table
-- Run after 20260325_schema.sql
-- ============================================================

-- AI analysis output stored per cluster
alter table clusters
  add column if not exists ai_reasoning text,
  add column if not exists ai_concerns  text[] not null default '{}';

-- Founder review audit trail
alter table clusters
  add column if not exists reviewed_by  text,
  add column if not exists reviewed_at  timestamptz;
