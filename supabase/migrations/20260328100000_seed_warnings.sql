-- Historical seed data: known IDF evacuation orders from March 2026

INSERT INTO public.warning_clusters (
  created_at, updated_at,
  centroid_lat, centroid_lon,
  warning_ids, warning_count,
  confidence_score, status,
  dominant_warning_type,
  location_name, expires_at,
  converted_to_strike, all_clear_votes
) VALUES
-- 4 March — evac order southern Beirut suburbs
('2026-03-04T06:00:00Z','2026-03-04T06:00:00Z',
33.8400,35.5100,ARRAY[]::uuid[],24,92,
'strike_confirmed','official_order',
'Southern Beirut suburbs (Bourj el-Barajneh, Hadath, Haret Hreik, Chiyah)',
'2026-03-04T12:00:00Z', NULL, 0),
-- 5 March — evac entire south of Litani
('2026-03-05T08:00:00Z','2026-03-05T08:00:00Z',
33.2500,35.3800,ARRAY[]::uuid[],89,98,
'strike_confirmed','official_order',
'All areas south of Litani River (850 sq km, 500,000 people)',
'2026-03-05T20:00:00Z', NULL, 0),
-- 7 March — evac southern Lebanon second wave
('2026-03-07T07:00:00Z','2026-03-07T07:00:00Z',
33.1800,35.4000,ARRAY[]::uuid[],45,96,
'strike_confirmed','official_order',
'Southern Lebanon — IDF wave of airstrikes warning',
'2026-03-07T19:00:00Z', NULL, 0),
-- 9 March — southern Beirut suburbs again
('2026-03-09T06:00:00Z','2026-03-09T06:00:00Z',
33.8500,35.5000,ARRAY[]::uuid[],38,95,
'strike_confirmed','official_order',
'Southern Beirut — second displacement order',
'2026-03-09T18:00:00Z', NULL, 0),
-- 18 March — Bashoura displacement order
('2026-03-18T04:00:00Z','2026-03-18T04:00:00Z',
33.8870,35.5030,ARRAY[]::uuid[],12,88,
'strike_confirmed','official_order',
'Bashoura — early morning displacement order',
'2026-03-18T10:00:00Z', NULL, 0),
-- 22 March — Zahrani River evacuation
('2026-03-22T09:00:00Z','2026-03-22T09:00:00Z',
33.5600,35.3700,ARRAY[]::uuid[],67,97,
'strike_confirmed','official_order',
'All areas south of Zahrani River — IDF evacuation order',
'2026-03-22T21:00:00Z', NULL, 0);
