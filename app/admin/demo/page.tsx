'use client'

import { useState } from 'react'

interface DemoStep {
  title: string
  detail: string
  link?: { label: string; href: string; target?: string }
  hasTimer?: boolean
}

const STEPS: DemoStep[] = [
  {
    title: 'Open the landing page',
    detail:
      'Navigate to / and show the partner the live stats. Explain: civilians in Lebanon open this URL on any phone and can report in 15 seconds.',
    link: { label: 'Open landing page \u2192', href: '/' },
  },
  {
    title: 'Show the civilian report form on your phone',
    detail:
      'Open /report on your actual phone. Walk through the 5 steps \u2014 location, distance, event type, optional photo, confirm. Submit a real report.',
    link: { label: 'Open report form \u2192', href: '/report' },
  },
  {
    title: 'Wait 90 seconds',
    detail:
      'The clustering engine runs every 60 seconds. After your report submits, wait 90 seconds. A new pending cluster will appear in the triage queue.',
    hasTimer: true,
  },
  {
    title: 'Review in the triage queue',
    detail:
      'Open /admin/triage. The cluster from your report will be waiting. Press A to confirm. Show how keyboard shortcuts make review instant.',
    link: { label: 'Open triage queue \u2192', href: '/admin/triage' },
  },
  {
    title: 'Show the live map',
    detail:
      'Open /map. The confirmed cluster from your report now appears as a red circle. Show the partner the 60+ historical Lebanon strike locations. Click a circle to show the detail panel.',
    link: { label: 'Open live map \u2192', href: '/map' },
  },
  {
    title: 'Show the intelligence feed',
    detail:
      "Open /admin/intelligence. Show how news articles are automatically cross-referenced with incidents. Click 'Run detection now' to show it working in real time.",
    link: { label: 'Open intelligence \u2192', href: '/admin/intelligence' },
  },
  {
    title: 'Show the partner portal',
    detail:
      'Explain that NGO partners get a separate login at /partner that shows them confirmed incidents and their team status \u2014 with no access to civilian data or admin functions.',
    link: { label: 'Open partner portal \u2192', href: '/partner' },
  },
  {
    title: 'Share the one-page brief',
    detail: 'Send the partner the brief URL below. It loads live stats from the actual system.',
    link: { label: 'Open one-page brief \u2192', href: '/api/brief', target: '_blank' },
  },
]

export default function DemoScriptPage() {
  const [timerValue, setTimerValue] = useState<number | null>(null)
  const [timerDone, setTimerDone] = useState(false)
  const [resetting, setResetting] = useState(false)

  const startTimer = () => {
    setTimerValue(90)
    setTimerDone(false)
    let seconds = 90
    const id = setInterval(() => {
      seconds--
      setTimerValue(seconds)
      if (seconds <= 0) {
        clearInterval(id)
        setTimerDone(true)
      }
    }, 1000)
  }

  const resetDemo = async () => {
    setResetting(true)
    try {
      const res = await fetch('/api/admin/demo/reset', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        alert(
          'Demo data reset. The clustering engine will create a new pending cluster within 75 seconds.',
        )
      }
    } catch {
      /* ignore */
    }
    setResetting(false)
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#e6edf3' }}>Demo script</div>
        <div style={{ fontSize: 13, color: '#8b949e' }}>
          Follow these steps when showing Forrest Labs to a partner.
        </div>
      </div>

      {STEPS.map((step, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'flex-start',
            background: '#161b22',
            border: '1px solid #21262d',
            borderRadius: 8,
            padding: 16,
            marginBottom: 10,
          }}
        >
          {/* Step number circle */}
          <div
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: '50%',
              background: 'rgba(248,81,73,0.1)',
              border: '1px solid rgba(248,81,73,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: '#f85149',
            }}
          >
            {i + 1}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>
              {step.title}
            </div>
            <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.6 }}>{step.detail}</div>

            {step.link && (
              <a
                href={step.link.href}
                target={step.link.target}
                style={{
                  display: 'inline-block',
                  fontSize: 12,
                  color: '#58a6ff',
                  cursor: 'pointer',
                  marginTop: 6,
                  textDecoration: 'none',
                }}
              >
                {step.link.label}
              </a>
            )}

            {step.hasTimer && (
              <div style={{ marginTop: 8 }}>
                {timerValue === null && !timerDone && (
                  <button
                    type="button"
                    onClick={startTimer}
                    style={{
                      background: 'rgba(88,166,255,0.08)',
                      border: '1px solid rgba(88,166,255,0.2)',
                      color: '#58a6ff',
                      height: 32,
                      padding: '0 14px',
                      borderRadius: 5,
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'system-ui',
                    }}
                  >
                    Start 90s timer
                  </button>
                )}
                {timerValue !== null && !timerDone && (
                  <span style={{ fontSize: 13, color: '#58a6ff', fontVariantNumeric: 'tabular-nums' }}>
                    {timerValue} seconds...
                  </span>
                )}
                {timerDone && (
                  <a
                    href="/admin/triage"
                    style={{ fontSize: 13, color: '#3fb950', textDecoration: 'none' }}
                  >
                    &#10003; Check triage queue now
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Reset demo button */}
      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          onClick={resetDemo}
          disabled={resetting}
          style={{
            height: 26,
            padding: '0 10px',
            background: 'rgba(139,148,158,0.08)',
            border: '1px solid rgba(139,148,158,0.15)',
            color: '#484f58',
            borderRadius: 5,
            fontSize: 11,
            cursor: resetting ? 'default' : 'pointer',
            fontFamily: 'system-ui',
          }}
        >
          {resetting ? 'Resetting...' : 'Reset demo data'}
        </button>
      </div>
    </div>
  )
}
