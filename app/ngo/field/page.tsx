'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// Mobile field view for field coordinators. Three two-tap actions — CHECK IN,
// PANIC, STATUS — plus a roll-call prompt. Works offline: actions queue in
// IndexedDB and flush when connectivity returns. No map / heavy deps (keep light).

// ── tiny IndexedDB queue (no external lib) ─────────────────────────────────
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('nour-field', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('queue', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function qAdd(item: any) {
  const db = await openDb()
  await new Promise((res, rej) => { const t = db.transaction('queue', 'readwrite'); t.objectStore('queue').put(item); t.oncomplete = () => res(null); t.onerror = () => rej(t.error) })
}
async function qAll(): Promise<any[]> {
  const db = await openDb()
  return new Promise((res) => { const r = db.transaction('queue', 'readonly').objectStore('queue').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]) })
}
async function qDel(id: string) {
  const db = await openDb()
  await new Promise((res) => { const t = db.transaction('queue', 'readwrite'); t.objectStore('queue').delete(id); t.oncomplete = () => res(null); t.onerror = () => res(null) })
}

function getGps(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  })
}

interface FieldState {
  team: { id: string; name: string; type: string; status: string } | null
  last_check_in: string | null
  active_roll_call: { id: string; message: string | null; answered: boolean } | null
}

