import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/types'
import { cabinetSend, BackendError } from '@/lib/cabinet'

// Возврат идёт через кабинет с JWT вызывающего: бэкенд сам проверит, что
// платёж принадлежит этому клиенту. Раньше здесь стоял backendPost с общим
// сервис-токеном платформы и без всякой сессии — /api/* смотрит наружу через
// nginx, так что вернуть чужой платёж мог кто угодно.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params
  const body = await request.json().catch(() => ({}))
  try {
    const data = await cabinetSend(
      'POST',
      `/v1/cabinet/transactions/${encodeURIComponent(paymentId)}/refund`,
      body,
    )
    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    } as ApiResponse<unknown>)
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json(
      { success: false, error: (e as Error).message, timestamp: new Date().toISOString() } as ApiResponse<unknown>,
      { status },
    )
  }
}
