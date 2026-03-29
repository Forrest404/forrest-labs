'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamStats {
  total: number
  standby: number
  deployed: number
  returning: number
  unavailable: number
}

interface Dispatch {
  id: string
  team_id: string
  team_name: string
  organisation_name: string
  team_type: string
  cluster_id: string
  location_name: string | null
  confidence_score: number
  status: string
  assigned_at: string
  acknowledged_at: string | null
  arrived_at: string | null
  completed_at: string | null
}

interface AlertCluster {
  id: string
  status: string
  confidence_score: number
  report_count: number
  location_name: string | null
  centroid_lat: number
  centroid_lon: number
  created_at: string
}

interface Resource {
  id: string
  organisation_id: string
  organisation_name: string
  resource_type: string
  name: string
  quantity_total: number
  quantity_available: number
  unit: string
  low_stock_threshold: number
}

interface Team {
  id: string
  name: string
  organisation_name: string
  team_type: string
  status: string
  current_location: string | null
  capacity: number
  organisation_id: string
}

interface Organisation {
  id: string
  name: string
  org_type: string
  operational_area: string | null
  team_count: number
  deployed_count: number
}

interface Partner {
  id: string
  email: string
  role: string
  organisation_id: string
  last_login: string | null
}

interface PartnerCreateResult {
  email: string
  temp_password: string
}

