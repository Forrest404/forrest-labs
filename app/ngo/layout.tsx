'use client'

import type { ReactNode } from 'react'

// NGO platform shell. Design-system colours + inline styles, matching the
// rest of the app. No auth yet — this is the empty skeleton other features
// build on. Nav is intentionally empty until features land.
export default function NgoLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: '#0d1117',
        color: '#e6edf3',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: '#0d1117',
          borderRight: '1px solid #21262d',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 0',
        }}
      >
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #21262d' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>
            NOUR <span style={{ color: '#3fb950' }}>for NGOs</span>
          </div>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>Operations dashboard</div>
        </div>

        {/* Navigation — intentionally empty until features are added */}
        <nav style={{ flex: 1, padding: '12px 8px' }} />

        <div style={{ padding: '0 16px', fontSize: 10, color: '#484f58' }}>Pre-release</div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
    </div>
  )
}
