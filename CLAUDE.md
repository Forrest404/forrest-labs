# Forrest Labs

## What this is
A civilian safety reporting web app for conflict zones. People open
a website on their phone and report when they hear or see a bomb —
distance estimate, event type, optional photo. Reports are clustered
by AI, verified, and shown on a live map so aid workers know where
help is needed in real time.

## Core principles
- Everything runs in the browser — no app downloads for anyone
- Anonymous by default — no names, no accounts, no raw IPs stored
- Face blurring runs on every uploaded image and video before storage
- A human (the founder) approves borderline AI decisions via phone notification
- Works on any mobile browser on a slow 3G connection

## Tech stack
- Frontend: Next.js 14 App Router, TypeScript, Tailwind CSS
- Database: Supabase (Postgres + Realtime + Storage + Edge Functions)
- Face blurring: Python Flask microservice on Railway using deface library
- AI analysis: Claude API (claude-sonnet-4-20250514)
- Maps: Mapbox GL JS
- Push notifications: ntfy.sh
- Hosting: Vercel (frontend), Railway (Python worker)

## Folder structure
app/report/        → civilian report page (5-step form)
app/map/           → public live map
app/api/reports/   → POST endpoint to save a report
app/api/clusters/  → approve/reject endpoints
app/api/media/     → forwards media to Python worker
lib/supabase/      → browser, server, and service clients
supabase/          → migrations and edge functions
worker/            → Python face-blurring microservice
scripts/           → test scripts

## Database tables
- reports: individual civilian submissions
- clusters: grouped reports with confidence score
- alerts: confirmed events published to the map

## Important rules for every session
- TypeScript only, no 'any' types
- Never install a package without telling me what it does
- Never store unblurred media — blurring happens before any write to storage
- Never store raw IP addresses — always SHA-256 hash them first
- Mobile first — minimum 48px tap targets, minimum 16px font size
- Do not refactor working code — only build what the session asks for
- If something fails, stop and explain the error before continuing
