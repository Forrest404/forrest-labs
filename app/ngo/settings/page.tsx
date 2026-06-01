'use client'

import { useEffect, useState, useCallback } from 'react'

const ORG_TYPES = [
  { value: 'ingo', label: 'International NGO' },
  { value: 'lngo', label: 'Local NGO' },
  { value: 'un_agency', label: 'UN agency' },
  { value: 'crescent_cross', label: 'Red Cross / Red Crescent' },
  { value: 'community', label: 'Community group' },
  { value: 'other', label: 'Other' },
]
const LANGS = [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية (Arabic)' }, { value: 'fr', label: 'Français' }]

type Role = 'org_admin' | 'team_leader' | 'field_coordinator'

interface Org {
  name: string; type: string; country: string | null; status: string
  checkin_window_minutes: number; share_team_presence: boolean; share_operational_area: boolean
  has_operational_area: boolean
  panic_ack_visible_default: boolean; panic_escalation_minutes: number
  location_retention_hours: number
  alert_new_incident: boolean; alert_missed_checkin: boolean; alert_panic: boolean; alert_low_ack: boolean
}
interface Account {
  full_name: string; email: string; phone: string | null; role: Role
  language: string | null; notif_push: boolean; notif_sms: boolean
  quiet_start: number | null; quiet_end: number | null; off_duty: boolean
  has_password: boolean; has_pin: boolean; totp_enabled: boolean
}
interface Providers { push: boolean; sms: boolean; email: boolean }

type TabId = 'account' | 'safety' | 'data' | 'org' | 'people' | 'notif' | 'integrations'
const TABS: { id: TabId; label: string; roles: Role[] }[] = [
  { id: 'account', label: 'My account', roles: ['org_admin', 'team_leader', 'field_coordinator'] },
  { id: 'safety', label: 'Safety', roles: ['org_admin', 'team_leader'] },
  { id: 'data', label: 'Data & privacy', roles: ['org_admin'] },
  { id: 'org', label: 'Organisation', roles: ['org_admin'] },
  { id: 'people', label: 'People & roles', roles: ['org_admin', 'team_leader'] },
  { id: 'notif', label: 'Notifications', roles: ['org_admin'] },
  { id: 'integrations', label: 'Integrations', roles: ['org_admin'] },
]

function minToTime(m: number | null): string { if (m == null) return ''; const h = Math.floor(m / 60); const mm = m % 60; return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }
function timeToMin(s: string): number | null { if (!s) return null; const [h, m] = s.split(':').map(Number); if (isNaN(h) || isNaN(m)) return null; return h * 60 + m }

export default function NgoSettingsPage() {
  const [role, setRole] = useState<Role | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [providers, setProviders] = useState<Providers | null>(null)
  const [tab, setTab] = useState<TabId>('account')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<{ entries: any[]; failed_critical: number; available: boolean } | null>(null)

  const isAdmin = role === 'org_admin'

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const cr = await fetch('/api/ngo/auth/check', { cache: 'no-store' })
      const r: Role | null = cr.ok ? (await cr.json()).role ?? null : null
      setRole(r)
      const me = await fetch('/api/ngo/me', { cache: 'no-store' })
      if (me.ok) setAccount((await me.json()).account)
      // Org settings only matter for managers; field coords skip it.
      if (r === 'org_admin' || r === 'team_leader') {
        const or = await fetch('/api/ngo/org', { cache: 'no-store' })
        if (or.ok) { const d = await or.json(); setOrg(d.org); setProviders(d.providers ?? null) }
      }
    } catch { setError('Could not load settings.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const setO = <K extends keyof Org>(k: K, v: Org[K]) => setOrg((o) => (o ? { ...o, [k]: v } : o))
  const setA = <K extends keyof Account>(k: K, v: Account[K]) => setAccount((a) => (a ? { ...a, [k]: v } : a))

  // Load the delivery log when the Integrations tab opens (org_admin).
  useEffect(() => {
    if (tab !== 'integrations' || !isAdmin) return
    fetch('/api/ngo/notify/log', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setLog(d)).catch(() => {})
  }, [tab, isAdmin])

  const visibleTabs = TABS.filter((t) => role && t.roles.includes(role))
  // Keep the active tab valid for the role.
  useEffect(() => { if (role && !visibleTabs.some((t) => t.id === tab)) setTab('account') }, [role]) // eslint-disable-line

  async function patchOrg(payload: Record<string, unknown>, okMsg: string) {
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/org', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setMsg(okMsg); else setError(d.error ?? 'Could not save.')
    } catch { setError('Could not save. Please try again.') }
    finally { setBusy(false) }
  }

  async function saveAccount() {
    if (!account) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: account.full_name, phone: account.phone, language: account.language, notif_push: account.notif_push, notif_sms: account.notif_sms, quiet_start: account.quiet_start, quiet_end: account.quiet_end, off_duty: account.off_duty }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setMsg('Account saved.'); try { if (account.language) localStorage.setItem('fl_lang', account.language) } catch {} }
      else setError(d.error ?? 'Could not save.')
    } catch { setError('Could not save. Please try again.') }
    finally { setBusy(false) }
  }

  async function purgeNow() {
    if (!window.confirm('Permanently delete this organisation’s location data older than the retention window now? This cannot be undone. Active panic alerts are kept.')) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const res = await fetch('/api/ngo/org/purge', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setMsg(`Purged: ${d.check_ins_deleted} check-ins, ${d.panics_deleted} resolved panics, ${d.roll_calls_deleted} roll calls, ${d.team_positions_cleared} stale team positions cleared.`)
      else setError(d.error ?? 'Purge failed.')
    } catch { setError('Purge failed.') }
    finally { setBusy(false) }
  }

  async function logoutEverywhere() {
    if (!window.confirm('Sign out of NOUR on every device, including this one? You’ll need to sign in again.')) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/ngo/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout_all' }) })
      if (res.ok) { window.location.replace('/ngo/login') }
      else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Could not sign out.') }
    } catch { setError('Could not sign out.') }
    finally { setBusy(false) }
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Settings</h1>
      <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2, marginBottom: 18 }}>Manage your account{isAdmin ? ', organisation, safety and data' : role === 'team_leader' ? ' and safety configuration' : ''}.</div>

      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>}
      {error && !loading && <div style={errorBox}>{error} <button type="button" onClick={load} style={retryBtn}>Retry</button></div>}
      {msg && <div style={okBox}>{msg}</div>}

      {!loading && role && (
        <>
          {/* Tabs (role-filtered) */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            {visibleTabs.map((t) => (
              <button key={t.id} type="button" onClick={() => { setTab(t.id); setMsg(null); setError(null) }} style={tabBtn(tab === t.id)}>{t.label}</button>
            ))}
          </div>

          {/* MY ACCOUNT */}
          {tab === 'account' && account && (
            <div style={col}>
              <Section title="Profile">
                <Field label="Full name"><input style={field} value={account.full_name ?? ''} onChange={(e) => setA('full_name', e.target.value)} /></Field>
                <Field label="Email" hint="Contact your org admin to change your email."><input style={{ ...field, opacity: 0.7 }} value={account.email} disabled /></Field>
                <Field label="Phone"><input style={field} value={account.phone ?? ''} onChange={(e) => setA('phone', e.target.value)} /></Field>
                <Field label="Language">
                  <select style={field} value={account.language ?? ''} onChange={(e) => setA('language', e.target.value || null)}>
                    <option value="">System default</option>
                    {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </Field>
              </Section>

              <Section title="Availability">
                <Toggle label="Off duty" checked={account.off_duty} onChange={(v) => setA('off_duty', v)} />
                <div style={{ fontSize: 11, color: '#484f58', marginTop: -4 }}>
                  When off duty you won’t get dispatches, broadcasts or other alerts, and you won’t be flagged for missed check-ins. <b style={{ color: '#d29922' }}>Panic and roll-call still reach you.</b>
                </div>
              </Section>

              <Section title="Notifications to me">
                <div style={{ fontSize: 11, color: '#d29922', marginBottom: 8 }}>Panic, roll-call and missed-check-in alerts always reach you — these preferences apply only to non-urgent notices.</div>
                <Toggle label="Push notifications" checked={account.notif_push} onChange={(v) => setA('notif_push', v)} />
                <Toggle label="SMS notifications" checked={account.notif_sms} onChange={(v) => setA('notif_sms', v)} />
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <Field label="Quiet hours from"><input type="time" style={field} value={minToTime(account.quiet_start)} onChange={(e) => setA('quiet_start', timeToMin(e.target.value))} /></Field>
                  <Field label="to"><input type="time" style={field} value={minToTime(account.quiet_end)} onChange={(e) => setA('quiet_end', timeToMin(e.target.value))} /></Field>
                </div>
                <div style={{ fontSize: 11, color: '#484f58' }}>Quiet hours mute non-urgent SMS only (evaluated in UTC). Leave blank for none.</div>
                <div style={{ height: 1, background: '#21262d' }} />
                <div style={{ fontSize: 12, color: '#8b949e' }}>Which non-urgent events reach me, and how:</div>
                <EventPrefs scope="user" />
              </Section>

              <button type="button" onClick={saveAccount} disabled={busy || !account.full_name?.trim()} style={{ ...primaryBtn, opacity: busy || !account.full_name?.trim() ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save account'}</button>

              <Section title="Security">
                <ChangeCredential isPin={account.role === 'field_coordinator'} onMsg={setMsg} onErr={setError} />
                {account.role !== 'field_coordinator' && (
                  <div style={{ fontSize: 13, marginTop: 12 }}>
                    Two-factor authentication: {account.totp_enabled ? <span style={{ color: '#3fb950' }}>on</span> : <span style={{ color: '#d29922' }}>off</span>}
                    {' · '}<a href="/ngo/security" style={link}>Manage 2FA →</a>
                  </div>
                )}
                <div style={{ marginTop: 14 }}>
                  <button type="button" onClick={logoutEverywhere} disabled={busy} style={dangerBtn}>Log out of all devices</button>
                  <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>Signs you out everywhere, including this device — useful for a lost or shared phone. (Individual devices can’t be listed — sessions are anonymous.)</div>
                </div>
              </Section>

              <Section title="Privacy & data">
                <div style={{ fontSize: 13, display: 'grid', gap: 8 }}>
                  <a href="/ngo/privacy" style={link}>How NOUR handles your data (summary) →</a>
                  <a href="/ngo/privacy/policy" style={link}>Privacy Policy (full legal version) →</a>
                </div>
              </Section>
            </div>
          )}

          {/* SAFETY (org_admin + team_leader) */}
          {tab === 'safety' && org && (
            <div style={col}>
              <div style={{ fontSize: 12, color: '#8b949e' }}>These directly affect whether the safety system catches someone in trouble.</div>
              <Field label="Check-in window (minutes)" hint="Field staff are escalated if they miss this proof-of-life window."><input style={field} type="number" min={15} max={10080} value={org.checkin_window_minutes} onChange={(e) => setO('checkin_window_minutes', Number(e.target.value))} /></Field>
              <Field label="Panic escalation window (minutes)" hint="If no responder acknowledges a panic within this time, it re-alerts up the chain (and again at 2×)."><input style={field} type="number" min={1} max={1440} value={org.panic_escalation_minutes} onChange={(e) => setO('panic_escalation_minutes', Number(e.target.value))} /></Field>
              <Toggle label="Show field staff when a panic is acknowledged" checked={org.panic_ack_visible_default} onChange={(v) => setO('panic_ack_visible_default', v)} />
              <div style={{ fontSize: 11, color: '#484f58', marginTop: -8 }}>Silent-mode alerts always suppress this, regardless of the setting.</div>
              <button type="button" onClick={() => patchOrg({ checkin_window_minutes: org.checkin_window_minutes, panic_escalation_minutes: org.panic_escalation_minutes, panic_ack_visible_default: org.panic_ack_visible_default }, 'Safety settings saved.')} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Save safety settings'}</button>
            </div>
          )}

          {/* DATA & PRIVACY (org_admin) */}
          {tab === 'data' && org && isAdmin && (
            <div style={col}>
              <Section title="Location retention">
                <Field label="Keep location data for (hours)" hint="Check-ins, GPS, resolved panics and roll-calls older than this are permanently deleted automatically. Lower = a breach or seized device exposes less. Active panics are never auto-deleted."><input style={field} type="number" min={1} max={720} value={org.location_retention_hours} onChange={(e) => setO('location_retention_hours', Number(e.target.value))} /></Field>
                <button type="button" onClick={() => patchOrg({ location_retention_hours: org.location_retention_hours }, 'Retention saved.')} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Save retention'}</button>
                <button type="button" onClick={purgeNow} disabled={busy} style={{ ...dangerBtn, marginTop: 10 }}>Purge old location data now</button>
                <div style={{ fontSize: 11, color: '#484f58', marginTop: 6 }}>Permanent and immediate. Asks for confirmation.</div>
              </Section>
              <Section title="Data sharing (off by default)">
                <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>Aid-worker location is sensitive. When on, NOUR shares only team <b>type</b> and a <b>rough area</b> with other orgs — never names, never precise pins. (Not active yet.)</div>
                <Toggle label="Share team presence with other orgs" checked={org.share_team_presence} onChange={(v) => setO('share_team_presence', v)} />
                <Toggle label="Share operational area with other orgs" checked={org.share_operational_area} onChange={(v) => setO('share_operational_area', v)} />
                <button type="button" onClick={() => patchOrg({ share_team_presence: org.share_team_presence, share_operational_area: org.share_operational_area }, 'Sharing settings saved.')} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : 'Save sharing'}</button>
              </Section>
              <div style={{ fontSize: 13 }}><a href="/ngo/privacy" style={link}>How NOUR handles your data →</a></div>
            </div>
          )}

          {/* ORGANISATION (org_admin) */}
          {tab === 'org' && org && isAdmin && (
            <div style={col}>
              <Field label="Organisation name"><input style={field} value={org.name} onChange={(e) => setO('name', e.target.value)} /></Field>
              <Field label="Type"><select style={field} value={org.type} onChange={(e) => setO('type', e.target.value)}>{ORG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
              <Field label="Country"><input style={field} value={org.country ?? ''} onChange={(e) => setO('country', e.target.value)} /></Field>
              <button type="button" onClick={() => patchOrg({ name: org.name, type: org.type, country: org.country }, 'Organisation saved.')} disabled={busy || !org.name.trim()} style={{ ...primaryBtn, opacity: busy || !org.name.trim() ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save organisation'}</button>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Operational area: {org.has_operational_area ? <span style={{ color: '#3fb950' }}>defined</span> : <span style={{ color: '#8b949e' }}>not set</span>}
                {' · '}<a href="/ngo/setup" style={link}>Edit on map →</a>
              </div>
            </div>
          )}

          {/* PEOPLE & ROLES (links — one home each) */}
          {tab === 'people' && (
            <div style={col}>
              <div style={{ fontSize: 13, color: '#8b949e' }}>People management lives on its own pages — this keeps one home for each thing.</div>
              {isAdmin && <LinkCard href="/ngo/users" title="Users & roles" desc="Invite members, assign/change roles, suspend or remove accounts, sign out devices." />}
              <LinkCard href="/ngo/teams" title="Teams & roster" desc={isAdmin ? 'Create teams and manage members.' : 'View and manage your teams’ rosters.'} />
            </div>
          )}

          {/* NOTIFICATIONS — org defaults (org_admin) */}
          {tab === 'notif' && isAdmin && (
            <div style={col}>
              <div style={{ fontSize: 12, color: '#8b949e' }}>Default routing for non-urgent events org-wide. Each person’s own preferences (My account) override these. Changes save as you toggle.</div>
              <Section title="Event defaults">
                <EventPrefs scope="org" />
              </Section>
              <div style={{ fontSize: 11, color: '#d29922' }}>
                Safety-critical alerts — <b>panic, roll call, missed check-in, and dispatch</b> — are always delivered to the responder chain by push and SMS. They can’t be turned off here or by personal preferences.
              </div>
            </div>
          )}

          {/* INTEGRATIONS (org_admin) */}
          {tab === 'integrations' && isAdmin && (
            <div style={col}>
              <LinkCard href="/ngo/chat" title="External chat groups" desc="Manage links to your Signal / WhatsApp / Telegram groups." />
              <Section title="Delivery providers">
                <ProviderRow label="Push (in-app / ntfy)" ok={providers?.push} />
                <ProviderRow label="SMS" ok={providers?.sms} note={providers?.sms ? undefined : 'Not configured — SMS alerts are logged only.'} />
                <ProviderRow label="Email" ok={providers?.email} note={providers?.email ? undefined : 'Not configured — invites/resets won’t send.'} />
              </Section>
              <Section title="Delivery log">
                <div style={{ fontSize: 12, color: '#8b949e' }}>Recent notification sends — so a failed alert is visible. No message contents are stored.</div>
                {log && log.failed_critical > 0 && <div style={{ ...errorBox, marginBottom: 0 }}>{log.failed_critical} urgent alert(s) failed to send. Check your SMS/push provider.</div>}
                {!log && <div style={{ fontSize: 12, color: '#8b949e' }}>Loading…</div>}
                {log && log.entries.length === 0 && <div style={{ fontSize: 12, color: '#484f58' }}>No sends logged yet.</div>}
                {log && log.entries.length > 0 && (
                  <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                    {log.entries.slice(0, 60).map((e) => {
                      const failed = e.status === 'failed'
                      const colour = failed ? '#f85149' : e.status === 'sent' ? '#3fb950' : '#8b949e'
                      return (
                        <div key={e.id} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center', borderBottom: '1px solid #21262d', padding: '4px 0' }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: colour, flexShrink: 0 }} />
                          <span style={{ color: '#c9d1d9', minWidth: 110 }}>{e.event_type}</span>
                          <span style={{ color: '#8b949e', minWidth: 56 }}>{e.urgency}</span>
                          <span style={{ color: '#8b949e', minWidth: 44 }}>{e.channel}</span>
                          <span style={{ color: colour, minWidth: 64 }}>{e.status}</span>
                          <span style={{ color: '#484f58', marginLeft: 'auto' }}>{new Date(e.created_at).toLocaleString()}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>
              <div style={{ fontSize: 12, color: '#484f58' }}>API access for large agencies: planned — not available yet.</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ChangeCredential({ isPin, onMsg, onErr }: { isPin: boolean; onMsg: (m: string) => void; onErr: (e: string) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); onErr('');
    try {
      const body: Record<string, string> = { current }
      if (isPin) body.new_pin = next; else body.new_password = next
      const res = await fetch('/api/ngo/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { onMsg(isPin ? 'PIN changed.' : 'Password changed.'); setCurrent(''); setNext('') }
      else onErr(d.error ?? 'Could not change credential.')
    } catch { onErr('Could not change credential.') }
    finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label={isPin ? 'Current PIN' : 'Current password'}><input type="password" style={field} value={current} onChange={(e) => setCurrent(e.target.value)} inputMode={isPin ? 'numeric' : undefined} /></Field>
      <Field label={isPin ? 'New 6-digit PIN' : 'New password (min 8)'}><input type="password" style={field} value={next} onChange={(e) => setNext(e.target.value)} inputMode={isPin ? 'numeric' : undefined} /></Field>
      <button type="button" onClick={submit} disabled={busy || !next} style={{ ...primaryBtn, opacity: busy || !next ? 0.6 : 1 }}>{busy ? '…' : isPin ? 'Change PIN' : 'Change password'}</button>
    </div>
  )
}

const EVENT_LABEL: Record<string, string> = { new_incident: 'New incident in area', broadcast: 'Broadcast', report_ready: 'Report ready' }

// Per-event channel preferences for the tunable NORMAL/LOW events. scope='user' edits the
// signed-in user's prefs; scope='org' (org_admin) edits org defaults. Saves on each toggle.
function EventPrefs({ scope }: { scope: 'user' | 'org' }) {
  const [data, setData] = useState<{ events: string[]; user: any; org?: any } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/ngo/notify/prefs', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => setErr('Could not load preferences.'))
  }, [])
  const rows = scope === 'org' ? data?.org : data?.user
  const set = async (event: string, patch: Record<string, boolean>) => {
    if (!data) return
    const cur = (scope === 'org' ? data.org : data.user)[event]
    const next = { ...cur, ...patch }
    setData({ ...data, ...(scope === 'org' ? { org: { ...data.org, [event]: next } } : { user: { ...data.user, [event]: next } }) })
    await fetch('/api/ngo/notify/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, event, ...next }) }).catch(() => setErr('Could not save.'))
  }
  if (err) return <div style={{ fontSize: 12, color: '#f85149' }}>{err}</div>
  if (!data || !rows) return <div style={{ fontSize: 12, color: '#8b949e' }}>Loading…</div>
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {data.events.map((e) => {
        const v = rows[e]
        return (
          <div key={e} style={{ borderTop: '1px solid #21262d', paddingTop: 8 }}>
            <div style={{ fontSize: 13, color: '#e6edf3', marginBottom: 4 }}>{EVENT_LABEL[e] ?? e}</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#8b949e' }}>
              {scope === 'org' && <Mini label="enabled" checked={v.enabled} onChange={(c) => set(e, { enabled: c })} />}
              <Mini label="push" checked={v.push} onChange={(c) => set(e, { push: c })} />
              <Mini label="SMS" checked={v.sms} onChange={(c) => set(e, { sms: c })} />
              <Mini label="email" checked={v.email} onChange={(c) => set(e, { email: c })} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
function Mini({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>
}

function ProviderRow({ label, ok, note }: { label: string; ok?: boolean; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '4px 0' }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, background: ok ? '#3fb950' : '#8b949e', flexShrink: 0 }} />
      <span style={{ color: '#e6edf3' }}>{label}</span>
      <span style={{ color: ok ? '#3fb950' : '#8b949e' }}>{ok ? 'configured' : 'not configured'}</span>
      {note && <span style={{ color: '#484f58', fontSize: 11 }}>· {note}</span>}
    </div>
  )
}

function LinkCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} style={{ display: 'block', background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 14, textDecoration: 'none' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>{title} →</div>
      <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3 }}>{desc}</div>
    </a>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  )
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#484f58', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#e6edf3', cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
      {label}
    </label>
  )
}

const wrap: React.CSSProperties = { padding: 24, maxWidth: 720, margin: '0 auto', color: '#e6edf3', fontFamily: 'system-ui, sans-serif' }
const col: React.CSSProperties = { display: 'grid', gap: 16, maxWidth: 480 }
const field: React.CSSProperties = { width: '100%', height: 44, padding: '0 12px', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 16, fontFamily: 'system-ui', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block' }
const link: React.CSSProperties = { color: '#58a6ff', textDecoration: 'none' }
const primaryBtn: React.CSSProperties = { minHeight: 44, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', justifySelf: 'start' }
const dangerBtn: React.CSSProperties = { minHeight: 40, padding: '0 16px', background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', justifySelf: 'start' }
const errorBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const okBox: React.CSSProperties = { background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', borderRadius: 6, padding: '9px 12px', fontSize: 13, marginBottom: 14 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'none', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', borderRadius: 4, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }
function tabBtn(active: boolean): React.CSSProperties {
  return { minHeight: 36, padding: '0 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', background: active ? 'rgba(88,166,255,0.15)' : '#161b22', border: active ? '1px solid #58a6ff' : '1px solid #21262d', color: active ? '#58a6ff' : '#8b949e' }
}
