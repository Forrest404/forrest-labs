'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Overview {
  orgs: { approved: number; pending: number; suspended: number; total: number }
  total_users: number
  active_teams: number
  pending_orgs: { id: string; name: string; type: string; country: string | null; created_at: string }[]
}

export default function PlatformOverview() {
  const router = useRouter()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const r = await fetch('/api/platform/overview', { cache: 'no-store' })
      if (r.status === 401) { router.push('/admin/login'); return }
      if (r.ok) setData(await r.json())
      else setError(true)
    } catch { setError(true) }
    setLoaded(true)
  }, [router])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Platform overview</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 20px' }}>The state of the platform at a glance.</p>

      {!loaded && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {error && <div style={noteBox}>Couldn’t load the overview. <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}

      {data && (
        <>
          {/* Needs attention */}
          <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 18, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              Needs your attention
              {data.orgs.pending > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: '#d29922' }}>● {data.orgs.pending} pending</span>}
            </div>
            {data.pending_orgs.length === 0 ? (
              <div style={{ fontSize: 13, color: '#484f58' }}>Nothing pending. You’re all caught up.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.pending_orgs.map((o) => (
                  <div key={o.id} onClick={() => router.push('/platform/review')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, cursor: 'pointer' }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{o.name}</span>
                      <span style={{ fontSize: 12, color: '#8b949e', marginLeft: 8 }}>{o.type}{o.country ? ` · ${o.country}` : ''}</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#58a6ff' }}>Review →</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Counts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            <Stat label="Organisations" value={data.orgs.total} sub={`${data.orgs.approved} approved · ${data.orgs.pending} pending · ${data.orgs.suspended} suspended`} />
            <Stat label="Total users" value={data.total_users} />
            <Stat label="Active teams" value={data.active_teams} sub="standby or deployed" />
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const noteBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'transparent', border: '1px solid #f85149', color: '#f85149', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
