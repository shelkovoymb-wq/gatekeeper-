import { NextResponse } from 'next/server'
import { cabinetSend, BackendError } from '@/lib/cabinet'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const data = await cabinetSend('POST', `/v1/platform/invoices/${id}/paid`)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
