import { NextRequest, NextResponse } from 'next/server'
import { BackendError, cabinetGet, cabinetSend } from '@/lib/cabinet'

/** Состояние 2FA текущего пользователя. */
export async function GET() {
  try {
    const data = await cabinetGet('/v1/auth/2fa')
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 400
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}

/** Выключение 2FA: подтверждается паролем (или кодом, если пароля нет). */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  try {
    const data = await cabinetSend('POST', '/v1/auth/2fa/disable', body)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 400
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
