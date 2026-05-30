'use client'

import { useEffect, useState, useCallback } from 'react'

// Leader/admin dispatch board: every dispatch (active + history) with team,
// status, response time, the note, and the on-scene report. Reassign / recall
// in two taps. Incident choices for reassign come from the live board feed.

const STATUS_LABEL: Record<string, string> = { assigned: 'Assigned', en_route: 'En route', on_scene: 'On scene', done: 'Done', cancelled: 'Cancelled' }
const STATUS_COLOUR: Record<string, string> = { assigned: '#58a6ff', en_route: '#d29922', on_scene: '#3fb950', done: '#8b949e', cancelled: '#f85149' }

interface Dispatch {
  id: string; cluster_id: string; team_name: string | null; team_type: string | null; status: string
  note: string | null; assigned_at: string; response_minutes: number | null
  report: { people_assisted: number | null; services: string | null; new_hazards: string | null } | null
}
interface Incident { id: string; lat: number; lon: number; inside: boolean }

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

export default function NgoDispatchPage() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [reassignFor, setReassignFor] = useState<Dispatch | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    const [dRes, bRes] = await Promise.all([fetch('/api/ngo/dispatch'), fetch('/api/ngo/board')])
    if (dRes.ok) setDispatches((await dRes.json()).dispatches ?? [])
    if (bRes.ok) setIncidents(((await bRes.json()).incidents ?? []).filter((i: Incident) => i.inside))
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [load])

  async function recall(id: string) {
    const r = prompt('Recall reason (optional):') ?? ''
    const res = await fetch(`/api/ngo/dispatch/${id}/recall`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: r }) })
    if (res.ok) load()
  }
  async function doReassign(clusterId: string) {
    if (!reassignFor) return
    const res = await fetch(`/api/ngo/dispatch/${reassignFor.id}/reassign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cluster_id: clusterId, reason }) })
    if (res.ok) { setReassignFor(null); setReason(''); load() }
  }

  const active = dispatches.filter((d) => ['assigned', 'en_route', 'on_scene'].includes(d.status))
  const closed = dispatches.filter((d) => ['done', 'cancelled'].includes(d.status))

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Dispatch</h1>
      <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2, marginBottom: 20 }}>Teams in the field and their response.</div>

      <Section title={`Active (${active.length})`} rows={active} onRecall={recall} onReassign={setReassignFor} />
      <Section title={`History (${closed.length})`} rows={closed} onRecall={recall} onReassign={setReassignFor} />

      {reassignFor && (
        <div onClick={() => setReassignFor(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Reassign {reassignFor.team_name}</div>
            <input style={input} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div style={{ fontSize: 12, color: '#8b949e', margin: '10px 0 6px' }}>Move to incident:</div>
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {incidents.filter((i) => i.id !== reassignFor.cluster_id).map((i) => (
                <button key={i.id} type="button" onClick={() => doReassign(i.id)} style={incBtn}>{i.lat.toFixed(3)}, {i.lon.toFixed(3)}</button>
              ))}
              {incidents.length === 0 && <div style={{ fontSize: 13, color: '#8b949e' }}>No in-area incidents.</div>}
            </div>
            <button type="button" onClick={() => setReassignFor(null)} style={{ ...incBtn, marginTop: 12, borderColor: '#21262d', color: '#8b949e' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, rows, onRecall, onReassign }: { title: string; rows: Dispatch[]; onRecall: (id: string) => void; onReassign: (d: Dispatch) => void }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8b949e', marginBottom: 8 }}>{title}</div>
      {rows.length === 0 && <div style={{ fontSize: 13, color: '#484f58' }}>None.</div>}
      {rows.map((d) => {
        const open = ['assigned', 'en_route', 'on_scene'].includes(d.status)
        return (
          <div key={d.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>{d.team_name ?? 'Team'} <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 400 }}>· {d.team_type}</span></div>
              <span style={{ fontSize: 12, color: STATUS_COLOUR[d.status] }}>● {STATUS_LABEL[d.status] ?? d.status}</span>
            </div>
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
              assigned {timeAgo(d.assigned_at)}{d.response_minutes != null ? ` · response ${d.response_minutes}m` : ''}
            </div>
            {d.note && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>“{d.note}”</div>}
            {d.report && (
              <div style={{ fontSize: 12, color: '#e6edf3', marginTop: 8, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: 8 }}>
                <div style={{ color: '#3fb950', fontSize: 11, marginBottom: 2 }}>On-scene report</div>
                {d.report.people_assisted != null && <div>People assisted: {d.report.people_assisted}</div>}
                {d.report.services && <div>Services: {d.report.services}</div>}
                {d.report.new_hazards && <div>New hazards: {d.report.new_hazards}</div>}
              </div>
            )}
            {open && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => onReassign(d)} style={smallBtn}>Reassign</button>
                <button type="button" onClick={() => onRecall(d.id)} style={{ ...smallBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>Recall</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14, marginBottom: 8 }
const smallBtn: React.CSSProperties = { height: 30, padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }
const modal: React.CSSProperties = { width: 360, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22 }
const input: React.CSSProperties = { width: '100%', height: 38, padding: '0 10px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontFamily: 'system-ui', outline: 'none' }
const incBtn: React.CSSProperties = { textAlign: 'left', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '8px 10px', color: '#e6edf3', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui' }
