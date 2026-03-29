'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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

function confColour(score: number): string {
  if (score >= 85) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CaseFile {
  id: string
  title: string
  description: string | null
  status: string
  cluster_ids: string[]
  tags: string[]
  created_by: string
  created_at: string
  updated_at: string | null
}

interface LinkedCluster {
  id: string
  location_name: string
  status: string
  confidence_score: number
  report_count: number
  created_at: string
  centroid_lat: number
  centroid_lon: number
  ai_reasoning: string | null
}

interface CaseDetail {
  case: CaseFile
  clusters: LinkedCluster[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CasesPage() {
  const [cases, setCases] = useState<CaseFile[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [selected, setSelected] = useState<CaseFile | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<CaseDetail | null>(null)
  const [linkInput, setLinkInput] = useState('')
  const router = useRouter()

  const fetchCases = useCallback(() => {
    fetch('/api/admin/cases')
      .then((r) => {
        if (r.status === 401) { router.push('/admin/login'); return null }
        return r.json()
      })
      .then((d) => {
        if (!d) return
        setCases(d.cases ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  useEffect(() => { fetchCases() }, [fetchCases])

  const fetchDetail = useCallback((id: string) => {
    fetch('/api/admin/cases/' + id)
      .then((r) => r.json())
      .then((d) => setSelectedDetail(d))
  }, [])

  const handleSelect = (c: CaseFile) => {
    setSelected(c)
    fetchDetail(c.id)
  }

  const handleCreate = () => {
    if (!newTitle.trim()) return
    fetch('/api/admin/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: newTitle,
        description: newDesc || undefined,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        setCases((prev) => [d.case, ...prev])
        setCreating(false)
        setNewTitle('')
        setNewDesc('')
        setSelected(d.case)
        fetchDetail(d.case.id)
      })
  }

  const handleCloseCase = () => {
    if (!selected) return
    fetch('/api/admin/cases/' + selected.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'closed' }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.case) {
          setSelected(d.case)
          setCases((prev) => prev.map((c) => (c.id === d.case.id ? d.case : c)))
          fetchDetail(d.case.id)
        }
      })
  }

  const handleRemoveCluster = (clusterId: string) => {
    if (!selected || !selectedDetail) return
    const newIds = selectedDetail.case.cluster_ids.filter((id) => id !== clusterId)
    fetch('/api/admin/cases/' + selected.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cluster_ids: newIds }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.case) {
          setSelected(d.case)
          setCases((prev) => prev.map((c) => (c.id === d.case.id ? d.case : c)))
          fetchDetail(d.case.id)
        }
      })
  }

  const handleLinkCluster = () => {
    if (!selected || !selectedDetail || !linkInput.trim()) return
    const newIds = [...selectedDetail.case.cluster_ids, linkInput.trim()]
    fetch('/api/admin/cases/' + selected.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cluster_ids: newIds }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.case) {
          setSelected(d.case)
          setCases((prev) => prev.map((c) => (c.id === d.case.id ? d.case : c)))
          fetchDetail(d.case.id)
          setLinkInput('')
        }
      })
  }

  const statusPill = (status: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
      open: { bg: 'rgba(63,185,80,0.1)', color: '#3fb950' },
      closed: { bg: 'rgba(139,148,158,0.1)', color: '#8b949e' },
      archived: { bg: 'rgba(72,79,88,0.1)', color: '#484f58' },
    }
    const s = styles[status] ?? styles.open
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 7px',
          borderRadius: 3,
          background: s.bg,
          color: s.color,
          textTransform: 'capitalize',
        }}
      >
        {status}
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 84px)' }}>
      {/* Left — Case list */}
      <div
        style={{
          width: '40%',
          minWidth: 280,
          maxWidth: 420,
          flexShrink: 0,
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>Case files</span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              height: 28,
              padding: '0 10px',
              background: 'rgba(88,166,255,0.08)',
              border: '1px solid rgba(88,166,255,0.2)',
              color: '#58a6ff',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'system-ui',
            }}
          >
            New case +
          </button>
        </div>

        {/* Create form */}
        {creating && (
          <div
            style={{
              background: 'rgba(88,166,255,0.04)',
              border: '1px solid rgba(88,166,255,0.2)',
              borderRadius: 6,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Case title"
              style={{
                width: '100%',
                background: '#0d1117',
                border: '1px solid #21262d',
                color: '#e6edf3',
                borderRadius: 5,
                padding: '8px 10px',
                fontSize: 13,
                fontFamily: 'system-ui',
                marginBottom: 8,
                boxSizing: 'border-box',
              }}
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              style={{
                width: '100%',
                background: '#0d1117',
                border: '1px solid #21262d',
                color: '#e6edf3',
                borderRadius: 5,
                padding: '8px 10px',
                fontSize: 13,
                fontFamily: 'system-ui',
                minHeight: 60,
                resize: 'vertical',
                marginBottom: 8,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleCreate}
                style={{
                  height: 30,
                  padding: '0 14px',
                  background: 'rgba(88,166,255,0.1)',
                  border: '1px solid rgba(88,166,255,0.25)',
                  color: '#58a6ff',
                  borderRadius: 5,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false)
                  setNewTitle('')
                  setNewDesc('')
                }}
                style={{
                  height: 30,
                  padding: '0 14px',
                  background: 'transparent',
                  border: '1px solid #21262d',
                  color: '#8b949e',
                  borderRadius: 5,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ color: '#484f58', fontSize: 13, textAlign: 'center', padding: 40 }}>
            Loading cases...
          </div>
        )}

        {/* Empty state */}
        {!loading && cases.length === 0 && !creating && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 4 }}>No case files yet</div>
            <div style={{ fontSize: 12, color: '#484f58' }}>
              Create a case to group related incidents
            </div>
          </div>
        )}

        {/* Case list */}
        {cases.map((c) => (
          <div
            key={c.id}
            onClick={() => handleSelect(c)}
            style={{
              background: selected?.id === c.id ? 'rgba(88,166,255,0.06)' : '#161b22',
              border:
                '1px solid ' +
                (selected?.id === c.id ? 'rgba(88,166,255,0.25)' : '#21262d'),
              borderRadius: 6,
              padding: 12,
              marginBottom: 6,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: '#e6edf3' }}>{c.title}</div>
            {c.description && (
              <div
                style={{
                  fontSize: 11,
                  color: '#484f58',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.description}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 6,
              }}
            >
              {statusPill(c.status)}
              <span style={{ fontSize: 11, color: '#484f58' }}>
                {(c.cluster_ids?.length ?? 0) + ' incidents'}
              </span>
              <span style={{ fontSize: 11, color: '#484f58' }}>{timeAgo(c.created_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Right — Case detail */}
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {!selected && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#484f58',
              fontSize: 13,
            }}
          >
            Select a case or create one
          </div>
        )}

        {selected && selectedDetail && (
          <div>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#e6edf3' }}>
                {selectedDetail.case.title}
              </div>
              {selectedDetail.case.description && (
                <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>
                  {selectedDetail.case.description}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {statusPill(selectedDetail.case.status)}
                <span style={{ fontSize: 12, color: '#484f58' }}>
                  Created {timeAgo(selectedDetail.case.created_at)}
                </span>
              </div>

              {/* Actions */}
              {selectedDetail.case.status === 'open' && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={handleCloseCase}
                    style={{
                      height: 28,
                      padding: '0 10px',
                      border: '1px solid #21262d',
                      color: '#8b949e',
                      background: 'transparent',
                      borderRadius: 4,
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'system-ui',
                    }}
                  >
                    Close case
                  </button>
                </div>
              )}
            </div>

            {/* Linked incidents */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>
                Linked incidents ({selectedDetail.clusters.length})
              </div>

              {selectedDetail.clusters.map((cluster) => (
                <div
                  key={cluster.id}
                  style={{
                    background: '#161b22',
                    border: '1px solid #21262d',
                    borderRadius: 5,
                    padding: '10px 12px',
                    marginBottom: 5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: '#e6edf3' }}>
                      {cluster.location_name ?? 'Unknown location'}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: 3,
                        fontSize: 11,
                        color: '#484f58',
                      }}
                    >
                      <span style={{ color: confColour(cluster.confidence_score) }}>
                        {cluster.confidence_score}%
                      </span>
                      <span>{cluster.report_count} reports</span>
                      <span>{timeAgo(cluster.created_at)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: 3,
                        background:
                          cluster.status === 'confirmed' || cluster.status === 'auto_confirmed'
                            ? 'rgba(63,185,80,0.1)'
                            : 'rgba(210,153,34,0.1)',
                        color:
                          cluster.status === 'confirmed' || cluster.status === 'auto_confirmed'
                            ? '#3fb950'
                            : '#d29922',
                        textTransform: 'capitalize',
                      }}
                    >
                      {cluster.status.replace('_', ' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCluster(cluster.id)}
                      style={{
                        color: '#484f58',
                        cursor: 'pointer',
                        fontSize: 14,
                        background: 'none',
                        border: 'none',
                        padding: '0 4px',
                        fontFamily: 'system-ui',
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {selectedDetail.clusters.length === 0 && (
                <div style={{ fontSize: 12, color: '#484f58', padding: '8px 0' }}>
                  No incidents linked yet
                </div>
              )}
            </div>

            {/* Add incident */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="Paste cluster ID to link incident"
                style={{
                  flex: 1,
                  background: '#0d1117',
                  border: '1px solid #21262d',
                  color: '#e6edf3',
                  borderRadius: 5,
                  padding: '0 10px',
                  fontSize: 12,
                  height: 32,
                  fontFamily: 'system-ui',
                }}
              />
              <button
                type="button"
                onClick={handleLinkCluster}
                style={{
                  height: 32,
                  padding: '0 12px',
                  background: 'rgba(88,166,255,0.08)',
                  border: '1px solid rgba(88,166,255,0.2)',
                  color: '#58a6ff',
                  borderRadius: 5,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                }}
              >
                Link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
