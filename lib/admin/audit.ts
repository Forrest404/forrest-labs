import { createServiceClient } from '@/lib/supabase/service'
import { createHash } from 'crypto'

export type AuditAction =
  | 'cluster_confirmed'
  | 'cluster_rejected'
  | 'cluster_viewed'
  | 'warning_all_clear'
  | 'admin_login'
  | 'admin_logout'
  | 'admin_login_failed'
  | 'team_dispatched'
  | 'partner_created'

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

    await supabase.from('admin_audit_log').insert({
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      admin_session: sessionId.slice(0, 8) + '...',
      ip_hash: ipHash,
      notes: notes ?? null,
    })
  } catch (error) {
    console.error('Audit log write failed:', error)
  }
}
