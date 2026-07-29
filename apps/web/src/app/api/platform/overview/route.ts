import { NextResponse } from 'next/server'
import { cabinetGet, BackendError } from '@/lib/cabinet'

export async function GET() {
  try {
    const data = await cabinetGet('/v1/platform/overview')
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
