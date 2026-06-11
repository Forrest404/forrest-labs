-- Soft-close an NGO from the settings "Danger zone". Additive + nullable: when set,
-- getNgoSession treats the org as revoked, so every user of that org is signed out on their
-- next request, while ALL the org's data is RETAINED for audit / a platform-operator restore.
-- Reads tolerate the column being absent until this is applied. Does NOT touch the civilian
-- pipeline (clusters/reports/alerts/warnings have no FK back to NGO tables).

alter table ngo_organisations add column if not exists deleted_at timestamptz;
