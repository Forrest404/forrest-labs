import { ImageResponse } from 'next/og'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          padding: '60px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '28px',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#ef4444',
            }}
          />
          <span
            style={{
              fontSize: 14,
              color: '#ef4444',
              letterSpacing: '0.2em',
            }}
          >
            FORREST LABS
          </span>
        </div>
        <div
          style={{
            fontSize: 54,
            fontWeight: 500,
            color: 'white',
            textAlign: 'center',
            lineHeight: 1.15,
            marginBottom: 24,
            maxWidth: 900,
          }}
        >
          When bombs fall, every second counts.
        </div>
        <div
          style={{
            fontSize: 22,
            color: '#9ca3af',
            textAlign: 'center',
            maxWidth: 680,
            lineHeight: 1.6,
          }}
        >
          Civilians report. AI verifies. Aid workers respond. In real time.
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
