#!/usr/bin/env node
// ============================================================
// NGO security guard (item 4 — key discipline + org-scope regression check)
// ============================================================
// Two static checks, run in CI / before build, that fail (exit 1) on a violation:
//
//   1. KEY DISCIPLINE — server-only secrets (service-role key, JWT secret, cron key)
//      must never appear in a client component ('use client') or behind NEXT_PUBLIC_.
//      A leaked service-role key = full cross-org DB access, so this is hard-failed.
//
//   2. ORG SCOPE — every NGO API route (app/api/ngo/**) must authenticate via
//      getNgoSession AND scope its data to the caller's org/user (.eq('org_id'…),
//      resolveTeamId, or an own-user id). This catches a new route that forgets its
//      tenant filter — the one residual cross-org risk under the service-role model.
//
// This does NOT replace the app-layer enforcement; it locks it in so it can't regress.
// ============================================================

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SECRETS = ['SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_JWT_SECRET', 'REVIEW_SECRET_KEY', 'ANTHROPIC_API_KEY', 'RESEND_API_KEY']
const failures = []

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(join(ROOT, 'app'))
  .concat(walkSafe(join(ROOT, 'lib')))
  .concat(walkSafe(join(ROOT, 'components')))

function walkSafe(d) { try { return walk(d) } catch { return [] } }

// ── Check 1: secrets never in client-reachable code ──
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const isClient = /^['"]use client['"]/m.test(src) || /\n\s*['"]use client['"]/.test(src.slice(0, 200))
  for (const secret of SECRETS) {
    // A secret read behind NEXT_PUBLIC_ would ship to the browser.
    if (src.includes('NEXT_PUBLIC_' + secret) || new RegExp(`NEXT_PUBLIC_[A-Z_]*${secret}`).test(src)) {
      failures.push(`${rel(f)}: secret ${secret} exposed via a NEXT_PUBLIC_ var`)
    }
    if (isClient && src.includes(secret)) {
      failures.push(`${rel(f)}: secret ${secret} referenced in a client component`)
    }
  }
}

// ── Check 2: every NGO API route is org/user scoped ──
// Auth + cron routes legitimately scope by credential/secret, not org_id.
const SCOPE_EXEMPT = new Set([
  'app/api/ngo/auth/login/route.ts',
  'app/api/ngo/auth/logout/route.ts',
  'app/api/ngo/auth/signup/route.ts',
  'app/api/ngo/auth/check/route.ts',
  'app/api/ngo/safety/escalate/route.ts',        // cron: secret-gated, iterates all orgs
  'app/api/ngo/safety/panic-escalate/route.ts',  // cron: secret-gated, iterates all orgs
  'app/api/ngo/incidents/geocode/route.ts',      // auth-gated geocode helper; touches NO org data (no DB query)
  // Public, single-use-TOKEN-gated (the token IS the credential; org is bound INTO the
  // token row, not derived from a session). Same category as auth/login.
  'app/api/ngo/auth/invite/accept/route.ts',
  'app/api/ngo/auth/reset/request/route.ts',
  'app/api/ngo/auth/reset/confirm/route.ts',
])
const SCOPE_MARKERS = ["eq('org_id'", 'eq("org_id"', 'resolveTeamId', 'ngo_user_id', 'session!.orgId', 'session.orgId', 'session!.userId', 'session.userId', 'p_org']

const ngoRoutes = walkSafe(join(ROOT, 'app/api/ngo')).filter((f) => f.endsWith('route.ts'))
for (const f of ngoRoutes) {
  const r = rel(f)
  if (SCOPE_EXEMPT.has(r)) continue
  const src = readFileSync(f, 'utf8')
  if (!src.includes('getNgoSession')) {
    failures.push(`${r}: NGO route does not call getNgoSession (no auth)`)
    continue
  }
  if (!SCOPE_MARKERS.some((m) => src.includes(m))) {
    failures.push(`${r}: NGO route has no org/user scope marker (possible cross-org leak)`)
  }
}

function rel(f) { return f.slice(ROOT.length + 1) }

if (failures.length) {
  console.error('✗ NGO security guard failed:\n' + failures.map((m) => '  - ' + m).join('\n'))
  process.exit(1)
}
console.log(`✓ NGO security guard passed (${ngoRoutes.length} routes scoped; no secret in client code).`)
