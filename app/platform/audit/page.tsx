'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Entry {
  id: string; created_at: string; action: string; entity_type: string; entity_id: string | null
  actor: string | null
  details: { org?: string; email?: string; reason?: string; note?: string } | null
}

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  ngo_org_approved: { label: 'Org approved', color: '#3fb950' },
  ngo_org_rejected: { label: 'Org rejected', color: '#f85149' },
  ngo_org_suspended: { label: 'Org suspended', color: '#d29922' },
  ngo_org_reactivated: { label: 'Org reactivated', color: '#3fb950' },
  ngo_org_deleted: { label: 'Org deleted', color: '#f85149' },
  ngo_user_suspended: { label: 'User suspended', color: '#d29922' },
  ngo_user_reactivated: { label: 'User reactivated', color: '#3fb950' },
  ngo_user_removed: { label: 'User removed', color: '#f85149' },
}

function fmt(s: string): string {
  const d = new Date(s)
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${m[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}

export default function PlatformAudit() {
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const r = await fetch('/api/platform/audit?limit=100', { cache: 'no-store' })
      if (r.status === 401) { router.push('/admin/login'); return }
      if (r.ok) setEntries((await r.json()).entries ?? [])
      else setError(true)
    } catch { setError(true) }
    setLoaded(true)
  }, [router])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Audit log</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 20px' }}>Read-only record of platform-operator actions on NGOs.</p>

      {error && <div style={errBox}>Couldn’t load the audit log. <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}
      {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {loaded && !error && entries.length === 0 && <div style={{ color: '#484f58', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>No actions recorded yet.</div>}

      {entries.length > 0 && (
        <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #21262d' }}>
              {['Time', 'Action', 'Subject', 'Detail', 'By'].map((c) => (
                <th key={c} style={{ fontSize: 10, fontWeight: 500, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 0 10px', textAlign: 'left' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const a = ACTION_LABEL[e.action] ?? { label: e.action, color: '#8b949e' }
              const subject = e.details?.org ?? e.details?.email ?? (e.entity_id ? e.entity_id.slice(0, 8) + '…' : '—')
              const detail = e.details?.reason ?? e.details?.note ?? '—'
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid #161b22' }}>
                  <td style={{ padding: '10px 8px 10px 0', color: '#484f58', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmt(e.created_at)}</td>
                  <td style={{ padding: '10px 8px 10px 0' }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: a.color, background: `${a.color}1a`, padding: '2px 7px', borderRadius: 4 }}>{a.label}</span>
                  </td>
                  <td style={{ padding: '10px 8px 10px 0', color: '#e6edf3' }}>{subject}</td>
                  <td style={{ padding: '10px 8px 10px 0', color: '#8b949e' }}>{detail}</td>
                  <td style={{ padding: '10px 0', color: '#484f58', fontFamily: 'monospace' }}>{e.actor ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

const errBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'transparent', border: '1px solid #f85149', color: '#f85149', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
