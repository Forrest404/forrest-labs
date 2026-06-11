import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getNgoSession, requireRole } from '@/lib/ngo-auth'
import { rateLimit, tooMany } from '@/lib/rate-limit'
import { gatherOrgReportData } from '@/lib/ngo-reports'
import { notifyUsers } from '@/lib/ngo-notify'
import { fetchWithTimeout } from '@/lib/fetch-timeout'

// POST /api/ngo/reports/generate — gather this org's incidents (within its
// operational area), dispatches, and on-scene reports for a date range, then ask
// Claude to draft an OCHA-style sitrep from ONLY those records, and save it.
// org_admin + team_leader only.
export async function POST(request: NextRequest) {
  const session = await getNgoSession(request)
  if (!requireRole(session, ['org_admin', 'team_leader'])) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  let body: { period_start?: string; period_end?: string; title?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const start = (body.period_start ?? '').trim()
  const end = (body.period_end ?? '').trim()
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (!start || !end || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Valid period_start and period_end are required' }, { status: 400 })
  }
  if (startDate > endDate) {
    return NextResponse.json({ error: 'period_start must be on or before period_end' }, { status: 400 })
  }
  const title = (body.title ?? '').trim() || `Situation report ${start.slice(0, 10)} → ${end.slice(0, 10)}`

  const supabase = createServiceClient()
  const orgId = session!.orgId

  // AI report generation is expensive — cap it tightly per user (8 / 10 min).
  const limit = await rateLimit(supabase, { bucket: 'mut:report-generate', identifier: session!.userId, max: 8, windowSec: 600 })
  if (!limit.ok) return tooMany(limit.retryAfter)

  // Org name for the prompt context (not strictly needed, but grounds the draft).
  const { data: org } = await supabase.from('ngo_organisations').select('name').eq('id', orgId).single()

  const gathered = await gatherOrgReportData(supabase, orgId, start, end)

  // Ask Claude for the narrative — strictly from the supplied records.
  let draft: string | null = null
  let aiError: string | null = null
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    aiError = 'AI draft unavailable (ANTHROPIC_API_KEY not configured). The gathered data has been saved.'
  } else if (gathered.incidents.length === 0 && gathered.dispatches.length === 0) {
    aiError = 'No incidents or dispatches found in this period for your area, so no narrative was drafted. The (empty) snapshot has been saved.'
  } else {
    try {
      const system =
        'You are a humanitarian analyst drafting a concise situation report (sitrep) in UN OCHA style for an NGO. ' +
        'Use ONLY the records supplied in the user message. Do NOT invent or assume any facts, numbers, names, or locations not present in the data. ' +
        'Structure the report with exactly these three sections, each as a short heading followed by 1–3 short paragraphs:\n' +
        '1. Situation Overview\n2. Response Activity\n3. Key Figures\n' +
        'Be factual and concise. If a section has no supporting data, state plainly that no data is available for it. Do not add a preamble or closing.'
      const userContent =
        `Organisation: ${org?.name ?? 'this organisation'}\n` +
        `Reporting period: ${start} to ${end}\n` +
        `Operational area defined: ${gathered.area_defined ? 'yes' : 'no — incidents could not be area-filtered'}\n\n` +
        `KEY FIGURES:\n${JSON.stringify(gathered.figures, null, 2)}\n\n` +
        `VERIFIED INCIDENTS IN AREA (${gathered.incidents.length}):\n${JSON.stringify(gathered.incidents, null, 2)}\n\n` +
        `DISPATCHES & ON-SCENE REPORTS (${gathered.dispatches.length}):\n${JSON.stringify(gathered.dispatches, null, 2)}`

      const aiRes = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 700,
          system,
          messages: [{ role: 'user', content: userContent }],
        }),
      }, 30000)
      if (!aiRes.ok) {
        aiError = `AI draft unavailable (model returned ${aiRes.status}). The gathered data has been saved.`
      } else {
        const aiData = await aiRes.json()
        draft = aiData?.content?.[0]?.text ?? null
        if (!draft) aiError = 'AI draft came back empty. The gathered data has been saved.'
      }
    } catch (e) {
      console.error('sitrep AI call failed:', e)
      aiError = 'AI draft unavailable (request failed). The gathered data has been saved.'
    }
  }

  const { data: saved, error: insErr } = await supabase
    .from('ngo_reports')
    .insert({
      org_id: orgId,
      title,
      period_start: startDate.toISOString(),
      period_end: endDate.toISOString(),
      draft,
      data: gathered,
      generated_by: session!.userId,
    })
    .select('id, title, period_start, period_end, created_at, draft')
    .single()

  if (insErr) {
    console.error('ngo report save failed:', insErr)
    return NextResponse.json({ error: 'Could not save the report' }, { status: 500 })
  }

  // LOW-urgency "report ready" notice to the people who'd want it (the generator + org
  // admins). Best-effort — never fails the generation. Title only; no report content.
  try {
    const { data: admins } = await supabase.from('ngo_users').select('id').eq('org_id', orgId).eq('role', 'org_admin').eq('status', 'active')
    const ids = Array.from(new Set([session!.userId, ...(admins ?? []).map((a: any) => a.id)]))
    await notifyUsers(supabase, orgId, ids, {
      event: 'report_ready',
      title: '📄 Report ready',
      body: `“${saved.title}” has been generated and is ready to view in NOUR.`,
      tags: 'page_facing_up',
    })
  } catch { /* notification is best-effort */ }

  return NextResponse.json({ report: { ...saved, data: gathered }, ai_error: aiError })
}
