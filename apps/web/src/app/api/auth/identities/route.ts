import { NextResponse } from 'next/server'
import { BackendError, cabinetGet } from '@/lib/cabinet'

/** Привязанные внешние аккаунты текущего пользователя. */
export async function GET() {
  try {
    const data = await cabinetGet('/v1/auth/identities')
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 400
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
