import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/types'
import type { Payment } from '@/types/payment'
import { backendGet } from '@/lib/backend'

export async function GET() {
  try {
    const data = await backendGet<Payment[]>('/v1/admin/payments')
    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    } as ApiResponse<Payment[]>)
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message, timestamp: new Date().toISOString() } as ApiResponse<Payment[]>,
      { status: 502 },
    )
  }
}