interface CommandOverview {
  team_stats: TeamStats
  active_dispatches: Dispatch[]
  recent_alerts: AlertCluster[]
  low_stock_alerts: Resource[]
  recent_dispatches: Dispatch[]
  teams: Team[]
  resources: Resource[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  if (m < 1) return 'just now'
  if (m < 60) return m + 'm ago'
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

function teamStatusColour(status: string): string {
  const map: Record<string, string> = { standby: '#3fb950', deployed: '#d29922', returning: '#58a6ff', unavailable: '#f85149', offline: '#484f58' }
  return map[status] ?? '#484f58'
}

function dispatchStatusLabel(status: string): string {
  const map: Record<string, string> = { assigned: 'Assigned', acknowledged: 'Acknowledged', en_route: 'En route', on_scene: 'On scene', completed: 'Completed', cancelled: 'Cancelled' }
  return map[status] ?? status
}

function teamTypeLabel(type: string): string {
  const map: Record<string, string> = { medical: 'Medical', rescue: 'Rescue', assessment: 'Assessment', shelter: 'Shelter', logistics: 'Logistics', liaison: 'Liaison' }
  return map[type] ?? type
}

function confColour(score: number): string {
  if (score >= 85) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

function responseTime(assigned: string, arrived: string | null): string {
  if (!arrived) return '—'
  const mins = Math.floor((new Date(arrived).getTime() - new Date(assigned).getTime()) / 60000)
  if (mins < 60) return mins + 'm'
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
}

function nextDispatchStatus(status: string): { next: string; label: string } | null {
  const map: Record<string, { next: string; label: string }> = {
    assigned: { next: 'acknowledged', label: 'Acknowledge' },
    acknowledged: { next: 'en_route', label: 'Mark en route' },
    en_route: { next: 'on_scene', label: 'Mark on scene' },
    on_scene: { next: 'completed', label: 'Mark complete' },
  }
  return map[status] ?? null
}

const TABS = ['overview', 'teams', 'dispatch', 'resources', 'partners'] as const
type Tab = (typeof TABS)[number]

const TEAM_STATUSES = ['standby', 'deployed', 'returning', 'unavailable', 'offline'] as const
const TEAM_TYPES = ['medical', 'rescue', 'assessment', 'shelter', 'logistics', 'liaison'] as const

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommandPage() {
  const router = useRouter()
  const [data, setData] = useState<CommandOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [dispatching, setDispatching] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState<AlertCluster | null>(null)

  // Teams tab
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamOrg, setNewTeamOrg] = useState('')
  const [newTeamType, setNewTeamType] = useState('medical')
  const [newTeamCapacity, setNewTeamCapacity] = useState(4)
  const [newTeamLocation, setNewTeamLocation] = useState('')

  // Resources tab
  const [showAddResource, setShowAddResource] = useState(false)
  const [newResOrg, setNewResOrg] = useState('')
  const [newResType, setNewResType] = useState('medical_supply')
  const [newResName, setNewResName] = useState('')
  const [newResTotal, setNewResTotal] = useState(100)
  const [newResAvail, setNewResAvail] = useState(100)
  const [newResUnit, setNewResUnit] = useState('units')
  const [newResThreshold, setNewResThreshold] = useState(20)

  // Teams edit
  const [editingTeam, setEditingTeam] = useState<string | null>(null)
  const [editTeamName, setEditTeamName] = useState('')
  const [editTeamType, setEditTeamType] = useState('')
  const [editTeamCapacity, setEditTeamCapacity] = useState(0)
  const [editTeamLocation, setEditTeamLocation] = useState('')

  // Partners tab
  const [orgs, setOrgs] = useState<Organisation[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [creatingForOrg, setCreatingForOrg] = useState<string | null>(null)
  const [partnerEmail, setPartnerEmail] = useState('')
  const [partnerRole, setPartnerRole] = useState('coordinator')
  const [partnerResult, setPartnerResult] = useState<PartnerCreateResult | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [editingPartner, setEditingPartner] = useState<string | null>(null)
  const [editPartnerRole, setEditPartnerRole] = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/command/overview')
      if (res.status === 401) { router.push('/admin/login'); return }
      const d = (await res.json()) as CommandOverview
      setData(d)
      setLoading(false)
    } catch { setLoading(false) }
  }, [router])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    if (activeTab === 'partners') {
      fetch('/api/admin/command/organisations').then((r) => r.json()).then((d: { organisations?: Organisation[] }) => setOrgs(d.organisations ?? [])).catch(() => {})
      fetch('/api/admin/command/partners').then((r) => r.json()).then((d: { partners?: Partner[] }) => setPartners(d.partners ?? [])).catch(() => {})
    }
  }, [activeTab])

  // ── Actions ────────────────────────────────────────────────────────────

  async function advanceDispatch(id: string, nextStatus: string) {
    await fetch('/api/admin/command/dispatch/' + id + '/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    fetchData()
  }

  async function dispatchTeam(teamId: string) {
    if (!selectedCluster || dispatching) return
    setDispatching(true)
    await fetch('/api/admin/command/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: teamId, cluster_id: selectedCluster.id }),
    })
    setDispatching(false)
    setSelectedCluster(null)
    setActiveTab('overview')
    fetchData()
  }

  async function saveTeam() {
    await fetch('/api/admin/command/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTeamName, organisation_id: newTeamOrg, team_type: newTeamType, capacity: newTeamCapacity, location_name: newTeamLocation || null }),
    })
    setShowAddTeam(false)
    setNewTeamName('')
    fetchData()
  }

  async function changeTeamStatus(teamId: string, status: string) {
    await fetch('/api/admin/command/teams/' + teamId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchData()
  }

  async function deleteTeam(teamId: string) {
    if (!confirm('Remove this team?')) return
    await fetch('/api/admin/command/teams/' + teamId, { method: 'DELETE' })
    fetchData()
  }

  async function deletePartner(partnerId: string) {
    if (!confirm('Deactivate this partner account?')) return
    await fetch('/api/admin/command/partners/' + partnerId, { method: 'DELETE' })
    fetch('/api/admin/command/partners').then((r) => r.json()).then((d: { partners?: Partner[] }) => setPartners(d.partners ?? [])).catch(() => {})
  }

  async function togglePartnerActive(partnerId: string, active: boolean) {
    await fetch('/api/admin/command/partners/' + partnerId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    fetch('/api/admin/command/partners').then((r) => r.json()).then((d: { partners?: Partner[] }) => setPartners(d.partners ?? [])).catch(() => {})
  }

  async function saveResource() {
    await fetch('/api/admin/command/resources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organisation_id: newResOrg, resource_type: newResType, name: newResName, quantity_total: newResTotal, quantity_available: newResAvail, unit: newResUnit, low_stock_threshold: newResThreshold }),
    })
    setShowAddResource(false)
    setNewResName('')
    fetchData()
  }

  async function adjustResource(id: string, current: number, delta: number) {
    await fetch('/api/admin/command/resources/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity_available: current + delta }),
    })
    fetchData()
  }

  async function createPartner() {
    const res = await fetch('/api/admin/command/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organisation_id: creatingForOrg, email: partnerEmail, role: partnerRole }),
    })
    const d = (await res.json()) as PartnerCreateResult
    setPartnerResult(d)
    setPartnerEmail('')
  }

  function startEditTeam(t: Team) {
    setEditingTeam(t.id)
    setEditTeamName(t.name)
    setEditTeamType(t.team_type)
    setEditTeamCapacity(t.capacity)
    setEditTeamLocation(t.current_location ?? '')
  }

  async function saveEditTeam() {
    if (!editingTeam) return
    await fetch('/api/admin/command/teams/' + editingTeam, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editTeamName, team_type: editTeamType, capacity: editTeamCapacity, location_name: editTeamLocation || null }),
    })
    setEditingTeam(null)
    fetchData()
  }

  async function updatePartnerRole(id: string, role: string) {
    await fetch('/api/admin/command/partners/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setEditingPartner(null)
    fetch('/api/admin/command/partners').then((r) => r.json()).then((d: { partners?: Partner[] }) => setPartners(d.partners ?? []))
  }

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ fontSize: 14, color: '#484f58' }}>Loading command centre...</span>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const inputStyle = { width: '100%', height: 36, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '0 10px', fontSize: 13, color: '#e6edf3', fontFamily: 'system-ui', boxSizing: 'border-box' as const, outline: 'none' }
  const selectStyle = { ...inputStyle, appearance: 'none' as const, paddingRight: 28 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '0 0 0', borderBottom: '1px solid #21262d', flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{
            height: 34, padding: '0 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui',
            borderBottom: activeTab === tab ? '2px solid #f85149' : '2px solid transparent',
            color: activeTab === tab ? '#e6edf3' : '#8b949e',
            background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
          }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

        {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div>
            {/* Team stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Total teams', number: data.team_stats.total, color: '#e6edf3', sub: 'across all organisations', border: '#21262d' },
                { label: 'Standby', number: data.team_stats.standby, color: '#3fb950', sub: 'ready to deploy', border: 'rgba(63,185,80,0.15)' },
                { label: 'Deployed', number: data.team_stats.deployed, color: '#d29922', sub: 'currently in field', border: 'rgba(210,153,34,0.2)' },
                { label: 'Low stock alerts', number: data.low_stock_alerts.length, color: data.low_stock_alerts.length > 0 ? '#f85149' : '#e6edf3', sub: data.low_stock_alerts.length > 0 ? 'resources need restocking' : 'all resources adequate', border: data.low_stock_alerts.length > 0 ? 'rgba(248,81,73,0.25)' : '#21262d' },
              ].map((c) => (
                <div key={c.label} style={{ background: '#161b22', border: `1px solid ${c.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{c.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: c.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{c.number}</div>
                  <div style={{ fontSize: 12, color: '#484f58', marginTop: 4 }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* Active dispatches */}
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>Active dispatches</div>
            {data.active_dispatches.length === 0 ? (
              <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 24, textAlign: 'center', fontSize: 13, color: '#484f58', marginBottom: 16 }}>No active dispatches</div>
            ) : (
              data.active_dispatches.map((d) => {
                const ns = nextDispatchStatus(d.status)
                return (
                  <div key={d.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 14, marginBottom: 6, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>{d.team_name}</div>
                      <div style={{ fontSize: 11, color: '#484f58' }}>{d.organisation_name}</div>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'rgba(88,166,255,0.08)', color: '#58a6ff' }}>{teamTypeLabel(d.team_type)}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: '#e6edf3' }}>{d.location_name ?? 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: '#8b949e' }}>{d.confidence_score}% confidence</div>
                      <div style={{ fontSize: 11, color: '#484f58' }}>{timeAgo(d.assigned_at)}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: `${teamStatusColour(d.status === 'on_scene' ? 'standby' : d.status === 'en_route' ? 'returning' : 'deployed')}18`, color: d.status === 'on_scene' ? '#3fb950' : d.status === 'en_route' ? '#58a6ff' : '#d29922' }}>{dispatchStatusLabel(d.status)}</span>
                      {ns && (
                        <button type="button" onClick={() => advanceDispatch(d.id, ns.next)} style={{ height: 26, fontSize: 11, background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.2)', color: '#3fb950', borderRadius: 4, cursor: 'pointer', padding: '0 10px', fontFamily: 'system-ui' }}>{ns.label}</button>
                      )}
                    </div>
                  </div>
                )
              })
            )}

            {/* Unassigned alerts */}
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 10, marginTop: 16 }}>Confirmed incidents — no team assigned</div>
            {data.recent_alerts.length === 0 ? (
              <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 24, textAlign: 'center', fontSize: 13, color: '#484f58' }}>No unassigned incidents</div>
            ) : (
              data.recent_alerts.map((a) => (
                <div key={a.id} style={{ background: '#161b22', border: '1px solid rgba(248,81,73,0.15)', borderRadius: 8, padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>{a.location_name ?? a.centroid_lat.toFixed(3) + ', ' + a.centroid_lon.toFixed(3)}</div>
                    <div style={{ fontSize: 11, color: '#8b949e' }}>{a.confidence_score}% · {a.report_count} reports</div>
                    <div style={{ fontSize: 11, color: '#484f58' }}>{timeAgo(a.created_at)}</div>
                  </div>
                  <button type="button" onClick={() => { setSelectedCluster(a); setActiveTab('dispatch') }} style={{ height: 30, padding: '0 12px', background: '#f85149', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui' }}>Assign team →</button>
                </div>
              ))
            )}

            {/* Low stock */}
            {data.low_stock_alerts.length > 0 && (
              <div style={{ background: 'rgba(210,153,34,0.06)', border: '1px solid rgba(210,153,34,0.2)', borderRadius: 8, padding: 12, marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d29922', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#d29922' }}>Low stock warnings</span>
                </div>
                {data.low_stock_alerts.map((r) => (
                  <div key={r.id} style={{ fontSize: 12, color: '#8b949e', padding: '4px 0' }}>{r.name} — {r.quantity_available}/{r.quantity_total} {r.unit} remaining</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TEAMS TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'teams' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: '#484f58' }}>{data.teams?.length ?? 0} teams</span>
              <button type="button" onClick={() => setShowAddTeam(true)} style={{ height: 32, padding: '0 14px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', color: '#3fb950', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui' }}>Add team</button>
            </div>

            {showAddTeam && (
              <div style={{ background: '#161b22', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 8, padding: 16, marginBottom: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Team name</div>
                    <input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Organisation</div>
                    <select value={newTeamOrg} onChange={(e) => setNewTeamOrg(e.target.value)} style={selectStyle}>
                      <option value="">Select...</option>
                      {[...new Set(data.teams?.map((t) => t.organisation_id) ?? [])].map((orgId) => {
                        const team = data.teams?.find((t) => t.organisation_id === orgId)
                        return <option key={orgId} value={orgId}>{team?.organisation_name ?? orgId}</option>
                      })}
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Type</div>
                    <select value={newTeamType} onChange={(e) => setNewTeamType(e.target.value)} style={selectStyle}>
                      {TEAM_TYPES.map((t) => <option key={t} value={t}>{teamTypeLabel(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Capacity</div>
                    <input type="number" value={newTeamCapacity} onChange={(e) => setNewTeamCapacity(parseInt(e.target.value) || 0)} style={inputStyle} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Location (optional)</div>
                    <input value={newTeamLocation} onChange={(e) => setNewTeamLocation(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setShowAddTeam(false)} style={{ height: 32, padding: '0 14px', background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }}>Cancel</button>
                  <button type="button" onClick={saveTeam} style={{ height: 32, padding: '0 14px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', color: '#3fb950', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui' }}>Save team</button>
                </div>
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #21262d' }}>
                  {['Team', 'Organisation', 'Type', 'Status', 'Location', 'Capacity', ''].map((col) => (
                    <th key={col} style={{ fontSize: 10, fontWeight: 500, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 0 10px', textAlign: 'left' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.teams ?? []).map((t) => editingTeam === t.id ? (
                  <tr key={t.id} style={{ borderBottom: '1px solid #161b22', background: 'rgba(88,166,255,0.04)' }}>
                    <td style={{ padding: '6px 8px 6px 0' }}>
                      <input value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} style={{ ...inputStyle, height: 30, fontSize: 12 }} />
                    </td>
                    <td style={{ padding: '6px 8px 6px 0', fontSize: 12, color: '#8b949e' }}>{t.organisation_name}</td>
                    <td style={{ padding: '6px 8px 6px 0' }}>
                      <select value={editTeamType} onChange={(e) => setEditTeamType(e.target.value)} style={{ ...selectStyle, height: 30, fontSize: 11 }}>
                        {TEAM_TYPES.map((tp) => <option key={tp} value={tp}>{teamTypeLabel(tp)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px 6px 0' }}>
                      <select value={t.status} onChange={(e) => changeTeamStatus(t.id, e.target.value)} style={{ background: 'transparent', border: 'none', color: teamStatusColour(t.status), fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui', outline: 'none' }}>
                        {TEAM_STATUSES.map((s) => <option key={s} value={s} style={{ background: '#161b22', color: '#e6edf3' }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px 6px 0' }}>
                      <input value={editTeamLocation} onChange={(e) => setEditTeamLocation(e.target.value)} placeholder="Location" style={{ ...inputStyle, height: 30, fontSize: 12 }} />
                    </td>
                    <td style={{ padding: '6px 8px 6px 0' }}>
                      <input type="number" value={editTeamCapacity} onChange={(e) => setEditTeamCapacity(parseInt(e.target.value) || 0)} style={{ ...inputStyle, height: 30, fontSize: 12, width: 60 }} />
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={saveEditTeam} style={{ height: 24, padding: '0 8px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', color: '#3fb950', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui', marginRight: 4 }}>Save</button>
                      <button type="button" onClick={() => setEditingTeam(null)} style={{ height: 24, padding: '0 8px', background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui' }}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} style={{ borderBottom: '1px solid #161b22' }}>
                    <td style={{ padding: '10px 8px 10px 0', fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>{t.name}</td>
                    <td style={{ padding: '10px 8px 10px 0', fontSize: 12, color: '#8b949e' }}>{t.organisation_name}</td>
                    <td style={{ padding: '10px 8px 10px 0' }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(88,166,255,0.08)', color: '#58a6ff' }}>{teamTypeLabel(t.team_type)}</span>
                    </td>
                    <td style={{ padding: '10px 8px 10px 0' }}>
                      <select value={t.status} onChange={(e) => changeTeamStatus(t.id, e.target.value)} style={{ background: 'transparent', border: 'none', color: teamStatusColour(t.status), fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui', outline: 'none' }}>
                        {TEAM_STATUSES.map((s) => <option key={s} value={s} style={{ background: '#161b22', color: '#e6edf3' }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '10px 8px 10px 0', fontSize: 12, color: '#8b949e' }}>{t.current_location ?? '\u2014'}</td>
                    <td style={{ padding: '10px 0', fontSize: 12, color: '#8b949e' }}>{t.capacity} personnel</td>
                    <td style={{ padding: '10px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => startEditTeam(t)} style={{ height: 24, padding: '0 8px', background: 'transparent', border: '1px solid rgba(88,166,255,0.2)', color: '#58a6ff', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui', marginRight: 4 }}>Edit</button>
                      <button type="button" onClick={() => deleteTeam(t.id)} style={{ height: 24, padding: '0 8px', background: 'transparent', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui' }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── DISPATCH TAB ──────────────────────────────────────────────── */}
        {activeTab === 'dispatch' && (
          <div>
            <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 200px)', minHeight: 400 }}>
              {/* Left — incidents */}
              <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #21262d', paddingRight: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>Confirmed incidents</div>
                {data.recent_alerts.map((c) => (
                  <div key={c.id} onClick={() => setSelectedCluster(c)} style={{
                    background: selectedCluster?.id === c.id ? 'rgba(248,81,73,0.08)' : '#161b22',
                    border: selectedCluster?.id === c.id ? '1px solid rgba(248,81,73,0.3)' : '1px solid #21262d',
                    borderRadius: 6, padding: 12, marginBottom: 6, cursor: 'pointer',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>{c.location_name ?? c.centroid_lat.toFixed(3) + ', ' + c.centroid_lon.toFixed(3)}</div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{c.confidence_score}% · {c.report_count} reports · {timeAgo(c.created_at)}</div>
                  </div>
                ))}
              </div>

              {/* Right — available teams */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>
                  {selectedCluster ? 'Assign to: ' + (selectedCluster.location_name ?? 'Selected incident') : 'Select an incident first'}
                </div>
                {!selectedCluster ? (
                  <div style={{ fontSize: 13, color: '#484f58' }}>Click an incident on the left to see available teams</div>
                ) : (
                  (data.teams ?? []).filter((t) => t.status === 'standby').map((t) => (
                    <div key={t.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: '#484f58' }}>{t.organisation_name}</div>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(88,166,255,0.08)', color: '#58a6ff' }}>{teamTypeLabel(t.team_type)}</span>
                        <span style={{ fontSize: 11, color: '#8b949e', marginLeft: 8 }}>{t.capacity} personnel</span>
                      </div>
                      <button type="button" disabled={dispatching} onClick={() => dispatchTeam(t.id)} style={{ height: 32, padding: '0 14px', background: '#f85149', color: 'white', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: dispatching ? 'default' : 'pointer', fontFamily: 'system-ui' }}>Dispatch →</button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Response time stats */}
            {data.recent_dispatches.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>Response times (last {data.recent_dispatches.length} dispatches)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {(() => {
                    const times = data.recent_dispatches.filter((d) => d.arrived_at).map((d) => Math.floor((new Date(d.arrived_at!).getTime() - new Date(d.assigned_at).getTime()) / 60000))
                    const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
                    const fastest = times.length > 0 ? Math.min(...times) : 0
                    const slowest = times.length > 0 ? Math.max(...times) : 0
                    return [
                      { label: 'Average', value: avg + 'm', color: '#e6edf3' },
                      { label: 'Fastest', value: fastest + 'm', color: '#3fb950' },
                      { label: 'Slowest', value: slowest + 'm', color: '#d29922' },
                    ].map((s) => (
                      <div key={s.label} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 10 }}>
                        <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.value}</div>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RESOURCES TAB ─────────────────────────────────────────────── */}
        {activeTab === 'resources' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: '#484f58' }}>{data.resources?.length ?? 0} resources</span>
              <button type="button" onClick={() => setShowAddResource(true)} style={{ height: 32, padding: '0 14px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', color: '#3fb950', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui' }}>Add resource</button>
            </div>

            {showAddResource && (
              <div style={{ background: '#161b22', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 8, padding: 16, marginBottom: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Name</div>
                    <input value={newResName} onChange={(e) => setNewResName(e.target.value)} placeholder="e.g. First aid kits" style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Organisation</div>
                    <select value={newResOrg} onChange={(e) => setNewResOrg(e.target.value)} style={selectStyle}>
                      <option value="">Select...</option>
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Total quantity</div>
                    <input type="number" value={newResTotal} onChange={(e) => setNewResTotal(parseInt(e.target.value) || 0)} style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Available</div>
                    <input type="number" value={newResAvail} onChange={(e) => setNewResAvail(parseInt(e.target.value) || 0)} style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Unit</div>
                    <input value={newResUnit} onChange={(e) => setNewResUnit(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Low stock threshold</div>
                    <input type="number" value={newResThreshold} onChange={(e) => setNewResThreshold(parseInt(e.target.value) || 0)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setShowAddResource(false)} style={{ height: 32, padding: '0 14px', background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }}>Cancel</button>
                  <button type="button" onClick={saveResource} style={{ height: 32, padding: '0 14px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', color: '#3fb950', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui' }}>Save resource</button>
                </div>
              </div>
            )}

            {/* Resources grouped by type */}
            {(() => {
              const resources = data.resources ?? []
              const types = [...new Set(resources.map((r) => r.resource_type))]
              return types.map((type) => (
                <div key={type}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 0', fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, marginTop: 12 }}>{type.replace(/_/g, ' ')}</div>
                  {resources.filter((r) => r.resource_type === type).map((r) => {
                    const pct = r.quantity_total > 0 ? (r.quantity_available / r.quantity_total) * 100 : 0
                    const barColor = pct > 50 ? '#3fb950' : r.quantity_available > r.low_stock_threshold ? '#d29922' : '#f85149'
                    const isLow = r.quantity_available <= r.low_stock_threshold
                    return (
                      <div key={r.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: '10px 12px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: '#8b949e' }}>{r.organisation_name}</div>
                        </div>
                        <div style={{ width: 120, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: pct + '%', height: '100%', background: barColor, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 11, color: barColor, whiteSpace: 'nowrap' }}>{r.quantity_available}/{r.quantity_total} {r.unit}</span>
                        </div>
                        {isLow && <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: 'rgba(210,153,34,0.1)', color: '#d29922' }}>LOW</span>}
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button type="button" disabled={r.quantity_available <= 0} onClick={() => adjustResource(r.id, r.quantity_available, -1)} style={{ width: 24, height: 22, background: 'transparent', border: '1px solid #21262d', borderRadius: 3, color: '#8b949e', fontSize: 11, cursor: r.quantity_available <= 0 ? 'default' : 'pointer', opacity: r.quantity_available <= 0 ? 0.3 : 1, fontFamily: 'system-ui' }}>-</button>
                          <button type="button" disabled={r.quantity_available >= r.quantity_total} onClick={() => adjustResource(r.id, r.quantity_available, 1)} style={{ width: 24, height: 22, background: 'transparent', border: '1px solid #21262d', borderRadius: 3, color: '#8b949e', fontSize: 11, cursor: r.quantity_available >= r.quantity_total ? 'default' : 'pointer', opacity: r.quantity_available >= r.quantity_total ? 0.3 : 1, fontFamily: 'system-ui' }}>+</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            })()}
          </div>
        )}

        {/* ── PARTNERS TAB ──────────────────────────────────────────────── */}
        {activeTab === 'partners' && (
          <div>
            <div style={{ background: 'rgba(210,153,34,0.06)', border: '1px solid rgba(210,153,34,0.2)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#d29922' }}>
              Partner accounts give NGO coordinators read access to confirmed incidents and their team assignments. They cannot approve, reject, or access audit logs.
            </div>

            {orgs.map((org) => {
              const orgPartners = partners.filter((p) => p.organisation_id === org.id)
              return (
                <div key={org.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 14, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>{org.name}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(88,166,255,0.08)', color: '#58a6ff' }}>{org.org_type}</span>
                    <span style={{ fontSize: 11, color: '#484f58' }}>{org.team_count} teams · {org.deployed_count} deployed</span>
                  </div>
                  {org.operational_area && <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>{org.operational_area}</div>}

                  {orgPartners.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {orgPartners.map((p) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                          <span style={{ color: '#e6edf3' }}>{p.email}</span>
                          {editingPartner === p.id ? (
                            <>
                              <select value={editPartnerRole} onChange={(e) => setEditPartnerRole(e.target.value)} style={{ height: 24, fontSize: 11, background: '#0d1117', border: '1px solid #21262d', color: '#e6edf3', borderRadius: 4, padding: '0 6px', fontFamily: 'system-ui' }}>
                                <option value="coordinator">Coordinator</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button type="button" onClick={() => updatePartnerRole(p.id, editPartnerRole)} style={{ height: 22, padding: '0 7px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', color: '#3fb950', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui' }}>Save</button>
                              <button type="button" onClick={() => setEditingPartner(null)} style={{ height: 22, padding: '0 7px', background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui' }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(88,166,255,0.08)', color: '#58a6ff' }}>{p.role}</span>
                              <span style={{ fontSize: 11, color: '#484f58' }}>{p.last_login ? timeAgo(p.last_login) : 'Never logged in'}</span>
                              <span style={{ flex: 1 }} />
                              <button type="button" onClick={() => { setEditingPartner(p.id); setEditPartnerRole(p.role) }} style={{ height: 22, padding: '0 7px', background: 'transparent', border: '1px solid rgba(88,166,255,0.2)', color: '#58a6ff', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui' }}>Edit</button>
                              <button type="button" onClick={() => deletePartner(p.id)} style={{ height: 22, padding: '0 7px', background: 'transparent', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'system-ui' }}>Remove</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {creatingForOrg === org.id ? (
                    partnerResult ? (
                      <div style={{ background: 'rgba(63,185,80,0.06)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#3fb950', marginBottom: 8 }}>Account created</div>
                        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>Send these credentials to the partner:</div>
                        <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Email:</div>
                        <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 5, padding: '8px 12px', fontSize: 13, color: '#e6edf3', fontFamily: 'monospace', marginBottom: 8 }}>{partnerResult.email}</div>
                        <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Temporary password:</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ flex: 1, background: '#0d1117', border: '1px solid #21262d', borderRadius: 5, padding: '8px 12px', fontSize: 13, color: '#e6edf3', fontFamily: 'monospace' }}>{partnerResult.temp_password}</div>
                          <button type="button" onClick={() => { navigator.clipboard.writeText(partnerResult.temp_password); setCopiedPassword(true); setTimeout(() => setCopiedPassword(false), 2000) }} style={{ height: 32, padding: '0 12px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', color: '#3fb950', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>
                            {copiedPassword ? 'Copied ✓' : 'Copy password'}
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: '#d29922', marginTop: 8 }}>This password cannot be recovered. Share it now and ask the partner to change it.</div>
                        <button type="button" onClick={() => { setCreatingForOrg(null); setPartnerResult(null) }} style={{ height: 28, fontSize: 11, background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 4, cursor: 'pointer', marginTop: 8, padding: '0 10px', fontFamily: 'system-ui' }}>Done</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Email</div>
                          <input value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} placeholder="coordinator@ngo.org" style={inputStyle} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Role</div>
                          <select value={partnerRole} onChange={(e) => setPartnerRole(e.target.value)} style={{ ...selectStyle, width: 130 }}>
                            <option value="coordinator">Coordinator</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </div>
                        <button type="button" onClick={createPartner} style={{ height: 36, padding: '0 12px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', color: '#3fb950', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>Create account</button>
                        <button type="button" onClick={() => setCreatingForOrg(null)} style={{ height: 36, padding: '0 10px', background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }}>Cancel</button>
                      </div>
                    )
                  ) : (
                    <button type="button" onClick={() => { setCreatingForOrg(org.id); setPartnerResult(null); setPartnerEmail('') }} style={{ height: 28, fontSize: 11, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', color: '#58a6ff', borderRadius: 4, cursor: 'pointer', padding: '0 10px', fontFamily: 'system-ui' }}>Create partner account</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
