import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hashSecret } from '@/lib/ngo-auth'
import { rateLimitByIp, tooMany, AUTH_MAX, AUTH_WINDOW } from '@/lib/rate-limit'

const ORG_TYPES = ['ingo', 'lngo', 'un_agency', 'crescent_cross', 'community', 'other']

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  // Durable throttle: cap org sign-ups per IP (5 / 15 min) to stop mass account creation.
  const limit = await rateLimitByIp(supabase, request, 'auth:ngo-signup', AUTH_MAX, AUTH_WINDOW)
  if (!limit.ok) return tooMany(limit.retryAfter, 'Too many sign-up attempts. Please try again later.')

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const orgName = String(body.org_name ?? '').trim()
  const orgType = String(body.org_type ?? '').trim()
  const country = String(body.country ?? '').trim()
  const operationalArea = String(body.operational_area ?? '').trim()
  const fullName = String(body.full_name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim()
  const password = String(body.password ?? '')

  // Base location (worldwide onboarding): a point picked via place search on the form.
  // Optional; range-validated; maps + geocoding centre/bias on it once approved.
  const baseLat = (typeof body.base_lat === 'number' && body.base_lat >= -90 && body.base_lat <= 90) ? body.base_lat : null
  const baseLon = (typeof body.base_lon === 'number' && body.base_lon >= -180 && body.base_lon <= 180) ? body.base_lon : null
  const baseZoom = (typeof body.base_zoom === 'number' && body.base_zoom >= 1 && body.base_zoom <= 18) ? body.base_zoom : null
  const baseLabel = body.base_label ? String(body.base_label).slice(0, 120) : null
  const hasBase = baseLat != null && baseLon != null

  if (!orgName || !orgType || !fullName || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Reject duplicate email up front for a friendly message (unique constraint backs it up).
  const { data: existing } = await supabase
    .from('ngo_users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  // 1) Organisation — pending approval. operational_area kept as a JSON note until
  //    the map editor (Session 2) replaces it with a GeoJSON polygon.
  const orgRow: Record<string, unknown> = {
    name: orgName,
    type: ORG_TYPES.includes(orgType) ? orgType : 'other',
    country: country || null,
    operational_area: operationalArea ? { description: operationalArea } : null,
    status: 'pending',
  }
  if (hasBase) {
    orgRow.base_lat = baseLat
    orgRow.base_lon = baseLon
    orgRow.base_zoom = baseZoom ?? 10
    orgRow.base_label = baseLabel
  }
  let { data: org, error: orgError } = await supabase
    .from('ngo_organisations')
    .insert(orgRow)
    .select('id')
    .single()
  // Pre-migration fallback: base_* columns not applied yet → register without them.
  if (orgError && (orgError.code === '42703' || orgError.code === 'PGRST204') && hasBase) {
    delete orgRow.base_lat; delete orgRow.base_lon; delete orgRow.base_zoom; delete orgRow.base_label
    ;({ data: org, error: orgError } = await supabase.from('ngo_organisations').insert(orgRow).select('id').single())
  }

  if (orgError || !org) {
    console.error('NGO signup — org insert failed:', orgError)
    return NextResponse.json({ error: 'Could not create organisation' }, { status: 500 })
  }

  // 2) First user — org admin, active.
  const { error: userError } = await supabase.from('ngo_users').insert({
    org_id: org.id,
    email,
    password_hash: hashSecret(password),
    role: 'org_admin',
    full_name: fullName || null,
    phone: phone || null,
    status: 'active',
  })

  if (userError) {
    // Roll back the org so a failed signup doesn't leave an orphan pending org.
    await supabase.from('ngo_organisations').delete().eq('id', org.id)
    if ((userError as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }
    console.error('NGO signup — user insert failed:', userError)
    return NextResponse.json({ error: 'Could not create account' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    status: 'pending',
    message: 'Your organisation is pending approval.',
  })
}
