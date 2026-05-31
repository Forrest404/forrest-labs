import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.noursystems.org'

// Admin-gated approval: flip a pending org to 'approved'.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getSessionFromRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createServiceClient()

  const { data: org, error } = await supabase
    .from('ngo_organisations')
    .update({ status: 'approved' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, name')
    .maybeSingle()

  if (error) {
    console.error('NGO approval failed:', error)
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 })
  }
  if (!org) {
    return NextResponse.json({ error: 'Organisation not found or not pending' }, { status: 404 })
  }

  // Notify the org_admin. No email provider is wired yet, so log the approval +
  // login instructions for now (TODO: send a real email once a provider is added).
  const { data: adminUser } = await supabase
    .from('ngo_users')
    .select('full_name, email')
    .eq('org_id', id)
    .eq('role', 'org_admin')
    .limit(1)
    .maybeSingle()

  console.log(
    `[ngo-review] APPROVED org "${org.name}" (${id}). ` +
      `Notify ${adminUser?.email ?? 'unknown'} — they can now sign in at ${APP_URL}/ngo/login`,
  )

  return NextResponse.json({
    success: true,
    notified: adminUser?.email ?? null,
    note: 'Email not wired — approval + login link logged to the server console.',
  })
}
