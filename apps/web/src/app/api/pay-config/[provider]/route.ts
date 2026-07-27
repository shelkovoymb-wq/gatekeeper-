import { NextRequest, NextResponse } from 'next/server'
import { cabinetSend, BackendError } from '@/lib/cabinet'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const body = await req.json().catch(() => ({}))
  try {
    const data = await cabinetSend('PUT', `/v1/cabinet/payments/${provider}`, body)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
