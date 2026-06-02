'use client'

import { useEffect, useState } from 'react'

// Plain-language data-protection statement for NGO users (item 8). Linked from Settings.
// It states what the system ACTUALLY does — retention is read live from the org so the
// number here always matches the real purge window. Honest about the protection tier.

export default function NgoPrivacyPage() {
  const [retentionHours, setRetentionHours] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/ngo/org', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.org?.location_retention_hours != null) setRetentionHours(d.org.location_retention_hours) })
      .catch(() => {})
  }, [])

  const window = retentionHours == null ? 'your configured window'
    : retentionHours % 24 === 0 ? `${retentionHours / 24} day${retentionHours === 24 ? '' : 's'}`
    : `${retentionHours} hours`

  return (
    <div style={wrap}>
      <h1 style={h1}>How NOUR handles your data</h1>
      <p style={sub}>Plain language. This page describes what the system actually does today.</p>

      <Section title="What we store">
        <ul style={ul}>
          <li><b>Your people:</b> names, roles, phone numbers, and team membership you add.</li>
          <li><b>Locations:</b> a check-in GPS point when a worker taps “check in”, a worker’s last-known position, and the location attached to a panic/duress alert. GPS is captured only on those actions — never continuously in the background.</li>
          <li><b>Operations:</b> incidents you log, dispatches, on-scene reports, facilities, contacts, and chat-group links.</li>
        </ul>
      </Section>

      <Section title="How long we keep location data">
        <p style={p}>
          Location data — check-ins, GPS points, resolved panic alerts, and roll-call data —
          is <b>permanently deleted</b> after <b>{window}</b>. This runs automatically on a
          schedule; an org admin can change the window or run an immediate purge from{' '}
          <a href="/ngo/settings" style={link}>Settings</a>. We keep only the latest position,
          not a movement history — your team’s past path is not stored or reconstructable.
          Active (unresolved) panic alerts are kept until they’re resolved, then fall under
          the same deletion window.
        </p>
      </Section>

      <Section title="Who can see team locations">
        <ul style={ul}>
          <li>Only signed-in members of <b>your own organisation</b>. Another organisation can never see your data.</li>
          <li>Team and field-worker positions are visible to your <b>org admins and team leaders</b> (to coordinate and respond).</li>
          <li>A <b>field coordinator</b> sees only their <b>own</b> context on their phone — their team, their assignment, their own check-in — never the whole-org map or other teams.</li>
        </ul>
      </Section>

      <Section title="Sharing with other organisations">
        <p style={p}>
          Cross-organisation sharing is <b>off by default</b> and is not active. If it is ever
          turned on by an admin, it would share only a team’s <b>type</b> and a <b>rough area</b> —
          never names, never precise pins.
        </p>
      </Section>

      <Section title="If a phone is lost or taken">
        <ul style={ul}>
          <li>Field logins expire after <b>7 days</b>; admin/leader logins after 12 hours.</li>
          <li>An org admin can <b>sign a user out of all devices immediately</b> from{' '}
            <a href="/ngo/users" style={link}>Users</a> — the seized device stops working at once.</li>
          <li>Logging out wipes the location data cached on the device.</li>
        </ul>
      </Section>

      <Section title="How protected is this — honestly">
        <p style={p}>
          NOUR uses encrypted connections, per-organisation isolation, hard deletion of old
          location data, and least-data-by-default. That is <b>strong protection against common
          threats</b> — a lost phone, a curious outsider, another organisation.
        </p>
        <p style={p}>
          It is <b>not</b> a guarantee against a determined nation-state-level adversary. For your
          most sensitive coordination, use a dedicated secure messaging app (e.g. Signal) rather
          than relying on any single system. Capture and share the least location detail the task
          actually needs.
        </p>
      </Section>

      <Section title="The full legal policy">
        <p style={p}>
          This page is a plain-language summary. For the complete, formal terms — including
          legal bases, your rights, our service providers, international transfers, and
          retention — read the{' '}
          <a href="/ngo/privacy/policy" style={link}>full Privacy Policy →</a>
        </p>
      </Section>

      <div style={{ marginTop: 24 }}>
        <a href="/ngo/settings" style={link}>← Back to settings</a>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={h2}>{title}</h2>
      {children}
    </div>
  )
}

const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '24px 16px', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', lineHeight: 1.55 }
const h1: React.CSSProperties = { fontSize: 22, fontWeight: 600, margin: '0 0 4px' }
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 600, margin: '0 0 8px', color: '#e6edf3' }
const sub: React.CSSProperties = { fontSize: 13, color: '#8b949e', margin: '0 0 24px' }
const p: React.CSSProperties = { fontSize: 14, color: '#c9d1d9', margin: '0 0 10px' }
const ul: React.CSSProperties = { fontSize: 14, color: '#c9d1d9', margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 }
const link: React.CSSProperties = { color: '#58a6ff', textDecoration: 'none' }
