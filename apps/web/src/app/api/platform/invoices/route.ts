import { NextRequest, NextResponse } from 'next/server'
import { cabinetGet, BackendError } from '@/lib/cabinet'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status')
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  try {
    const data = await cabinetGet(`/v1/platform/invoices${qs}`)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const s = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: s })
  }
}
