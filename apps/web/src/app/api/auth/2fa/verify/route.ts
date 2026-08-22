import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  backendAuth,
  BackendError,
  secureCookie,
  SESSION_COOKIE,
  TWO_FACTOR_COOKIE,
  type BackendSession,
} from '@/lib/cabinet'

/**
 * Второй шаг входа: код из приложения (или резервный) в обмен на сессию.
 * Сам challenge-токен браузеру не отдавался — он лежит в httpOnly-cookie,
 * поэтому XSS на странице входа не даст его выдернуть и переиспользовать.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { code?: string }
  const jar = await cookies()
  const challengeToken = jar.get(TWO_FACTOR_COOKIE)?.value

  if (!challengeToken) {
    return NextResponse.json(
      { success: false, error: 'Сессия подтверждения истекла — войдите заново' },
      { status: 401 },
    )
  }

  try {
    const data = (await backendAuth('/v1/auth/2fa/verify', {
      challengeToken,
      code: String(body?.code ?? ''),
    })) as BackendSession

    const res = NextResponse.json({ success: true, user: data.user })
    res.cookies.set(SESSION_COOKIE, data.token, { ...secureCookie, maxAge: 60 * 60 * 24 * 7 })
    res.cookies.set(TWO_FACTOR_COOKIE, '', { ...secureCookie, maxAge: 0 })
    return res
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 400
    const res = NextResponse.json({ success: false, error: (e as Error).message }, { status })
    // Токен истёк/невалиден — чистим, чтобы UI вернул человека на форму входа.
    if (status === 401 && /истёк|токен/i.test((e as Error).message)) {
      res.cookies.set(TWO_FACTOR_COOKIE, '', { ...secureCookie, maxAge: 0 })
    }
    return res
  }
}
