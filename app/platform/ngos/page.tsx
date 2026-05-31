'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface Org {
  id: string; name: string; type: string; country: string | null; status: string; created_at: string
  user_count: number; team_count: number
  admin: { full_name: string | null; email: string; phone: string | null } | null
}
const STATUS_COLOUR: Record<string, string> = { approved: '#3fb950', pending: '#d29922', suspended: '#f85149' }

export default function ManageNgos() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setError(false)
    try {
      const r = await fetch('/api/ngo-review/orgs', { cache: 'no-store' })
      if (r.status === 401) { router.push('/admin/login'); return }
      if (r.ok) setOrgs((await r.json()).organisations ?? [])
      else setError(true)
    } catch { setError(true) }
    setLoaded(true)
  }, [router])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return orgs.filter((o) =>
      (statusFilter === 'all' || o.status === statusFilter) &&
      (!needle || o.name.toLowerCase().includes(needle) || (o.country ?? '').toLowerCase().includes(needle) || o.type.toLowerCase().includes(needle)),
    )
  }, [orgs, q, statusFilter])

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Manage NGOs</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 16px' }}>Every organisation. Open one to manage its status and users.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, type, country…" style={{ flex: 1, minWidth: 180, height: 34, boxSizing: 'border-box', background: '#161b22', border: '1px solid #21262d', color: '#e6edf3', borderRadius: 6, padding: '0 12px', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ height: 34, background: '#161b22', border: '1px solid #21262d', color: '#e6edf3', borderRadius: 6, padding: '0 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }}>
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {error && <div style={errBox}>Couldn’t load organisations. <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}
      {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {loaded && !error && filtered.length === 0 && <div style={{ color: '#484f58', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>No organisations match.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((o) => (
          <div key={o.id} onClick={() => router.push(`/platform/ngos/${o.id}`)} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{o.name}</span>
                <span style={{ fontSize: 11, color: STATUS_COLOUR[o.status] ?? '#8b949e' }}>● {o.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>{o.type}{o.country ? ` · ${o.country}` : ''} · {o.user_count} user{o.user_count === 1 ? '' : 's'} · {o.team_count} team{o.team_count === 1 ? '' : 's'}</div>
            </div>
            <span style={{ fontSize: 12, color: '#58a6ff', flexShrink: 0 }}>Open →</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const errBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'transparent', border: '1px solid #f85149', color: '#f85149', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
