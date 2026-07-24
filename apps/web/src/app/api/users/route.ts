import { NextResponse } from 'next/server'
import type { User, ApiResponse } from '@/types'
import { backendGet } from '@/lib/backend'

export async function GET() {
  try {
    const data = await backendGet<User[]>('/v1/admin/subscribers')
    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    } as ApiResponse<User[]>)
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message, timestamp: new Date().toISOString() } as ApiResponse<User[]>,
      { status: 502 },
    )
  }
}
