import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const reportId = formData.get('report_id') as string | null

    if (!file || !reportId) {
      return NextResponse.json(
        { error: 'Missing file or report_id' },
        { status: 400 }
      )
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(reportId)) {
      return NextResponse.json(
        { error: 'Invalid report_id format' },
        { status: 400 }
      )
    }

    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png',
      'image/webp', 'video/mp4', 'video/quicktime',
      'video/webm',
    ]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 415 }
      )
    }

    if (file.size > 52428800) {
      return NextResponse.json(
        { error: 'File too large. Max 50MB.' },
        { status: 413 }
      )
    }

    const supabase = createServiceClient()
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, media_status')
      .eq('id', reportId)
      .single()

    if (reportError || !report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      )
    }

    if (report.media_status === 'approved') {
      return NextResponse.json(
        { error: 'Report already has approved media' },
        { status: 409 }
      )
    }

    const workerUrl = process.env.WORKER_URL
    if (!workerUrl) {
      console.error('WORKER_URL environment variable not set')
      return NextResponse.json(
        { error: 'Media processing unavailable' },
        { status: 503 }
      )
    }

    await supabase
      .from('reports')
      .update({ media_status: 'processing' })
      .eq('id', reportId)

    const workerFormData = new FormData()
    workerFormData.append('file', file)
    workerFormData.append('report_id', reportId)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 180000)

    let workerResponse: Response
    try {
      workerResponse = await fetch(`${workerUrl}/process-media`, {
        method: 'POST',
        body: workerFormData,
        signal: controller.signal,
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        // Mark the report so the clustering algorithm doesn't count it as processing
        await supabase
          .from('reports')
          .update({ media_status: 'rejected' })
          .eq('id', reportId)
        return NextResponse.json(
          { error: 'Media processing timed out' },
          { status: 504 }
        )
      }
      throw fetchError
    } finally {
      clearTimeout(timeoutId)
    }

    if (!workerResponse.ok) {
      const errorBody = await workerResponse.text()
      console.error('Worker error:', workerResponse.status, errorBody)
      await supabase
        .from('reports')
        .update({ media_status: 'rejected' })
        .eq('id', reportId)
      return NextResponse.json(
        { error: 'Media processing failed' },
        { status: 500 }
      )
    }

    const result = await workerResponse.json()

    return NextResponse.json({
      success: true,
      url: result.url,
      faces_detected: result.faces_detected ?? 0,
    }, { status: 200 })

  } catch (error) {
    console.error('Media API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const maxDuration = 180
