import { NextResponse } from 'next/server'
import type { Channel, ApiResponse } from '@/types'
import { backendGet } from '@/lib/backend'

export async function GET() {
  try {
    const data = await backendGet<Channel[]>('/v1/admin/channels')
    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    } as ApiResponse<Channel[]>)
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message, timestamp: new Date().toISOString() } as ApiResponse<Channel[]>,
      { status: 502 },
    )
  }
}
