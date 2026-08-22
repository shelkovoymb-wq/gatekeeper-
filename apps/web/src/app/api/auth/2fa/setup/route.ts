import { NextResponse } from 'next/server'
import { BackendError, cabinetSend } from '@/lib/cabinet'

/** Шаг 1 подключения: секрет + otpauth-URL для QR-кода. */
export async function POST() {
  try {
    const data = await cabinetSend('POST', '/v1/auth/2fa/setup')
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 400
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
