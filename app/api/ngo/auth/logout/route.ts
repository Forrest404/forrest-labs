import { NextResponse } from 'next/server'
import { clearNgoCookie } from '@/lib/ngo-auth'

export async function POST() {
  const response = NextResponse.json({ success: true })
  clearNgoCookie(response as unknown as Response)
  return response
}
