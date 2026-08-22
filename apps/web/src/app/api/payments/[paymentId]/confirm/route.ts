import { NextResponse } from 'next/server'
import { cabinetSend, BackendError } from '@/lib/cabinet'

/** Клиент отмечает, что прямой перевод дошёл на его реквизиты. */
export async function POST(_req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params
  try {
    const data = await cabinetSend(
      'POST',
      `/v1/cabinet/transactions/${encodeURIComponent(paymentId)}/confirm`,
    )
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
