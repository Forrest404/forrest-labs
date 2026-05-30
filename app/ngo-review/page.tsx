'use client'

import { useState, useEffect, useCallback } from 'react'

interface PendingOrg {
  id: string
  name: string
  type: string
  country: string | null
  operational_area: { description?: string } | null
  created_at: string
  admin: { full_name: string | null; email: string; phone: string | null } | null
}

export default function NgoReviewPage() {
  const [orgs, setOrgs] = useState<PendingOrg[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/ngo-review', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setOrgs(data.organisations ?? [])
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const approve = useCallback(async (id: string) => {
    setBusy(id)
    setNote(null)
    try {
      const res = await fetch(`/api/ngo-review/${id}/approve`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setOrgs((prev) => prev.filter((o) => o.id !== id))
        setNote(`Approved. ${data.note ?? ''}`)
      } else {
        setNote('Approval failed.')
      }
    } catch {
      setNote('Approval failed.')
    } finally {
      setBusy(null)
    }
  }, [])

  const deny = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Deny "${name}"? Its admin will not be able to sign in.`)) return
    setBusy(id)
    setNote(null)
    try {
      const res = await fetch(`/api/ngo-review/${id}/reject`, { method: 'POST' })
      if (res.ok) {
        setOrgs((prev) => prev.filter((o) => o.id !== id))
        setNote(`Denied "${name}".`)
      } else {
        setNote('Denial failed.')
      }
    } catch {
      setNote('Denial failed.')
    } finally {
      setBusy(null)
    }
  }, [])

  const label = { fontSize: 11, color: '#8b949e', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', padding: '32px 24px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 4 }}>
          NOUR — internal · <a href="/ngo-review/teams" style={{ color: '#58a6ff', textDecoration: 'none' }}>All teams →</a>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>NGO approvals</h1>
        <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 24 }}>
          Organisations awaiting review. Approve to let their admin sign in, or deny to block them.
        </p>

        {note && (
          <div style={{ background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            {note}
          </div>
        )}

        {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
        {loaded && orgs.length === 0 && (
          <div style={{ color: '#484f58', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>No organisations pending approval.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orgs.map((org) => (
            <div key={org.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{org.name}</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#8b949e', marginBottom: 8 }}>
                  <span><span style={label}>Type</span> {org.type}</span>
                  {org.country && <span><span style={label}>Country</span> {org.country}</span>}
                </div>
                {org.operational_area?.description && (
                  <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>
                    <span style={label}>Area</span> {org.operational_area.description}
                  </div>
                )}
                {org.admin && (
                  <div style={{ fontSize: 12, color: '#e6edf3' }}>
                    <span style={label}>Admin</span> {org.admin.full_name ?? '—'} · {org.admin.email}
                    {org.admin.phone ? ` · ${org.admin.phone}` : ''}
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => approve(org.id)}
                  disabled={busy === org.id}
                  style={{
                    height: 34, padding: '0 16px',
                    background: busy === org.id ? '#21262d' : 'rgba(63,185,80,0.12)',
                    border: '1px solid rgba(63,185,80,0.4)',
                    color: '#3fb950', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    cursor: busy === org.id ? 'default' : 'pointer', fontFamily: 'system-ui',
                  }}
                >
                  {busy === org.id ? '…' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => deny(org.id, org.name)}
                  disabled={busy === org.id}
                  style={{
                    height: 34, padding: '0 16px',
                    background: busy === org.id ? '#21262d' : 'rgba(248,81,73,0.1)',
                    border: '1px solid rgba(248,81,73,0.4)',
                    color: '#f85149', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    cursor: busy === org.id ? 'default' : 'pointer', fontFamily: 'system-ui',
                  }}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
