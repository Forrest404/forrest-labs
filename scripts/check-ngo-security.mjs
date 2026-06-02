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
import { join, basename } from 'node:path'
import { execSync } from 'node:child_process'

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

// ── Check 3: no literal secret committed in source ──
// Catch a hardcoded key/token before it ships, across all source (not just .ts). Patterns
// match the SHAPE of real secrets; placeholders in .env.example don't match. The guard
// script excludes itself (its regex strings would otherwise self-match).
const SECRET_PATTERNS = [
  [/\beyJ[A-Za-z0-9_-]{18,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT / Supabase key'],
  [/\bre_[A-Za-z0-9]{24,}/, 'Resend API key'],
  [/\bsk-[A-Za-z0-9]{24,}/, 'secret key (sk-…)'],
  [/\bsk_(?:live|test)_[A-Za-z0-9]{16,}/, 'Stripe secret key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bxox[baprs]-[A-Za-z0-9]{8,}-[A-Za-z0-9-]{8,}/, 'Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
]
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|json|ya?ml|toml|sh|sql)$/
const SKIP_SCAN = /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/
function walkAll(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walkAll(p, out)
    else out.push(p)
  }
  return out
}
const scanFiles = ['app', 'lib', 'components', 'scripts', 'supabase', 'worker']
  .flatMap((d) => walkAll(join(ROOT, d)))
  .filter((f) => SCAN_EXT.test(f) && !SKIP_SCAN.test(f) && basename(f) !== 'check-ngo-security.mjs')
for (const f of scanFiles) {
  const src = readFileSync(f, 'utf8')
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(src)) failures.push(`${rel(f)}: looks like a hardcoded ${label} — move it to an env var`)
  }
}

// ── Check 4: no real .env file tracked in git (only .env.example may be committed) ──
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n')
  for (const f of tracked) {
    if (/(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example')) {
      failures.push(`${f}: a real .env file is tracked in git — it must be gitignored`)
    }
  }
} catch { /* not a git checkout / git unavailable — skip */ }

function rel(f) { return f.slice(ROOT.length + 1) }

if (failures.length) {
  console.error('✗ NGO security guard failed:\n' + failures.map((m) => '  - ' + m).join('\n'))
  process.exit(1)
}
console.log(`✓ NGO security guard passed (${ngoRoutes.length} routes scoped; ${scanFiles.length} files scanned; no hardcoded secret, no secret in client code, no .env tracked).`)
