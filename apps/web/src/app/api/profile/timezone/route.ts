import { NextResponse } from 'next/server'
import { cabinetSend, BackendError } from '@/lib/cabinet'

/** Часовой пояс берём из браузера клиента и запоминаем на его проекте. */
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const data = await cabinetSend('PUT', '/v1/cabinet/timezone', body)
    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 502
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
