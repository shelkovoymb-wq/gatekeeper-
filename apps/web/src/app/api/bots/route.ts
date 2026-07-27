import { NextRequest, NextResponse } from 'next/server'
import { cabinetGet, cabinetSend, BackendError } from '@/lib/cabinet'

export async function GET() {
  try {
    const data = await cabinetGet('/v1/cabinet/bots')
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  try {
    const data = await cabinetSend('POST', '/v1/cabinet/bots', body)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
