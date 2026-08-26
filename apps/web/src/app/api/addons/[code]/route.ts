import { NextResponse } from 'next/server'
import { cabinetGet, BackendError } from '@/lib/cabinet'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  try {
    const data = await cabinetGet(`/v1/cabinet/addons/${encodeURIComponent(code)}`)
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
