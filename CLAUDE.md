# CLAUDE.md — Nour

Context file for Claude Code. Read this fully before making changes.

---

## What this is

Nour is a civilian safety reporting tool for conflict and disaster zones, currently focused on Lebanon. Two halves share one backend:

1. **Public reporting (already built).** Civilians report strikes, shelling, and other hazards from any phone with no app and no account. An AI pipeline clusters the reports, scores confidence, cross-references news and official sources, and verifies incidents. Verified incidents appear on a live public map.

2. **NGO dashboard (what we are building now).** A dedicated dashboard for NGO team leaders operating in the same zones. It consumes the verified incident data the public side already produces and lets aid teams see where they are deployed, account for their people, dispatch teams to incidents, and report to HQ.

**The key insight:** the verification pipeline is the hard part and it already exists. The NGO dashboard is a new *reader* of that data plus its own team-management layer. We extend this project; we never rebuild the pipeline.

---

## Tech stack

- **Frontend:** Next.js 14 (App Router), TypeScript, deployed on Vercel
- **Database / backend:** Supabase (Postgres, Realtime, Storage, Edge Functions)
- **AI:** Claude API, model `claude-sonnet-4-20250514`
- **Maps:** Mapbox GL JS (loaded via CDN)
- **Face blurring:** Python Flask service using `deface`, hosted on Railway
- **Push notifications:** ntfy.sh
- **Auth:** JWT via `jose`, stored in httpOnly cookies

---

## Live URLs

- App: `https://www.noursystems.org`
- Health: `/health`, `/api/health`
- Events GeoJSON: `/api/events`
- Stats: `/api/stats`
- Public map: `/map`
- Civilian report form: `/report`
- Admin panel: `/admin`
- Partner portal: `/partner`

---

## Repository structure & isolation rules

The codebase is organised into **isolated route groups**. Each major surface has its own folder and its own layout. This keeps the new NGO work from touching the live civilian app.

```
app/
  page.tsx          # public landing
  report/           # civilian report form        (DO NOT TOUCH)
  map/              # public live map              (DO NOT TOUCH)
  admin/            # Nour internal admin panel    (DO NOT TOUCH)
  partner/          # existing partner portal      (DO NOT TOUCH)
  ngo/              # NEW — the NGO dashboard       (all new work goes here)
  api/              # API routes (add ngo/* subroutes only)
lib/                # shared utilities (reuse, don't duplicate)
supabase/           # migrations + edge functions
middleware.ts       # route protection
```

**Isolation rules — non-negotiable:**

- All new UI lives under `app/ngo/` with its own `layout.tsx`.
- All new API routes live under `app/api/ngo/`.
- The civilian report form, public map, admin panel, and partner portal are **off limits.** Do not edit them to make the NGO section work.
- Reuse the existing Mapbox component and `lib/` helpers rather than copying them.
- If something shared needs changing, stop and flag it rather than editing a shared file in a way that could affect the public app.

---

## Authentication

There are existing session cookies:

- `fl_admin_session` — Nour internal admin (8h, httpOnly/Secure/SameSite=Strict)
- `fl_partner_session` — existing partner portal (12h)

**Add a third, separate cookie for the NGO dashboard:**

- `fl_ngo_session` — NGO users. JWT signed with `jose`. httpOnly, Secure, SameSite=Strict.

Do not try to make one auth system serve civilians, admins, and NGOs. The NGO session carries the user's role and organisation id.

**Three NGO roles only:**

| Role | Can do |
|------|--------|
| `org_admin` | Everything for their org: approve/suspend users, edit operational area, manage data-sharing, all leader powers |
| `team_leader` | Dispatch teams, run roll calls, send broadcasts, generate reports, view all org data |
| `field_coordinator` | Mobile check-in, panic, on-scene reports only. Cannot dispatch or see other teams' detail. |

Mobile login uses a short PIN for speed in the field; desktop uses email + password.

