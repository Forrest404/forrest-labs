import { createServiceClient } from '@/lib/supabase/service'
import { createHash } from 'crypto'

export type AuditAction =
  | 'cluster_confirmed'
  | 'cluster_rejected'
  | 'cluster_viewed'
  | 'warning_all_clear'
  | 'warning_discarded'
  | 'warning_updated'
  | 'report_discarded'
  | 'report_restored'
  | 'admin_login'
  | 'admin_logout'
  | 'admin_login_failed'
  | 'team_dispatched'
  | 'partner_created'
  // Platform-operator (NGO oversight) actions
  | 'ngo_org_approved'
  | 'ngo_org_rejected'
  | 'ngo_org_suspended'
  | 'ngo_org_reactivated'
  | 'ngo_org_deleted'
  | 'ngo_user_suspended'
  | 'ngo_user_reactivated'
  | 'ngo_user_removed'

export async function writeAuditLog({
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
  sessionId,
  ipAddress,
  notes,
}: {
  action: AuditAction
  entityType: string
  entityId?: string
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  sessionId: string
  ipAddress?: string
  notes?: string
}): Promise<void> {
  try {
    const supabase = createServiceClient()
    const ipHash = ipAddress
      ? createHash('sha256').update(ipAddress).digest('hex').slice(0, 16)
      : null

    // Map the caller-friendly fields onto the ACTUAL table columns. The
    // admin_audit_log table has `actor` + `details` (jsonb) — earlier this helper
    // wrote old_value/new_value/admin_session/notes, which don't exist, so every
    // insert threw and was swallowed (login events never persisted). We fold the
    // free-form fields into `details` and write the truncated session as `actor`.
    const details: Record<string, unknown> = {}
    if (notes) details.note = notes
    if (oldValue) details.old = oldValue
    if (newValue) details.new = newValue

    await supabase.from('admin_audit_log').insert({
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      actor: sessionId && sessionId !== 'none' ? sessionId.slice(0, 8) + '...' : (sessionId || 'system'),
      details: Object.keys(details).length > 0 ? details : null,
      ip_hash: ipHash,
    })
  } catch (error) {
    console.error('Audit log write failed:', error)
  }
}

// Platform-operator action logger. Writes directly to the real admin_audit_log
// columns (actor + details jsonb). Use this for NGO-oversight mutations so every
// approve/reject/suspend/remove is recorded for accountability. `details` is a
// free-form object (e.g. { org: 'Acme', reason: '…' }) surfaced in the audit UI.
export async function logAdminAction({
  action,
  entityType,
  entityId,
  sessionId,
  details,
}: {
  action: AuditAction
  entityType: string
  entityId?: string
  sessionId: string
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('admin_audit_log').insert({
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      actor: sessionId && sessionId !== 'none' ? sessionId.slice(0, 8) + '...' : (sessionId || 'system'),
      details: details && Object.keys(details).length > 0 ? details : null,
    })
  } catch (error) {
    console.error('Audit log write failed:', error)
  }
}
