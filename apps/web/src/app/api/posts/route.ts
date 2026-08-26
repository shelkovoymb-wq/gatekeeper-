import { NextResponse } from 'next/server'
import { cabinetGet, cabinetSend, BackendError } from '@/lib/cabinet'

export async function GET() {
  try {
    const data = await cabinetGet('/v1/cabinet/posts')
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = await cabinetSend('POST', '/v1/cabinet/posts', body)
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
