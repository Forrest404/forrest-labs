-- ── Warnings table ───────────────────────────────────────────
-- Each row is one civilian report of receiving an evacuation warning

CREATE TABLE IF NOT EXISTS public.warnings (
  id                uuid primary key
                    default gen_random_uuid(),
  created_at        timestamptz not null
                    default now(),
  lat               float8 not null,
  lon               float8 not null,
  warning_type      text not null,
  source_detail     text,
  session_hash      text not null,
  ip_hash           text not null,
  status            text not null
                    default 'pending',
  cluster_id        uuid,
  constraint warning_type_check check (
    warning_type in (
      'official_order',
      'phone_call',
      'community_warning',
      'leaflet_drop',
      'other'
    )
  )
);

-- ── Warning clusters table ──────────────────────────────────
-- Groups nearby warning reports together

CREATE TABLE IF NOT EXISTS public.warning_clusters (
  id                    uuid primary key
                        default gen_random_uuid(),
  created_at            timestamptz not null
                        default now(),
  updated_at            timestamptz not null
                        default now(),
  centroid_lat          float8 not null,
  centroid_lon          float8 not null,
  warning_ids           uuid[] not null
                        default '{}',
  warning_count         int not null default 0,
  spread_metres         float8,
  dominant_warning_type text,
  confidence_score      float8,
  status                text not null
                        default 'active',
  location_name         text,
  expires_at            timestamptz,
  converted_to_strike   uuid,
  all_clear_at          timestamptz,
  all_clear_votes       int not null default 0,
  constraint wc_status_check check (
    status in (
      'active',
      'strike_confirmed',
      'all_clear',
      'expired',
      'discarded'
    )
  )
);

-- ── Row Level Security ──────────────────────────────────────

ALTER TABLE public.warnings
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warning_clusters
  ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a warning
CREATE POLICY "Anyone can submit warning"
  ON public.warnings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Service role can read warnings
CREATE POLICY "Service role reads warnings"
  ON public.warnings FOR SELECT
  TO service_role USING (true);

CREATE POLICY "Service role updates warnings"
  ON public.warnings FOR UPDATE
  TO service_role USING (true);

-- Anyone can read active warning clusters
CREATE POLICY "Anyone reads active warnings"
  ON public.warning_clusters FOR SELECT
  TO anon, authenticated
  USING (status IN ('active', 'all_clear', 'strike_confirmed'));

CREATE POLICY "Service role all on warning clusters"
  ON public.warning_clusters FOR ALL
  TO service_role USING (true);

-- ── Realtime ────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime
  ADD TABLE public.warning_clusters;

-- ── Auto-update updated_at ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER warning_clusters_updated_at
  BEFORE UPDATE ON public.warning_clusters
  FOR EACH ROW EXECUTE FUNCTION
  public.handle_updated_at();

-- ── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS warnings_status_idx
  ON public.warnings(status);
CREATE INDEX IF NOT EXISTS warnings_created_at_idx
  ON public.warnings(created_at desc);
CREATE INDEX IF NOT EXISTS wc_status_idx
  ON public.warning_clusters(status);
CREATE INDEX IF NOT EXISTS wc_expires_at_idx
  ON public.warning_clusters(expires_at);