---

## Database schema

### Existing tables — READ ONLY for the NGO section, never alter structure

`reports`, `clusters`, `alerts`, `warnings`, `warning_clusters`, `admin_audit_log`, `organisations`, `teams`, `dispatches`, `partner_accounts`, `resources`, `news_articles`, `admin_zones`, `source_reliability`, `case_files`, `situation_reports`, `official_sources`

The NGO dashboard **reads** `clusters` and `alerts` to show incidents. NGOs never write to `reports` or `clusters`. Before relying on any column, read the migration files in `supabase/` to confirm exact names.

**Incident (cluster) statuses:** `pending`, `pending_review`, `confirmed`, `news_verified`, `official_verified`, `rejected`, `discarded`. (Note: the live DB constraint rejects `auto_confirmed` — use `confirmed`.)

**Map colour coding (match the public map):**
- Red — civilian confirmed
- Orange — auto-confirmed equivalent
- Blue — news_verified
- Purple — official_verified

**Lebanon bounding box:** lat 33.05–34.69, lon 35.10–36.62

### New NGO tables — ADDITIVE migrations only

Create new tables only. Never modify or drop existing tables. Additive migrations cannot break the live civilian app. Suggested tables (refine names as you build):

- `ngo_users` — id, org_id, email, password_hash, pin_hash, role, status, created_at
- `ngo_organisations` — extend or reference existing `organisations`; holds operational area polygon (GeoJSON), org type, data-sharing flags
- `team_members` — id, team_id, name, role, contact, emergency_contact, certifications
- `check_ins` — id, user_id, team_id, lat, lon, status, note, created_at, synced_at
- `panic_events` — id, user_id, team_id, last_lat, last_lon, created_at, resolved_at, resolved_by
- `roll_calls` — id, org_id, triggered_by, created_at; plus `roll_call_responses` — roll_call_id, user_id, safe (bool), responded_at
- `team_status` — current status + last_known_lat/lon + last_seen per team
- `ngo_dispatches` — or reuse existing `dispatches`; assignment of a team to a cluster with status + timestamps
- `ngo_notes` — internal incident notes, author-attributed
- `broadcasts` — org-wide messages

`teams` and `dispatches` already exist from earlier work — check them first and extend rather than duplicate.

---

## The NGO dashboard — what we are building

### Design principles — every feature must obey these

These are constraints, not features. They apply to everything.

1. **Offline-first.** Assume no connection. Forms queue locally and sync when signal returns. Use a service worker for the mobile check-in.
2. **SMS fallback.** Every alert, panic, check-in, and broadcast must work over SMS when there is no data connection.
3. **Two taps maximum** for any critical action — panic, check-in, dispatch.
4. **Battery-conscious.** Capture GPS only on check-in, never continuously.
5. **Low-bandwidth.** Text over images. Pages under 200KB. Must work on 2G.
6. **Arabic-first, RTL.** Full right-to-left support; local language by default.
7. **No training needed.** If it needs a manual, it fails in the field.
8. **Data minimisation.** Collect little, retain less, share nothing by default. Team locations are targeting data.

### Build order — the five core areas

Build safety and the situation board first; they justify the product.

**1. Access & security** (`app/ngo/` scaffold, `app/ngo/login`, sign-up + approval)
Organisation sign-up with manual approval gate (no instant access — this stops bad actors getting aid-worker locations). Login with PIN on mobile / password on desktop. Three roles. Data-sharing off by default.

**2. People & safety** *(the heart — build alongside the board)*
- **One-tap panic / duress** — fires team leader + escalation chain with last GPS over push AND SMS; can hide the user from any shared view; works offline.
- **Proof-of-life check-in** — every N hours, tap to confirm safe + share GPS. Treated as a safety event, not admin.
- **Missed check-in escalation** — miss one → amber to leader; miss the next → red up the chain automatically.
- **Roll call / headcount** — leader fires a "tap if safe" prompt to all; board fills green, anyone unaccounted-for stays red. Accounts for everyone in under a minute.

