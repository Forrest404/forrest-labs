import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { cronAuthOk } from '@/lib/cron-auth'

// Scheduled (pg_cron) civilian area-alert dispatcher. Authenticated by the shared
// REVIEW_SECRET_KEY (x-cron-key header or ?key=). For each newly-verified incident / active
// warning in the lookback window, it finds active subscriptions whose area contains it and
// pushes to their ntfy topic — once per (subscription, event), guaranteed by the unique
// constraint on alert_notifications. READ-ONLY on the civilian pipeline (clusters/warnings).

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.noursystems.org').replace(/\/+$/, '')
const NTFY_BASE_URL = (process.env.NTFY_BASE_URL ?? 'https://ntfy.sh').replace(/\/+$/, '')
const LOOKBACK_MS = 20 * 60 * 1000 // generous vs the ~5-min cadence; dedup handles overlaps

// Civilian ntfy publish. Unlike the NGO sendPush(), this does NOT scrub coordinates/map-links:
// the alert is about an ALREADY-PUBLIC verified incident and the whole point is a working
// deep-link to it, so the NGO privacy backstop (which would strip the link) must not apply.
async function publishNtfy(topic: string, m: { title: string; body: string; priority: number; tags: string }): Promise<boolean> {
  try {
    const res = await fetch(NTFY_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title: m.title, message: m.body, priority: m.priority, tags: m.tags.split(',').map((s) => s.trim()).filter(Boolean) }),
    })
    return res.ok
  } catch { return false }
}

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

type Lang = 'en' | 'fr' | 'ar'
function buildMsg(refType: 'incident' | 'warning', lang: Lang, link: string) {
  const T: Record<Lang, { it: string; ib: string; wt: string; wb: string }> = {
    en: { it: '⚠ Incident near you', ib: 'A verified incident was reported in your area.', wt: '🚨 Evacuation warning near you', wb: 'An evacuation warning is active in your area. Stay safe.' },
    fr: { it: '⚠ Incident près de vous', ib: 'Un incident vérifié a été signalé dans votre zone.', wt: '🚨 Avertissement d’évacuation près de vous', wb: 'Un avertissement d’évacuation est actif dans votre zone. Restez prudent.' },
    ar: { it: '⚠ حادثة قربك', ib: 'تم الإبلاغ عن حادثة مؤكدة في منطقتك.', wt: '🚨 تحذير إخلاء قربك', wb: 'هناك تحذير إخلاء نشط في منطقتك. ابقَ بأمان.' },
  }
  const s = T[lang] ?? T.en
  const isWarn = refType === 'warning'
  return {
    title: isWarn ? s.wt : s.it,
    body: `${isWarn ? s.wb : s.ib} ${link}`,
    priority: isWarn ? 5 : 3, // ntfy: 5=urgent, 3=default
    tags: isWarn ? 'rotating_light' : 'warning',
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!cronAuthOk(request)) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  const supabase = createServiceClient()
  const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString()

  const { data: subs } = await supabase
    .from('alert_subscriptions')
    .select('id, topic, lat, lon, radius_metres, lang, created_at')
    .eq('active', true)
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, subs: 0, sent: 0 })

  const { data: incidents } = await supabase
    .from('clusters')
    .select('id, centroid_lat, centroid_lon, created_at, status')
    .in('status', ['confirmed', 'auto_confirmed', 'news_verified', 'official_verified'])
    .gte('created_at', sinceIso)
  const { data: warnings } = await supabase
    .from('warning_clusters')
    .select('id, centroid_lat, centroid_lon, created_at, status')
    .eq('status', 'active')
    .gte('created_at', sinceIso)

  const events: { id: string; lat: number; lon: number; created_at: string; ref: 'incident' | 'warning' }[] = [
    ...(incidents ?? []).map((e: any) => ({ id: e.id, lat: e.centroid_lat, lon: e.centroid_lon, created_at: e.created_at, ref: 'incident' as const })),
    ...(warnings ?? []).map((e: any) => ({ id: e.id, lat: e.centroid_lat, lon: e.centroid_lon, created_at: e.created_at, ref: 'warning' as const })),
  ].filter((e) => typeof e.lat === 'number' && typeof e.lon === 'number')

  let sent = 0
  for (const sub of subs as any[]) {
    const subTime = new Date(sub.created_at).getTime()
    for (const ev of events) {
      // Only alert for events that appeared AFTER the person subscribed (no historical back-blast).
      if (new Date(ev.created_at).getTime() <= subTime) continue
      if (haversineM(sub.lat, sub.lon, ev.lat, ev.lon) > sub.radius_metres) continue

      // Dedup: the unique (subscription_id, ref_type, ref_id) guarantees one push per event,
      // even across overlapping windows / concurrent runs. A conflict means "already sent".
      const { error: dErr } = await supabase
        .from('alert_notifications')
        .insert({ subscription_id: sub.id, ref_type: ev.ref, ref_id: ev.id })
      if (dErr) continue

      // Deep-link by id only (no lat/lon needed — the map opens + flies to the incident from
      // ?incident=/?warning= once data loads), keeping the URL clean.
      const link = `${APP_URL}/map?${ev.ref === 'warning' ? 'warning' : 'incident'}=${ev.id}`
      const ok = await publishNtfy(sub.topic, buildMsg(ev.ref, (sub.lang as Lang) ?? 'en', link))
      if (ok) {
        sent++
        await supabase.from('alert_subscriptions').update({ last_notified_at: new Date().toISOString() }).eq('id', sub.id)
      }
    }
  }

  return NextResponse.json({ ok: true, subs: subs.length, events: events.length, sent })
}
