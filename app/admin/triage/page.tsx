'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MediaViewer from '../components/MediaViewer'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { mapboxgl: any }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TriageCluster {
  id: string
  status: string
  confidence_score: number
  report_count: number
  centroid_lat: number
  centroid_lon: number
  location_name: string | null
  created_at: string
  display_radius_metres: number
  ai_reasoning: string | null
  ai_concerns: string[] | null
}

interface TriageReport {
  id: string
  created_at: string
  lat: number
  lon: number
  distance_band: string
  event_types: string[]
  media_url: string | null
  media_status: string | null
  session_hash: string
  status: string
}

interface LastAction {
  clusterId: string
  action: 'confirmed' | 'discarded'
  cluster: TriageCluster
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

function confColour(score: number): string {
  if (score >= 85) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

const DISTANCE_LABELS: Record<string, string> = {
  under_500m: 'Under 500m away',
  '500m_1km': '500m – 1km away',
  '1km_3km': '1 – 3km away',
  over_3km: 'Over 3km away',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TriagePage() {
  const router = useRouter()
  const [queue, setQueue] = useState<TriageCluster[]>([])
  const [current, setCurrent] = useState<TriageCluster | null>(null)
  const [currentReports, setCurrentReports] = useState<TriageReport[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [pressedButton, setPressedButton] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const miniMapRef = useRef<HTMLDivElement>(null)
  const miniMap = useRef<any>(null)
  const mapInitialized = useRef(false)

  // ── Load queue ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/incidents?filter=pending_review&limit=100')
        if (res.status === 401) { router.push('/admin/login'); return }
        const data = (await res.json()) as { clusters?: TriageCluster[] }
        const clusters = data.clusters ?? []
        setQueue(clusters)
        if (clusters.length > 0) {
          loadCluster(clusters[0])
        } else {
          setDone(true)
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function loadCluster(cluster: TriageCluster) {
    setCurrent(cluster)
    setCurrentReports([])
    try {
      const res = await fetch('/api/admin/incidents/' + cluster.id)
      const data = (await res.json()) as { reports?: TriageReport[] }
      setCurrentReports(data.reports ?? [])
    } catch { setCurrentReports([]) }
    setIsTransitioning(false)
    setProcessing(false)

    // Update mini map — flyTo if already initialized, or init
    if (miniMap.current && mapInitialized.current) {
      miniMap.current.flyTo({ center: [cluster.centroid_lon, cluster.centroid_lat], zoom: 14, duration: 600 })
      const src = miniMap.current.getSource('triage-dot')
      if (src) {
        src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [cluster.centroid_lon, cluster.centroid_lat] }, properties: {} }] })
      }
    }
  }

  // ── Mini map init — once ───────────────────────────────────────────────