**3. Situation board** (`app/ngo/board` — the home screen)
One map IS the dashboard. Incidents + own team pins + coverage-gaps layer on a single view, with a collapsible side panel for the incident feed and dispatch board. Hazard-agnostic (airstrike, shelling, flood, collapse, fire, unrest). Live team pins with last-known location and "last seen" labels. Coverage-gaps layer (unassigned incidents glow red) — the killer feature. Urgent alert banner (push + SMS). Safe-route / access overlay.

**4. Dispatch & response** (`app/ngo/dispatch`)
One-tap dispatch (teams ranked by proximity + type match, notified by push + SMS with map link). Four statuses only: Assigned → En route → On scene → Done. Short on-scene report (people assisted, what delivered, new hazards). Reassign / recall in two taps.

**5. Report & coordinate** (`app/ngo/reports`)
One-tap sitrep (Claude drafts OCHA-style from incidents + dispatches + on-scene reports; export PDF/Word). Broadcast to all field staff (push + SMS). Inter-agency coverage board (opt-in, structured posts not chat). GeoJSON/CSV export + immutable activity log.

### Explicitly deferred — do NOT build yet

Availability calendar, vehicle/fuel tracking, detailed resource consumption, standalone analytics, donor impact report, time scrubber, draw-and-annotate, API access. Photo upload is optional and off by default (bandwidth + face-blur latency). These carry admin friction nobody sustains in a crisis; building them now delays what keeps people alive.

---

## Design system

Match the existing app exactly.

- Background: `#0d1117`
- Surface: `#161b22`
- Border: `#21262d`
- Text: `#e6edf3` (primary), `#8b949e` (secondary), `#484f58` (tertiary)
- Green: `#3fb950` (safe / standby)
- Amber: `#d29922` (deployed / warning)
- Red: `#f85149` (danger / unassigned / panic)
- Blue: `#58a6ff` (info)
- Purple: `#a371f7` (official_verified)

Conventions:
- **Inline styles** (the existing app does not use Tailwind)
- **No HTML `<form>` tags** — use `onClick`/`onChange` handlers
- `system-ui` font
- No browser storage APIs in any embedded/artifact context
- Minimal formatting; clean, legible, mobile-first

---

## Build conventions

- Always run in **plan mode first** and show the plan before writing code.
- Work in **one route group** (`app/ngo/`) and one concern at a time.
- **Additive DB migrations only.** New tables, never alter existing ones.
- Commit in small, described units.
- After each feature, list manual test steps and wait for them to pass before moving on.
- When using sub-agents: a frontend agent owns `app/ngo/` UI; a backend agent owns `app/api/ngo/`, `lib/`, and `supabase/`; a git agent commits only.

---

## Critical rules

1. **Never break the live civilian app.** The report form, public map, admin, and partner portal must keep working untouched.
2. **NGOs read incident data, never write it.** No writes to `reports` or `clusters` from the NGO section.
3. **Additive migrations only.** If a change would alter an existing table, stop and flag it.
4. **Safety beats features.** Panic, check-in, roll call, and SMS fallback take priority over everything else.
5. **Data minimisation and default-off sharing.** Aid-worker location is sensitive. Share nothing across orgs unless an admin explicitly opts in, and then only team *type* and area — never names or exact pins.
6. **Offline and SMS are requirements, not nice-to-haves.** A feature that only works with a live data connection is not done.

---

## How to start

1. Confirm you have read this file.
2. Inspect the existing `app/admin/` and `app/partner/` route groups to copy their isolation and auth patterns.
3. Read the `supabase/` migrations to confirm existing table and column names.
4. Plan and scaffold `app/ngo/` (layout, login, `fl_ngo_session` auth, three roles).
5. Build People & safety and the Situation board first.
