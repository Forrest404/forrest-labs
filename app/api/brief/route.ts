export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Forrest Labs — Product Brief</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #111;
      background: white;
      max-width: 680px;
      margin: 0 auto;
      padding: 40px 32px;
      font-size: 14px;
      line-height: 1.6;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 2px solid #111;
    }
    .logo {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .badge {
      font-size: 11px; color: #666;
      border: 1px solid #ccc;
      padding: 3px 8px;
      border-radius: 3px;
      margin-top: 4px;
      display: inline-block;
    }
    h2 {
      font-size: 20px; font-weight: 600;
      margin-bottom: 8px;
      letter-spacing: -0.01em;
    }
    h3 {
      font-size: 13px; font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #666;
      margin: 24px 0 8px;
    }
    p { margin-bottom: 10px; color: #333; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3,1fr);
      gap: 12px;
      margin: 16px 0;
    }
    .stat {
      border: 1px solid #eee;
      border-radius: 6px;
      padding: 12px;
    }
    .stat-num {
      font-size: 24px; font-weight: 600;
      letter-spacing: -0.02em;
    }
    .stat-label {
      font-size: 11px; color: #666;
      margin-top: 2px;
    }
    .features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 12px 0;
    }
    .feature {
      padding: 10px 12px;
      background: #f8f8f8;
      border-radius: 5px;
      font-size: 13px;
    }
    .feature strong {
      display: block;
      margin-bottom: 2px;
    }
    .contact {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      font-size: 13px;
      color: #666;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Forrest Labs</div>
      <div class="badge">Civilian Safety Reporting</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#666">
      forrestlabs.org<br>
      Lebanon &middot; 2026
    </div>
  </div>

  <h2>Real-time civilian safety reporting for conflict zones.</h2>

  <p>Civilians in Lebanon can report strikes and evacuation warnings directly from any phone &mdash; no app download, no account. AI cross-references and verifies reports in real time. Aid organisations see confirmed incidents on a live map within 90 seconds of the first report.</p>

  <h3>System status</h3>
  <div class="stats">
    <div class="stat">
      <div class="stat-num" id="s1">&mdash;</div>
      <div class="stat-label">Reports submitted</div>
    </div>
    <div class="stat">
      <div class="stat-num" id="s2">&mdash;</div>
      <div class="stat-label">Incidents confirmed</div>
    </div>
    <div class="stat">
      <div class="stat-num" id="s3">&mdash;</div>
      <div class="stat-label">Active warnings</div>
    </div>
  </div>

  <script>
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => {
        document.getElementById('s1').textContent = d.total_reports ?? '\\u2014'
        document.getElementById('s2').textContent = d.confirmed_incidents ?? '\\u2014'
        document.getElementById('s3').textContent = d.active_warnings ?? '\\u2014'
      })
  </script>

  <h3>How it works</h3>
  <div class="features">
    <div class="feature">
      <strong>01 &mdash; Report</strong>
      Civilians tap four times to log what they heard or saw. 15 seconds. Anonymous. No app required.
    </div>
    <div class="feature">
      <strong>02 &mdash; Verify</strong>
      AI cross-references reports by location and time. Coordinated fake reports are filtered automatically.
    </div>
    <div class="feature">
      <strong>03 &mdash; Map</strong>
      Verified incidents appear on the live map within 90 seconds. Available to any aid organisation.
    </div>
    <div class="feature">
      <strong>04 &mdash; Respond</strong>
      Operations teams see where help is needed in real time and dispatch resources accordingly.
    </div>
  </div>

  <h3>Privacy and security</h3>
  <p>No identity data is ever stored. IP addresses are hashed. Uploaded photos have faces automatically blurred before storage. The system cannot be used for individual tracking or military targeting.</p>

  <h3>Technical</h3>
  <p>Open web platform &mdash; no app store approval required. Works on any phone with a browser. Deployable to any cloud. Real-time data available via public API for integration with existing humanitarian systems.</p>

  <h3>Data access</h3>
  <p>Confirmed incident data is available as GeoJSON and CSV for import into QGIS, ArcGIS, and other GIS tools. Live API endpoint for programmatic access. Partner organisations receive a dedicated operations dashboard.</p>

  <div class="contact">
    <div>Forrest Labs &middot; 2026</div>
    <div>Live system: <strong>forrestlabs.org</strong></div>
  </div>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
