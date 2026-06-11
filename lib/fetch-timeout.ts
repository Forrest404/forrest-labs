// fetchWithTimeout — fetch with a hard deadline.
//
// App-path external calls (the ntfy push relay, SMS gateway, Resend email, Mapbox geocode,
// Claude) had NO timeout, so a hung or slow dependency could block a request to the Vercel
// platform limit (~60s) — and a panic-response handler geocodes inline, while the 1-minute
// panic-escalation cron awaits every push. This aborts after `ms` so callers fail fast and
// degrade (the alert is still recorded; the location is shown in-app). The abort surfaces as
// a thrown error, which every caller here already catches.
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 5000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
}