  useEffect(() => {
    if (!current || mapInitialized.current) return

    function initMap() {
      if (!miniMapRef.current || !current || mapInitialized.current) return
      if (!window.mapboxgl) return

      window.mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      miniMap.current = new window.mapboxgl.Map({
        container: miniMapRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [current.centroid_lon, current.centroid_lat],
        zoom: 14,
        interactive: false,
        attributionControl: false,
      })
      mapInitialized.current = true

      miniMap.current.on('load', () => {
        miniMap.current.addSource('triage-dot', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [current.centroid_lon, current.centroid_lat] }, properties: {} }] },
        })
        miniMap.current.addLayer({ id: 'triage-circle', type: 'circle', source: 'triage-dot', paint: { 'circle-radius': 20, 'circle-color': '#f85149', 'circle-opacity': 0.2 } })
        miniMap.current.addLayer({ id: 'triage-dot-inner', type: 'circle', source: 'triage-dot', paint: { 'circle-radius': 5, 'circle-color': '#f85149' } })
      })
    }

    if (window.mapboxgl) {
      initMap()
    } else {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css'
      document.head.appendChild(link)

      const script = document.createElement('script')
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js'
      script.onload = () => initMap()
      document.head.appendChild(script)
    }

    return () => {
      if (miniMap.current) { miniMap.current.remove(); miniMap.current = null; mapInitialized.current = false }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  // ── Actions ────────────────────────────────────────────────────────────

  const nextCluster = useCallback((skipTransition?: boolean) => {
    const next = index + 1
    if (next >= queue.length) {
      setDone(true)
      return
    }
    setIndex(next)
    if (!skipTransition) setIsTransitioning(true)
    loadCluster(queue[next])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue])

  const flashButton = useCallback((btn: string) => {
    setPressedButton(btn)
    setTimeout(() => setPressedButton(null), 150)
  }, [])

  const showUndoToast = useCallback((clusterId: string, action: 'confirmed' | 'discarded', cluster: TriageCluster) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setLastAction({ clusterId, action, cluster })
    undoTimerRef.current = setTimeout(() => setLastAction(null), 5000)
  }, [])

  const handleApprove = useCallback(async () => {
    if (!current || processing) return
    setProcessing(true)
    flashButton('approve')
    await fetch('/api/admin/clusters/' + current.id + '/approve', { method: 'POST', credentials: 'include' })
    showUndoToast(current.id, 'confirmed', current)
    setIsTransitioning(true)
    nextCluster(true)
  }, [current, processing, nextCluster, flashButton, showUndoToast])

  const handleReject = useCallback(async () => {
    if (!current || processing) return
    setProcessing(true)
    flashButton('reject')
    await fetch('/api/admin/clusters/' + current.id + '/reject', { method: 'POST', credentials: 'include' })
    showUndoToast(current.id, 'discarded', current)
    setIsTransitioning(true)
    nextCluster(true)
  }, [current, processing, nextCluster, flashButton, showUndoToast])

  const handleSkip = useCallback(() => {
    if (processing) return
    flashButton('skip')
    setIsTransitioning(true)
    nextCluster()
  }, [processing, nextCluster, flashButton])

  const handleUndo = useCallback(async () => {
    if (!lastAction) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const endpoint = lastAction.action === 'confirmed' ? 'reject' : 'approve'
    await fetch('/api/admin/clusters/' + lastAction.clusterId + '/' + endpoint, { method: 'POST', credentials: 'include' })
    setLastAction(null)
  }, [lastAction])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return
      if (processing) return
      switch (e.key) {
        case 'a': case 'A': handleApprove(); break
        case 'r': case 'R': handleReject(); break
        case 's': case 'S': case 'ArrowRight': handleSkip(); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [processing, handleApprove, handleReject, handleSkip])

  // ── Cleanup undo timer ─────────────────────────────────────────────────

  useEffect(() => {
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }
  }, [])

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ fontSize: 14, color: '#484f58' }}>Loading triage queue...</span>
      </div>
    )
  }

  // ── Done / Empty state ─────────────────────────────────────────────────

  if (done || queue.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(63,185,80,0.1)', border: '2px solid rgba(63,185,80,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#3fb950" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#e6edf3', marginTop: 16 }}>Queue clear</div>
        <div style={{ fontSize: 14, color: '#8b949e', marginTop: 8 }}>
          {done && queue.length > 0 ? 'You reviewed all ' + queue.length + ' clusters' : 'No clusters pending review'}
        </div>
        <button type="button" onClick={() => router.push('/admin/incidents')} style={{ height: 40, padding: '0 20px', background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 13, marginTop: 20, cursor: 'pointer', fontFamily: 'system-ui' }}>
          Go to incidents →
        </button>
      </div>
    )
  }

  if (!current) return null

  // ── Main triage UI ─────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <style>{`
        @keyframes transition-bar { 0% { width: 0; } 100% { width: 100%; } }
      `}</style>

      {/* Progress bar */}
      <div style={{ height: 3, background: '#21262d', flexShrink: 0, position: 'relative' }}>
        <div style={{ height: '100%', background: '#3fb950', width: (index / queue.length) * 100 + '%', transition: 'width 0.3s' }} />
        {isTransitioning && (
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: '#58a6ff', animation: 'transition-bar 0.8s ease forwards' }} />
        )}
      </div>

      {/* Header */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>Triage queue</div>
        <div style={{ fontSize: 13, color: '#484f58' }}>#{index + 1} of {queue.length}</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { key: 'A', label: 'Confirm' },
            { key: 'R', label: 'Reject' },
            { key: 'S', label: 'Skip' },
            { key: '→', label: 'Skip' },
          ].map((hint) => (
            <div key={hint.key} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ background: '#21262d', border: '1px solid #30363d', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: '#8b949e', fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>{hint.key}</span>
              <span style={{ fontSize: 11, color: '#484f58' }}>{hint.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left column (55%) */}
        <div style={{ flex: 55, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid #21262d' }}>
          {/* Mini map */}
          <div style={{ position: 'relative', height: 280, flexShrink: 0 }}>
            <div ref={miniMapRef} style={{ position: 'absolute', inset: 0 }} />
            <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(13,17,23,0.8)', padding: '3px 7px', borderRadius: 3, fontSize: 10, fontFamily: 'monospace', color: '#8b949e', zIndex: 2 }}>
              {current.centroid_lat.toFixed(4)}, {current.centroid_lon.toFixed(4)}
            </div>
          </div>

          {/* Data section */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>
              {current.location_name ?? current.centroid_lat.toFixed(3) + ', ' + current.centroid_lon.toFixed(3)}
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: confColour(current.confidence_score) }}>{current.confidence_score}%</div>
                <div style={{ fontSize: 11, color: '#484f58', marginTop: 2 }}>confidence</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>{current.report_count}</div>
                <div style={{ fontSize: 11, color: '#484f58', marginTop: 2 }}>reports</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>{timeAgo(current.created_at)}</div>
                <div style={{ fontSize: 11, color: '#484f58', marginTop: 2 }}>submitted</div>
              </div>
            </div>

            {current.ai_reasoning && (
              <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.6, background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 12, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                {current.ai_reasoning}
              </div>
            )}

            {current.ai_concerns && current.ai_concerns.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {current.ai_concerns.map((c) => (
                  <span key={c} style={{ background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.2)', color: '#d29922', fontSize: 11, padding: '3px 8px', borderRadius: 20 }}>{c}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column (45%) */}
        <div style={{ flex: 45, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', marginBottom: 10 }}>Reports ({currentReports.length})</div>
            {currentReports.map((r) => (
              <div key={r.id} style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: '10px 12px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {r.event_types.map((et) => (
                      <span key={et} style={{ background: 'rgba(248,81,73,0.08)', color: '#f85149', fontSize: 10, padding: '2px 6px', borderRadius: 3 }}>{et.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: '#484f58', flexShrink: 0, marginLeft: 6 }}>{timeAgo(r.created_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 2 }}>{DISTANCE_LABELS[r.distance_band] ?? r.distance_band}</div>
                {r.media_url && (
                  <MediaViewer mediaUrl={r.media_url} mediaStatus={r.media_status ?? 'pending'} lat={r.lat} lon={r.lon} createdAt={r.created_at} />
                )}
              </div>
            ))}
          </div>

          {/* Action buttons (sticky) */}
          <div style={{ position: 'sticky', bottom: 0, background: 'rgba(13,17,23,0.97)', borderTop: '1px solid #21262d', padding: 16, display: 'flex', gap: 10, flexShrink: 0 }}>
            <button type="button" onClick={handleReject} disabled={processing} style={{
              flex: 1, height: 48,
              background: pressedButton === 'reject' ? 'rgba(248,81,73,0.25)' : 'rgba(248,81,73,0.08)',
              border: '1px solid rgba(248,81,73,0.3)', color: '#f85149',
              borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: processing ? 'default' : 'pointer', fontFamily: 'system-ui',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: processing ? 0.5 : 1, transition: 'background 0.15s',
            }}>
              [R] Reject
            </button>
            <button type="button" onClick={handleSkip} style={{
              width: 80, height: 48,
              background: pressedButton === 'skip' ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: '1px solid #21262d', color: '#484f58',
              borderRadius: 7, fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui',
              transition: 'background 0.15s',
            }}>
              [S]
            </button>
            <button type="button" onClick={handleApprove} disabled={processing} style={{
              flex: 1, height: 48,
              background: pressedButton === 'approve' ? 'rgba(63,185,80,0.25)' : 'rgba(63,185,80,0.1)',
              border: '1px solid rgba(63,185,80,0.35)', color: '#3fb950',
              borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: processing ? 'default' : 'pointer', fontFamily: 'system-ui',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: processing ? 0.5 : 1, transition: 'background 0.15s',
            }}>
              [A] Confirm
            </button>
          </div>
        </div>
      </div>

      {/* Undo toast */}
      {lastAction && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 100,
          background: '#161b22', border: '1px solid #21262d', borderRadius: 8,
          padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, color: '#e6edf3' }}>
            {lastAction.action === 'confirmed' ? 'Cluster confirmed' : 'Cluster rejected'}
          </span>
          <span onClick={handleUndo} style={{ fontSize: 13, color: '#58a6ff', cursor: 'pointer' }}>Undo</span>
        </div>
      )}
    </div>
  )
}
