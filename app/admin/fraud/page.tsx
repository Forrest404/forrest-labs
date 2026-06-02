'use client'

import { useState, useEffect, useCallback } from 'react'

// Fraud & Abuse — surfaces existing signals (fraud_score, source diversity, ai_concerns,
// submission volume) and lets an admin discard gamed clusters and flag/block abusive
// sessions/IPs. No scores are recomputed here; everything shown is already in the data.

interface FraudCluster {
  id: string; status: string; location_name: string | null
  report_count: number; unique_ips: number | null; unique_sessions: number | null
  fraud_score: number | null; confidence_score: number | null
  ai_concerns: string[] | null; created_at: string
}
interface VolumeRow { identifier_type: string; identifier_hash: string; count: number; last_at: string; state: string | null }
interface BlockRow { id: string; identifier_type: string; identifier_hash: string; action: string; reason: string | null; reviewed: boolean; created_at: string }

export default function FraudPage() {
  const [flagged, setFlagged] = useState<FraudCluster[]>([])
  const [discarded, setDiscarded] = useState<FraudCluster[]>([])
  const [volume, setVolume] = useState<VolumeRow[]>([])
  const [blocklist, setBlocklist] = useState<BlockRow[]>([])
  const [volumeAvailable, setVolumeAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true)
    try {
      const r = await fetch('/api/admin/fraud', { cache: 'no-store' })
      if (!r.ok) { setError('Could not load fraud data.'); return }
      const d = await r.json()
      setFlagged(d.flagged_clusters ?? []); setDiscarded(d.auto_discarded ?? [])
      setVolume(d.high_volume ?? []); setBlocklist(d.blocklist ?? [])
      setVolumeAvailable(d.volume_available !== false); setError(null)
    } catch { setError('Could not load fraud data.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(() => load(true), 30000); return () => clearInterval(id) }, [load])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }

  const discardCluster = async (id: string) => {
    if (!window.confirm('Discard this incident as gamed/fraudulent? It will be removed from the verified feed.')) return
    setBusy(id)
    try {
      const r = await fetch('/api/admin/clusters/' + id + '/reject', { method: 'POST' })
      if (r.ok) { setFlagged((fs) => fs.filter((f) => f.id !== id)); flash('Incident discarded.') }
      else setError('Could not discard.')
    } catch { setError('Could not discard.') } finally { setBusy(null) }
  }

  const actIdentifier = async (type: string, hash: string, action: 'flag' | 'block' | 'reviewed') => {
    if (action === 'block' && !window.confirm('Block this ' + type + '? It will be unable to submit reports or warnings.')) return
    setBusy(hash)
    try {
      const r = await fetch('/api/admin/fraud/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier_type: type, identifier_hash: hash, action }) })
      if (r.ok) { flash(action === 'block' ? 'Blocked.' : action === 'flag' ? 'Flagged.' : 'Marked reviewed.'); await load(true) }
      else { const d = await r.json().catch(() => ({})); setError(d.error ?? 'Action failed.') }
    } catch { setError('Action failed.') } finally { setBusy(null) }
  }

  const unblock = async (type: string, hash: string) => {
    if (!window.confirm('Remove this ' + type + ' from the blocklist?')) return
    setBusy(hash)
    try {
      const r = await fetch('/api/admin/fraud/block?identifier_type=' + type + '&identifier_hash=' + encodeURIComponent(hash), { method: 'DELETE' })
      if (r.ok) { flash('Removed.'); await load(true) }
      else setError('Could not remove.')
    } catch { setError('Could not remove.') } finally { setBusy(null) }
  }

  const gamed = (c: FraudCluster) => c.report_count >= 4 && (c.unique_ips ?? 0) <= Math.max(1, Math.floor(c.report_count / 3))

  return (
    <div style={{ padding: 24, color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Fraud &amp; Abuse</h1>
      <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 18px' }}>Suspicious activity surfaced from existing signals — low fraud scores, single-source clusters, and high-volume submitters. Discard gamed incidents; flag or block abusive sessions/IPs (identified only by hash).</p>

      {msg && <div style={ok}>{msg}</div>}
      {error && <div style={err}>{error} <button type="button" onClick={() => load()} style={retry}>Retry</button></div>}
      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}

      {!loading && (
        <div style={{ display: 'grid', gap: 22 }}>
          {/* 1. Suspicious / gamed clusters */}
          <Section title="Suspicious incidents" hint="Lowest fraud score first. A red dot marks likely gaming: many reports from very few unique sources.">
            {flagged.length === 0 ? <Empty>No incidents to review.</Empty> : (
              <div style={{ display: 'grid', gap: 6 }}>
                {flagged.map((c) => (
                  <div key={c.id} style={row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#e6edf3', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {gamed(c) && <span title="Likely gamed" style={{ width: 8, height: 8, borderRadius: 999, background: '#f85149', flexShrink: 0 }} />}
                        {c.location_name ?? 'Unknown location'} <span style={pill(c.status)}>{c.status}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3 }}>
                        fraud {fmt(c.fraud_score)} · conf {fmt(c.confidence_score)} · {c.report_count} reports from {c.unique_ips ?? '?'} IPs / {c.unique_sessions ?? '?'} sessions
                      </div>
                      {c.ai_concerns && c.ai_concerns.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                          {c.ai_concerns.map((x, i) => <span key={i} style={concern}>{x}</span>)}
                        </div>
                      )}
                    </div>
                    <button type="button" disabled={busy === c.id} onClick={() => discardCluster(c.id)} style={dangerBtn}>Discard</button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 2. Recently auto-discarded */}
          <Section title="Recently auto-discarded" hint="Dropped by the pipeline (confidence below threshold). The concerns are the why.">
            {discarded.length === 0 ? <Empty>Nothing auto-discarded recently.</Empty> : (
              <div style={{ display: 'grid', gap: 6 }}>
                {discarded.map((c) => (
                  <div key={c.id} style={row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#c9d1d9' }}>{c.location_name ?? 'Unknown'} · fraud {fmt(c.fraud_score)} · conf {fmt(c.confidence_score)} · {c.report_count} reports / {c.unique_ips ?? '?'} IPs</div>
                      {c.ai_concerns && c.ai_concerns.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>{c.ai_concerns.map((x, i) => <span key={i} style={concern}>{x}</span>)}</div>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: '#484f58' }}>{timeAgo(c.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 3. High-volume submitters */}
          <Section title="High-volume submitters (last 7 days)" hint="Sessions/IPs that submitted abnormally many reports despite the 1-per-10-min limit — a sign of persistent, deliberate abuse.">
            {!volumeAvailable ? <Empty>Volume analysis needs the abuse migration applied.</Empty>
              : volume.length === 0 ? <Empty>No abnormal submission volumes.</Empty> : (
              <div style={{ display: 'grid', gap: 6 }}>
                {volume.map((v) => (
                  <div key={v.identifier_type + v.identifier_hash} style={row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#e6edf3' }}>
                        <span style={{ textTransform: 'uppercase', fontSize: 10, color: '#8b949e', marginRight: 6 }}>{v.identifier_type}</span>
                        <code style={{ fontSize: 12, color: '#c9d1d9' }}>{v.identifier_hash.slice(0, 16)}…</code>
                        {v.state && <span style={pill(v.state === 'block' ? 'discarded' : 'pending_review')}>{v.state}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3 }}>{v.count} reports · last {timeAgo(v.last_at)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {v.state !== 'block' && <button type="button" disabled={busy === v.identifier_hash} onClick={() => actIdentifier(v.identifier_type, v.identifier_hash, 'block')} style={dangerBtn}>Block</button>}
                      {!v.state && <button type="button" disabled={busy === v.identifier_hash} onClick={() => actIdentifier(v.identifier_type, v.identifier_hash, 'flag')} style={ghostBtn}>Flag</button>}
                      {v.state && <button type="button" disabled={busy === v.identifier_hash} onClick={() => unblock(v.identifier_type, v.identifier_hash)} style={ghostBtn}>Remove</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 4. Blocklist */}
          <Section title="Blocklist & flags" hint="Currently blocked (cannot submit) or flagged (watch-only).">
            {blocklist.length === 0 ? <Empty>Nothing blocked or flagged.</Empty> : (
              <div style={{ display: 'grid', gap: 6 }}>
                {blocklist.map((b) => (
                  <div key={b.id} style={row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#e6edf3' }}>
                        <span style={pill(b.action === 'block' ? 'discarded' : 'pending_review')}>{b.action}</span>
                        <span style={{ textTransform: 'uppercase', fontSize: 10, color: '#8b949e', margin: '0 6px' }}>{b.identifier_type}</span>
                        <code style={{ fontSize: 12, color: '#c9d1d9' }}>{b.identifier_hash.slice(0, 16)}…</code>
                        {b.reviewed && <span style={{ fontSize: 10, color: '#3fb950', marginLeft: 6 }}>✓ reviewed</span>}
                      </div>
                      {b.reason && <div style={{ fontSize: 11, color: '#8b949e', marginTop: 3 }}>{b.reason}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {!b.reviewed && <button type="button" disabled={busy === b.identifier_hash} onClick={() => actIdentifier(b.identifier_type, b.identifier_hash, 'reviewed')} style={ghostBtn}>Mark reviewed</button>}
                      <button type="button" disabled={busy === b.identifier_hash} onClick={() => unblock(b.identifier_type, b.identifier_hash)} style={ghostBtn}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: '#484f58', marginBottom: 10 }}>{hint}</div>
      {children}
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 12, color: '#484f58', padding: '12px 0' }}>{children}</div> }
function fmt(n: number | null): string { return n == null ? '—' : String(n) }
function timeAgo(s: string): string {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago'; return Math.floor(h / 24) + 'd ago'
}
function pill(status: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    discarded: ['rgba(248,81,73,0.12)', '#f85149'], pending_review: ['rgba(210,153,34,0.12)', '#d29922'],
    confirmed: ['rgba(63,185,80,0.12)', '#3fb950'], auto_confirmed: ['rgba(63,185,80,0.1)', 'rgba(63,185,80,0.8)'],
  }
  const [bg, color] = map[status] ?? ['rgba(139,148,158,0.12)', '#8b949e']
  return { fontSize: 9, fontWeight: 600, color, background: bg, padding: '1px 6px', borderRadius: 4, marginLeft: 6, textTransform: 'uppercase' }
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: '10px 12px' }
const concern: React.CSSProperties = { fontSize: 10, color: '#d29922', background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.25)', borderRadius: 3, padding: '1px 6px' }
const dangerBtn: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#f85149', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.35)', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', flexShrink: 0 }
const ghostBtn: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#8b949e', background: 'transparent', border: '1px solid #30363d', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', flexShrink: 0 }
const ok: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 12 }
const err: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 12 }
const retry: React.CSSProperties = { marginLeft: 8, background: 'none', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 4, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }
