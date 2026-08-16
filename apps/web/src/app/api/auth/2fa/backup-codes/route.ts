import { NextRequest, NextResponse } from 'next/server'
import { BackendError, cabinetSend } from '@/lib/cabinet'

/** Перевыпуск резервных кодов (старые сразу перестают действовать). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  try {
    const data = await cabinetSend('POST', '/v1/auth/2fa/backup-codes', body)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 400
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
