-- ============================================================
-- NGO settings: personal prefs + org notification defaults (additive)
-- ============================================================
-- Personal (per-user): language, notification channel prefs, optional quiet hours.
-- Org defaults: which event types raise alerts org-wide. Personal prefs OVERRIDE org
-- defaults per user. SAFETY-CRITICAL alerts (panic, roll-call, missed-check-in
-- escalation) ALWAYS deliver regardless of any of these — enforced in lib/ngo-notify.ts.
-- quiet_start/quiet_end are minutes-of-day (0–1439); null = no quiet hours.
-- ============================================================

alter table ngo_users
  add column if not exists language    text,
  add column if not exists notif_push  boolean not null default true,
  add column if not exists notif_sms   boolean not null default true,
  add column if not exists quiet_start  int,
  add column if not exists quiet_end    int;

alter table ngo_organisations
  add column if not exists alert_new_incident   boolean not null default true,
  add column if not exists alert_missed_checkin boolean not null default true,
  add column if not exists alert_panic          boolean not null default true,
  add column if not exists alert_low_ack        boolean not null default true;
