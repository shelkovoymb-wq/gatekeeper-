import { NextResponse } from 'next/server'
import { cabinetSend, BackendError } from '@/lib/cabinet'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  try {
    const body = await req.json()
    const data = await cabinetSend('POST', `/v1/platform/addons/${encodeURIComponent(code)}/revoke`, body)
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
