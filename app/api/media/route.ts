import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Forwards the raw file to the Railway face-blurring worker.
// The worker blurs faces, stores the result in Supabase Storage,
// and returns the public URL. Only then do we write anything to the DB.
//
// Required env var: WORKER_URL  (e.g. https://worker.railway.app)

export async function POST(req: NextRequest): Promise<NextResponse> {
  const workerUrl = process.env.WORKER_URL
  if (!workerUrl) {
    console.error('WORKER_URL env var is not set')
    return NextResponse.json({ error: 'Media service unavailable' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const reportId = formData.get('report_id')
  const file     = formData.get('file')

  if (typeof reportId !== 'string' || reportId.trim().length === 0) {
    return NextResponse.json({ error: 'report_id is required' }, { status: 400 })
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  // Mark the report as processing so the UI can show the right state
  const supabase = createServiceClient()
  await supabase
    .from('reports')
    .update({ media_status: 'processing' })
    .eq('id', reportId)

  // Forward to the Python worker — it handles blurring and storage
  const workerForm = new FormData()
  workerForm.append('report_id', reportId)
  workerForm.append('file', file)

  let workerRes: Response
  try {
    workerRes = await fetch(`${workerUrl}/process`, {
      method: 'POST',
      body: workerForm,
    })
  } catch (err) {
    console.error('Worker request failed:', err)
    // Leave status as 'processing' — the worker may pick it up on retry
    return NextResponse.json({ error: 'Media service error' }, { status: 502 })
  }

  if (!workerRes.ok) {
    const text = await workerRes.text().catch(() => '')
    console.error('Worker returned error:', workerRes.status, text)
    return NextResponse.json({ error: 'Media processing failed' }, { status: 502 })
  }

  const result = (await workerRes.json()) as { media_url: string }

  if (!result.media_url) {
    return NextResponse.json({ error: 'Worker did not return a media_url' }, { status: 502 })
  }

  // Worker has already stored the blurred file — now record the URL
  const { error: updateErr } = await supabase
    .from('reports')
    .update({ media_url: result.media_url, media_status: 'approved' })
    .eq('id', reportId)

  if (updateErr) {
    console.error('Failed to update report media_url:', updateErr.message)
    return NextResponse.json({ error: 'Failed to record media' }, { status: 500 })
  }

  return NextResponse.json({ success: true, media_url: result.media_url })
}
