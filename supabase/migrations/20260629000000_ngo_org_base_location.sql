-- Worldwide NGO onboarding: where an organisation is BASED (audit: un-pin the NGO
-- dashboard from Lebanon).
--
-- The org model was already location-agnostic once the operational-area polygon was
-- drawn — but every default (board/setup/field map centres, geocoding bias) was
-- hardcoded to Lebanon. The org now stores a base point chosen via a worldwide place
-- search at signup (editable from the operational-area setup): maps centre on it and
-- geocoding biases to it. Nullable — existing orgs keep their current behaviour
-- (polygon centroid → Lebanon fallback) until they set one.
--
-- Additive + idempotent; code carries pre-migration fallbacks.

alter table ngo_organisations add column if not exists base_lat   float8;
alter table ngo_organisations add column if not exists base_lon   float8;
alter table ngo_organisations add column if not exists base_zoom  real;
alter table ngo_organisations add column if not exists base_label text;
