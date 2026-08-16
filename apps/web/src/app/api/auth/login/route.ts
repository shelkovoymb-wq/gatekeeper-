import { NextRequest, NextResponse } from 'next/server'
import {
  backendAuth,
  BackendError,
  isTwoFactorChallenge,
  secureCookie,
  SESSION_COOKIE,
  TWO_FACTOR_COOKIE,
  type BackendSession,
  type BackendTwoFactorChallenge,
} from '@/lib/cabinet'

/** Челлендж живёт 5 минут — столько же, сколько токен на бэкенде. */
const CHALLENGE_MAX_AGE = 5 * 60

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  try {
    const data = (await backendAuth('/v1/auth/login', body)) as
      | BackendSession
      | BackendTwoFactorChallenge

    // У пользователя включена 2FA: сессию НЕ выдаём, кладём короткоживущий
    // challenge в httpOnly-cookie — в JS страницы он не попадает.
    if (isTwoFactorChallenge(data)) {
      const res = NextResponse.json({
        success: true,
        twoFactorRequired: true,
        methods: data.methods,
      })
      res.cookies.set(TWO_FACTOR_COOKIE, data.challengeToken, {
        ...secureCookie,
        maxAge: CHALLENGE_MAX_AGE,
      })
      return res
    }

    const res = NextResponse.json({ success: true, user: data.user })
    res.cookies.set(SESSION_COOKIE, data.token, { ...secureCookie, maxAge: 60 * 60 * 24 * 7 })
    // Незакрытый челлендж от прошлой попытки не должен пережить успешный вход.
    res.cookies.set(TWO_FACTOR_COOKIE, '', { ...secureCookie, maxAge: 0 })
    return res
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 400
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
