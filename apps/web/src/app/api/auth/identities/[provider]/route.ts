import { NextRequest, NextResponse } from 'next/server'
import { BackendError, cabinetSend } from '@/lib/cabinet'
import { parseProvider } from '@/lib/oauth'

/** Отвязка внешнего аккаунта. Бэкенд не даст убрать последний способ входа. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await ctx.params
  const provider = parseProvider(raw)
  if (!provider) {
    return NextResponse.json({ success: false, error: 'Неизвестный сервис' }, { status: 400 })
  }
  try {
    const data = await cabinetSend('DELETE', `/v1/auth/identities/${provider}`)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 400
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
