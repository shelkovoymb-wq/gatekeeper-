import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/types'
import { backendPost } from '@/lib/backend'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params
  const body = await request.json().catch(() => ({}))
  try {
    const data = await backendPost(`/payments/${paymentId}/refund`, body)
    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    } as ApiResponse<unknown>)
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message, timestamp: new Date().toISOString() } as ApiResponse<unknown>,
      { status: 502 },
    )
  }
}