export default function NgoFieldPage() {
  const [online, setOnline] = useState(true)
  const [state, setState] = useState<FieldState | null>(null)
  const [queued, setQueued] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [manLat, setManLat] = useState('')
  const [manLon, setManLon] = useState('')
  const [holding, setHolding] = useState(false)
  const holdTimer = useRef<any>(null)
  const [dispatch, setDispatch] = useState<any>(null)
  const [report, setReport] = useState({ people: '', services: '', hazards: '' })
  const [reportSent, setReportSent] = useState(false)
  const [editingReport, setEditingReport] = useState(false)
  const [refreshError, setRefreshError] = useState(false)

  // Send now, or queue if offline / on failure. Method defaults to POST.
  const send = useCallback(async (url: string, body: any, label: string, method = 'POST'): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (res.ok) return true
      } catch { /* fall through to queue */ }
    }
    const id = `${url}|${label}|${typeof performance !== 'undefined' ? performance.now() : ''}|${Math.round(Math.random() * 1e9)}`
    await qAdd({ id, url, body, label, method })
    refreshQueueCount()
    return false
  }, [])
  const sendPut = useCallback((url: string, body: any, label: string) => send(url, body, label, 'PUT'), [send])

  const refreshQueueCount = useCallback(() => { qAll().then((q) => setQueued(q.length)).catch(() => {}) }, [])

  const flushQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const items = await qAll()
    for (const it of items) {
      try {
        const res = await fetch(it.url, { method: it.method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it.body) })
        if (res.ok) await qDel(it.id)
      } catch { /* stays queued */ }
    }
    refreshQueueCount()
  }, [refreshQueueCount])

  const loadState = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/safety/field')
      if (r.ok) { setState(await r.json()); setRefreshError(false) }
      else setRefreshError(true)
    } catch { setRefreshError(true) /* offline — last state kept */ }
  }, [])

  const loadDispatch = useCallback(async () => {
    try {
      const r = await fetch('/api/ngo/dispatch/mine')
      if (r.ok) { const d = (await r.json()).dispatch; setDispatch(d); if (d?.has_report) setReportSent(true) }
    } catch { /* offline */ }
  }, [])

  // Boot: register SW, set online listeners, first load, polling.
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/ngo-sw.js', { scope: '/ngo/field' }).catch(() => {})
    const setOn = () => { setOnline(true); flushQueue(); loadState(); loadDispatch() }
    const setOff = () => setOnline(false)
    const onVisible = () => { if (document.visibilityState === 'visible') { loadState(); loadDispatch(); flushQueue() } }
    setOnline(navigator.onLine)
    window.addEventListener('online', setOn)
    window.addEventListener('offline', setOff)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    refreshQueueCount(); flushQueue(); loadState(); loadDispatch()
    // 5s — the roll-call "tap if safe" prompt must surface fast.
    const id = setInterval(() => { loadState(); flushQueue(); loadDispatch() }, 5000)
    return () => {
      window.removeEventListener('online', setOn); window.removeEventListener('offline', setOff)
      window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [flushQueue, loadState, loadDispatch, refreshQueueCount])

  async function resolveCoords(): Promise<{ lat: number | null; lon: number | null }> {
    if (manual) {
      const lat = parseFloat(manLat), lon = parseFloat(manLon)
      return { lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null }
    }
    const g = await getGps()
    return { lat: g?.lat ?? null, lon: g?.lon ?? null }
  }

  async function doCheckIn() {
    setMsg('Getting location…')
    const { lat, lon } = await resolveCoords()
    const sent = await send('/api/ngo/safety/check-in', { lat, lon }, 'check-in')
    setMsg(sent ? `Checked in ✓ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Queued — will send when online')
    loadState()
  }

  async function doPanic() {
    setMsg('Getting location…')
    const { lat, lon } = await resolveCoords()
    const sent = await send('/api/ngo/safety/panic', { lat, lon }, 'panic')
    setMsg(sent ? '🆘 Alert sent to your team' : 'Queued — alert will send when online')
  }

  async function setStatus(status: string) {
    const sent = await send('/api/ngo/safety/status', { status }, 'status')
    setMsg(sent ? `Status set: ${status}` : 'Queued — will send when online')
    loadState()
  }

  async function respondRollCall() {
    if (!state?.active_roll_call) return
    const sent = await send('/api/ngo/safety/roll-call/respond', { roll_call_id: state.active_roll_call.id }, 'roll-call')
    setMsg(sent ? "You're marked safe ✓" : 'Queued — response will send when online')
    loadState()
  }

  const NEXT_STATUS: Record<string, string> = { assigned: 'en_route', en_route: 'on_scene', on_scene: 'done' }
  const STATUS_TEXT: Record<string, string> = { assigned: 'Assigned', en_route: 'En route', on_scene: 'On scene', done: 'Done' }

  async function advanceDispatch() {
    if (!dispatch) return
    const next = NEXT_STATUS[dispatch.status]
    const sent = await send(`/api/ngo/dispatch/${dispatch.id}/advance`, {}, 'advance')
    setMsg(sent ? `Status: ${STATUS_TEXT[next] ?? next}` : 'Queued — will send when online')
    loadDispatch()
  }
  async function submitReport() {
    if (!dispatch) return
    // PUT updates the single report (creates it if none) so edits don't duplicate.
    const sent = await sendPut(`/api/ngo/dispatch/${dispatch.id}/report`, {
      people_assisted: report.people === '' ? null : Number(report.people),
      services: report.services || null,
      new_hazards: report.hazards || null,
    }, 'report')
    setReportSent(true); setEditingReport(false)
    setMsg(sent ? 'On-scene report saved' : 'Queued — report will send when online')
  }
  function startEditReport() {
    const r = dispatch?.report
    setReport({ people: r?.people_assisted != null ? String(r.people_assisted) : '', services: r?.services ?? '', hazards: r?.new_hazards ?? '' })
    setEditingReport(true)
  }

  // Panic press-and-hold (2s) to avoid misfire.
  const startHold = () => { setHolding(true); holdTimer.current = setTimeout(() => { setHolding(false); doPanic() }, 2000) }
  const cancelHold = () => { setHolding(false); if (holdTimer.current) clearTimeout(holdTimer.current) }

  const rc = state?.active_roll_call
  const showRc = rc && !rc.answered

  return (
    <div style={wrap}>
      <div style={topbar}>
        <div style={{ fontWeight: 600 }}>NOUR <span style={{ color: '#3fb950' }}>Field</span></div>
        <span style={{ ...chip, background: online ? 'rgba(63,185,80,0.15)' : 'rgba(210,153,34,0.15)', color: online ? '#3fb950' : '#d29922' }}>
          {online ? 'Online' : 'Offline'}{queued > 0 ? ` · ${queued} queued` : ''}
        </span>
      </div>
      {online && refreshError && (
        <div style={{ fontSize: 12, color: '#d29922', textAlign: 'center' }}>Couldn’t reach the server — retrying…</div>
      )}

      {state?.team && (
        <div style={{ fontSize: 13, color: '#8b949e', textAlign: 'center' }}>
          {state.team.name} · {state.team.type} · status: <span style={{ color: '#e6edf3' }}>{state.team.status}</span>
        </div>
      )}

      {/* Active dispatch */}
      {dispatch && (
        <div style={dispatchCard}>
          <div style={{ fontSize: 12, color: '#d29922', fontWeight: 600 }}>DISPATCH · {STATUS_TEXT[dispatch.status] ?? dispatch.status}</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{dispatch.hazard ? `${dispatch.hazard} — ` : ''}{dispatch.location_name ?? 'Incident'}</div>
          {dispatch.note && <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>{dispatch.note}</div>}
          {dispatch.map_link && <a href={dispatch.map_link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#58a6ff' }}>Open map ↗</a>}
          {NEXT_STATUS[dispatch.status] && (
            <button type="button" onClick={advanceDispatch} style={{ ...bigBtn, height: 64, fontSize: 18, background: '#1f6feb', borderColor: '#58a6ff', marginTop: 10 }}>
              ADVANCE TO {(STATUS_TEXT[NEXT_STATUS[dispatch.status]] ?? '').toUpperCase()}
            </button>
          )}
          {/* On-scene report (3 fields) — fileable/editable once on scene or done */}
          {['on_scene', 'done'].includes(dispatch.status) && (!reportSent || editingReport) && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#8b949e' }}>On-scene report</div>
              <input style={field} inputMode="numeric" placeholder="People assisted" value={report.people} onChange={(e) => setReport({ ...report, people: e.target.value })} />
              <input style={field} placeholder="Services delivered" value={report.services} onChange={(e) => setReport({ ...report, services: e.target.value })} />
              <input style={field} placeholder="New hazards" value={report.hazards} onChange={(e) => setReport({ ...report, hazards: e.target.value })} />
              <button type="button" onClick={submitReport} style={{ ...statusBtn(false), height: 44 }}>{editingReport ? 'Save changes' : 'Submit report'}</button>
            </div>
          )}
          {reportSent && !editingReport && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 12, color: '#3fb950' }}>On-scene report filed ✓</span>
              <button type="button" onClick={startEditReport} style={{ ...statusBtn(false), height: 30, flex: '0 0 auto', padding: '0 12px' }}>Edit</button>
            </div>
          )}
        </div>
      )}

      {/* Roll-call prompt */}
      {showRc && (
        <button type="button" onClick={respondRollCall} style={rollCallBtn}>
          🟢 ROLL CALL — TAP IF SAFE
          {rc?.message ? <div style={{ fontSize: 13, fontWeight: 400, marginTop: 6 }}>{rc.message}</div> : null}
        </button>
      )}
      {rc && rc.answered && <div style={{ textAlign: 'center', color: '#3fb950', fontSize: 14 }}>You're marked safe ✓</div>}

      {/* CHECK IN */}
      <button type="button" onClick={doCheckIn} style={{ ...bigBtn, background: '#238636', borderColor: '#2ea043' }}>
        CHECK IN
        <div style={bigSub}>I'm safe · share my location</div>
      </button>

      {/* PANIC (hold 2s) */}
      <button
        type="button"
        onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold}
        onTouchStart={startHold} onTouchEnd={cancelHold}
        style={{ ...bigBtn, background: holding ? '#b62324' : '#da3633', borderColor: '#f85149', height: 150 }}
      >
        {holding ? 'HOLD…' : 'PANIC'}
        <div style={bigSub}>{holding ? 'keep holding to send' : 'press and hold 2 seconds'}</div>
      </button>

      {/* STATUS */}
      <div>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>Set status</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['standby', 'deployed', 'unavailable'].map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} style={statusBtn(state?.team?.status === s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* GPS source toggle + manual entry */}
      <div style={{ fontSize: 12, color: '#8b949e' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          Enter location manually (no GPS)
        </label>
        {manual && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input style={field} inputMode="decimal" placeholder="lat" value={manLat} onChange={(e) => setManLat(e.target.value)} />
            <input style={field} inputMode="decimal" placeholder="lon" value={manLon} onChange={(e) => setManLon(e.target.value)} />
          </div>
        )}
      </div>

      {msg && <div style={msgBox}>{msg}</div>}
      {state?.last_check_in && <div style={{ fontSize: 12, color: '#484f58', textAlign: 'center' }}>Last check-in: {new Date(state.last_check_in).toLocaleString()}</div>}
    </div>
  )
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }
const topbar: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const chip: React.CSSProperties = { fontSize: 12, padding: '3px 8px', borderRadius: 999 }
const bigBtn: React.CSSProperties = { width: '100%', height: 120, border: '1px solid', borderRadius: 14, color: '#fff', fontSize: 26, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, userSelect: 'none' }
const bigSub: React.CSSProperties = { fontSize: 13, fontWeight: 400, opacity: 0.9 }
const rollCallBtn: React.CSSProperties = { width: '100%', padding: '18px', background: '#1f6feb', border: '1px solid #58a6ff', color: '#fff', borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'system-ui' }
function statusBtn(active: boolean): React.CSSProperties {
  return { flex: 1, height: 48, borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui', textTransform: 'capitalize', background: active ? 'rgba(88,166,255,0.15)' : '#161b22', border: active ? '1px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }
}
const field: React.CSSProperties = { flex: 1, height: 44, padding: '0 10px', boxSizing: 'border-box', background: '#161b22', border: '1px solid #21262d', borderRadius: 8, color: '#e6edf3', fontSize: 14, outline: 'none', fontFamily: 'system-ui' }
const msgBox: React.CSSProperties = { textAlign: 'center', fontSize: 14, color: '#e6edf3', background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: '10px 12px' }
const dispatchCard: React.CSSProperties = { background: '#161b22', border: '1px solid #d29922', borderRadius: 12, padding: 14 }
