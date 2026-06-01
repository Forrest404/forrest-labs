import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSessionFromRequest } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/audit'
import { sendEmail, logEmail, approvalEmail } from '@/lib/email'

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

  // Email the org admin their approval + login link (best-effort; never fails the approval).
  let emailStatus: 'sent' | 'stubbed' | 'failed' | 'no_admin' = 'no_admin'
  if (adminUser?.email) {
    const tpl = approvalEmail(org.name)
    const result = await sendEmail({ to: adminUser.email, ...tpl })
    await logEmail(supabase, 'approval', adminUser.email, id, result)
    emailStatus = result.ok ? 'sent' : result.stubbed ? 'stubbed' : 'failed'
    if (emailStatus !== 'sent') {
      console.log(`[ngo-review] APPROVED "${org.name}" (${id}); approval email ${emailStatus} — admin can sign in at ${APP_URL}/ngo/login`)
    }
  }

  await logAdminAction({
    action: 'ngo_org_approved',
    entityType: 'ngo_organisation',
    entityId: id,
    sessionId: admin.sessionId,
    details: { org: org.name, email: emailStatus },
  })

  return NextResponse.json({
    success: true,
    notified: adminUser?.email ?? null,
    email_status: emailStatus,
    note: emailStatus === 'sent' ? 'Approval email sent.'
      : emailStatus === 'stubbed' ? 'Approved — email not configured (set RESEND_API_KEY + EMAIL_FROM).'
      : emailStatus === 'failed' ? 'Approved — email send failed (check domain verification).'
      : 'Approved — no org admin email on file.',
  })
}
