import { NextRequest, NextResponse } from 'next/server'
import { cabinetSend, BackendError } from '@/lib/cabinet'

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  try {
    const data = await cabinetSend('PUT', '/v1/cabinet/billing/plan', body)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
