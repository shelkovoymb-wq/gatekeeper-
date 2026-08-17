import { NextResponse, type NextRequest } from 'next/server'
import { cabinetGet, BackendError } from '@/lib/cabinet'

/** Параметры фильтра, которые пробрасываем на бэкенд (остальное отсекаем). */
const PASS_THROUGH = ['from', 'to', 'granularity', 'clientId', 'limit'] as const

export async function GET(req: NextRequest) {
  const qs = new URLSearchParams()
  for (const key of PASS_THROUGH) {
    const value = req.nextUrl.searchParams.get(key)
    if (value) qs.set(key, value)
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : ''

  try {
    const data = await cabinetGet(`/v1/platform/analytics${suffix}`)
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
