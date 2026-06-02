-- ============================================================
-- SEED: reference hospitals — South Lebanon + Bekaa (additive)
-- ============================================================
-- Real facilities, inserted once per existing org so an org launches non-empty.
-- IMPORTANT: live status changes hourly in this conflict (several of these have been
-- hit or strained) — so every row is seeded status='unknown', status_updated_at=null.
-- The org must verify and maintain live status. NONE seeded as 'open'.
-- source='seed' tags them; all are fully editable/removable by the org.
-- Only Meiss Ej Jabal has confirmed coordinates; all others are town-centroid
-- approximations carrying notes='approx location — verify'. Idempotent: re-running
-- inserts only the rows an org is still missing.
-- ============================================================

insert into facilities (org_id, name, type, lat, lon, status, status_updated_at, phone, address, notes, source)
select o.id, v.name, 'hospital', v.lat, v.lon, 'unknown', null, v.phone, v.address, v.notes, 'seed'
from ngo_organisations o
cross join (values
  -- South Lebanon — Tyre
  ('Hiram Hospital',                       33.2705,  35.2038,  '07/740343', 'Tyre',                                  'approx location — verify'),
  ('Jabal Amel Hospital',                  33.2772,  35.2122,  '07/343852', 'Tyre, El Bas Road',                     'approx location — verify'),
  ('Lebanese Italian Hospital',            33.2610,  35.2030,  '07/344423', 'Tyre, Naqoura main road',               'approx location — verify'),
  -- Bint Jbeil / Marjayoun district
  ('Tebnin Governmental Hospital',         33.1747,  35.4083,  null,        'Tebnine, Nabatieh–Bint Jbeil road',     'approx location — verify; phone unknown'),
  ('Bint Jbeil Governmental Hospital',     33.1206,  35.4308,  null,        'Bint Jbeil',                            'approx location — verify; phone unknown'),
  ('Meiss Ej Jabal Governmental Hospital', 33.16944, 35.52556, '07/866102', 'Meiss Ej Jabal, Marjayoun district',    'coordinates confirmed'),
  ('Marjayoun Governmental Hospital',      33.3608,  35.5917,  '07/830067', 'Jdeidet Marjayoun, Madaress St',        'approx location — verify'),
  -- Nabatieh
  ('Nabih Berri Governmental Hospital (UMC)', 33.3650, 35.4750, '07/766777', 'Nabatieh, Kfarjoz main road',          'approx location — verify'),
  ('Nabatieh Governmental Hospital',       33.3789,  35.4839,  null,        'Nabatieh',                              'approx location — verify; phone unknown'),
  ('Sheikh Ragheb Harb Hospital',          33.3567,  35.4753,  '07/766799', 'Nabatieh, Toul',                        'approx location — verify'),
  ('Al-Najda Al-Shaabiya (Secours Populaire Libanais)', 33.3886, 35.4669, '07/530970', 'Nabatieh, Habbouch, Kfar Rumman roundabout', 'approx location — verify'),
  -- Sidon / Jezzine
  ('Hammoud Hospital',                     33.5571,  35.3729,  '07/723111', 'Sidon, Iskandarani St',                 'approx location — verify'),
  ('Labib Medical Center',                 33.5600,  35.3800,  '07/723444', 'Sidon, Abou Zahr St',                   'approx location — verify'),
  ('Raee Hospital',                        33.5400,  35.3950,  '07/222023', 'Sidon, Maghdoucheh turn',               'approx location — verify'),
  ('Jezzine Governmental Hospital',        33.5436,  35.5789,  '07/781406', 'Jezzine, Hay El Byedir',                'approx location — verify'),
  -- Bekaa
  ('Lebanese-French Hospital',             33.8463,  35.9019,  '08/810121', 'Zahle, Haouch El Oumara',               'approx location — verify')
) as v(name, lat, lon, phone, address, notes)
where not exists (
  select 1 from facilities f
  where f.org_id = o.id and f.source = 'seed' and f.name = v.name
);
