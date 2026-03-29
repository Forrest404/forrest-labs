'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SitrepResult {
  title: string
  period_start: string
  period_end: string
  total_incidents: number
  total_reports: number
  total_warnings: number
  avg_confidence: number
  by_region: {
    beirut: number
    south: number
    bekaa: number
    sidon: number
    other: number
  }
  by_source: {
    civilian: number
    news: number
    official: number
  }
  ai_narrative: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const [generating, setGenerating] = useState<string | null>(null)
  const [sitrepForm, setSitrepForm] = useState({
    title: '',
    period_start: '',
    period_end: '',
    include_ai: true,
  })
  const [sitrepResult, setSitrepResult] = useState<SitrepResult | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleExport = (format: string, days: number) => {
    const key = format + '-' + days
    setGenerating(key)
    window.open(
      '/api/admin/export/' + format + '?days=' + days,
      '_blank',
    )
    setTimeout(() => setGenerating(null), 2000)
  }

  const handleGenerateSitrep = () => {
    if (!sitrepForm.title || !sitrepForm.period_start || !sitrepForm.period_end) return

    setGenerating('sitrep')

    fetch('/api/admin/export/sitrep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: sitrepForm.title,
        period_start: new Date(sitrepForm.period_start).toISOString(),
        period_end: new Date(sitrepForm.period_end).toISOString(),
        include_ai_summary: sitrepForm.include_ai,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        setSitrepResult(data)
        setGenerating(null)
      })
      .catch(() => setGenerating(null))
  }

  const apiUrl = typeof window !== 'undefined'
    ? window.location.origin + '/api/events'
    : '/api/events'

  const dayOptions = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'All time', days: 9999 },
  ]

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      {/* Left column — Quick exports */}
      <div style={{ flex: '1 1 400px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 14 }}>
          Quick export
        </div>

        {/* GeoJSON */}
        <div
          style={{
            background: '#161b22',
            border: '1px solid #21262d',
            borderRadius: 8,
            padding: 16,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              background: '#21262d',
              color: '#8b949e',
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 3,
              fontFamily: 'monospace',
            }}
          >
            GeoJSON
          </span>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#e6edf3', margin: '6px 0 4px' }}>
            Incident locations
          </div>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            All confirmed incidents as geographic data. Compatible with QGIS, ArcGIS, Mapbox, and Google Earth.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {dayOptions.map((opt) => (
              <button
                key={'geojson-' + opt.days}
                type="button"
                onClick={() => handleExport('geojson', opt.days)}
                disabled={generating === 'geojson-' + opt.days}
                style={{
                  height: 30,
                  padding: '0 12px',
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                  background: 'rgba(63,185,80,0.08)',
                  border: '1px solid rgba(63,185,80,0.2)',
                  color: '#3fb950',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* CSV */}
        <div
          style={{
            background: '#161b22',
            border: '1px solid #21262d',
            borderRadius: 8,
            padding: 16,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              background: '#21262d',
              color: '#8b949e',
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 3,
              fontFamily: 'monospace',
            }}
          >
            CSV
          </span>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#e6edf3', margin: '6px 0 4px' }}>
            Incident spreadsheet
          </div>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            All confirmed incidents as a spreadsheet. Open in Excel, Google Sheets, or any data tool.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {dayOptions.map((opt) => (
              <button
                key={'csv-' + opt.days}
                type="button"
                onClick={() => handleExport('csv', opt.days)}
                disabled={generating === 'csv-' + opt.days}
                style={{
                  height: 30,
                  padding: '0 12px',
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                  background: 'rgba(88,166,255,0.08)',
                  border: '1px solid rgba(88,166,255,0.2)',
                  color: '#58a6ff',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Public API */}
        <div
          style={{
            background: '#161b22',
            border: '1px solid #21262d',
            borderRadius: 8,
            padding: 16,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              background: '#21262d',
              color: '#8b949e',
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 3,
              fontFamily: 'monospace',
            }}
          >
            API
          </span>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#e6edf3', margin: '6px 0 4px' }}>
            Public events endpoint
          </div>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            Share this URL with partner organisations for live programmatic access.
          </div>
          <div
            style={{
              background: '#0d1117',
              border: '1px solid #21262d',
              borderRadius: 5,
              padding: '8px 12px',
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#e6edf3',
              wordBreak: 'break-all',
            }}
          >
            {apiUrl}
          </div>
          <button
            type="button"
            onClick={() => copyText(apiUrl, 'api')}
            style={{
              height: 28,
              padding: '0 10px',
              fontSize: 11,
              color: '#8b949e',
              background: 'transparent',
              border: '1px solid #21262d',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'system-ui',
              marginTop: 8,
            }}
          >
            {copied === 'api' ? 'Copied \u2713' : 'Copy URL'}
          </button>
        </div>
      </div>

      {/* Right column — Situation report */}
      <div style={{ flex: '1 1 380px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 14 }}>
          Generate situation report
        </div>

        {/* Sitrep form */}
        <div
          style={{
            background: '#161b22',
            border: '1px solid #21262d',
            borderRadius: 8,
            padding: 16,
          }}
        >
          {/* Title */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#8b949e', display: 'block', marginBottom: 4 }}>
              Report title
            </label>
            <input
              type="text"
              value={sitrepForm.title}
              onChange={(e) => setSitrepForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Lebanon situation report — March 2026"
              style={{
                width: '100%',
                background: '#0d1117',
                border: '1px solid #21262d',
                color: '#e6edf3',
                borderRadius: 5,
                padding: '8px 10px',
                fontSize: 13,
                height: 36,
                fontFamily: 'system-ui',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Date range */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#8b949e', display: 'block', marginBottom: 4 }}>
                From
              </label>
              <input
                type="date"
                value={sitrepForm.period_start}
                onChange={(e) => setSitrepForm((p) => ({ ...p, period_start: e.target.value }))}
                style={{
                  width: '100%',
                  background: '#0d1117',
                  border: '1px solid #21262d',
                  color: '#e6edf3',
                  borderRadius: 5,
                  padding: '8px 10px',
                  fontSize: 13,
                  height: 36,
                  fontFamily: 'system-ui',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#8b949e', display: 'block', marginBottom: 4 }}>
                To
              </label>
              <input
                type="date"
                value={sitrepForm.period_end}
                onChange={(e) => setSitrepForm((p) => ({ ...p, period_end: e.target.value }))}
                style={{
                  width: '100%',
                  background: '#0d1117',
                  border: '1px solid #21262d',
                  color: '#e6edf3',
                  borderRadius: 5,
                  padding: '8px 10px',
                  fontSize: 13,
                  height: 36,
                  fontFamily: 'system-ui',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* AI toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid #21262d',
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: '#e6edf3' }}>AI narrative</div>
              <div style={{ fontSize: 12, color: '#484f58' }}>
                Claude writes a 3-paragraph OCHA-style summary
              </div>
            </div>
            <div
              onClick={() => setSitrepForm((p) => ({ ...p, include_ai: !p.include_ai }))}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: sitrepForm.include_ai ? '#3fb950' : '#21262d',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#e6edf3',
                  position: 'absolute',
                  top: 2,
                  left: sitrepForm.include_ai ? 18 : 2,
                  transition: 'left 0.2s',
                }}
              />
            </div>
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerateSitrep}
            disabled={generating === 'sitrep'}
            style={{
              width: '100%',
              height: 40,
              background: generating === 'sitrep' ? '#6e3731' : '#f85149',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 14,
              fontFamily: 'system-ui',
            }}
          >
            {generating === 'sitrep' ? 'Generating...' : 'Generate report'}
          </button>
        </div>

        {/* Sitrep result */}
        {sitrepResult && (
          <div
            style={{
              background: '#0d1117',
              border: '1px solid rgba(63,185,80,0.2)',
              borderRadius: 8,
              padding: 16,
              marginTop: 14,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#3fb950' }}>&#10003;</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>
                {sitrepResult.title}
              </span>
            </div>

            {/* Stats */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                margin: '12px 0',
              }}
            >
              {[
                { label: 'Total incidents', value: sitrepResult.total_incidents },
                { label: 'Total reports', value: sitrepResult.total_reports },
                { label: 'Avg confidence', value: sitrepResult.avg_confidence + '%' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    background: '#161b22',
                    border: '1px solid #21262d',
                    borderRadius: 6,
                    padding: '8px 10px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#e6edf3' }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 10, color: '#484f58', marginTop: 2 }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Regional breakdown */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Regional breakdown
              </div>
              {(() => {
                const regions = [
                  { name: 'Beirut', count: sitrepResult.by_region.beirut },
                  { name: 'South Lebanon', count: sitrepResult.by_region.south },
                  { name: 'Bekaa Valley', count: sitrepResult.by_region.bekaa },
                  { name: 'Sidon', count: sitrepResult.by_region.sidon },
                ]
                const maxCount = Math.max(...regions.map((r) => r.count), 1)
                return regions.map((region) => (
                  <div
                    key={region.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: '#8b949e',
                        width: 100,
                        flexShrink: 0,
                      }}
                    >
                      {region.name}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: '#21262d',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 3,
                          background: '#ef4444',
                          width: (region.count / maxCount) * 100 + '%',
                          transition: 'width 0.4s',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#e6edf3',
                        marginLeft: 8,
                        minWidth: 20,
                        textAlign: 'right',
                      }}
                    >
                      {region.count}
                    </span>
                  </div>
                ))
              })()}
            </div>

            {/* AI narrative */}
            {sitrepResult.ai_narrative && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: '#484f58',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 8,
                  }}
                >
                  AI assessment
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: '#8b949e',
                    lineHeight: 1.7,
                    background: '#161b22',
                    border: '1px solid #21262d',
                    borderRadius: 6,
                    padding: 12,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {sitrepResult.ai_narrative}
                </div>
              </div>
            )}

            {/* Copy button */}
            <button
              type="button"
              onClick={() => copyText(JSON.stringify(sitrepResult, null, 2), 'sitrep')}
              style={{
                width: '100%',
                height: 34,
                background: 'transparent',
                border: '1px solid #21262d',
                color: '#8b949e',
                borderRadius: 5,
                fontSize: 12,
                marginTop: 12,
                cursor: 'pointer',
                fontFamily: 'system-ui',
              }}
            >
              {copied === 'sitrep' ? 'Copied \u2713' : 'Copy as JSON'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
