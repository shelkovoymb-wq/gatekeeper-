import { NextRequest, NextResponse } from 'next/server'
import { backendPublicGet, OAUTH_STATE_COOKIE, secureCookie, SESSION_COOKIE } from '@/lib/cabinet'
import {
  isAllowedAuthorizeUrl,
  packState,
  parseMode,
  parseProvider,
  safeErrorParam,
} from '@/lib/oauth'

/** Столько же, сколько живёт подписанный state на бэкенде. */
const STATE_MAX_AGE = 10 * 60

/**
 * Старт входа/привязки: получаем у бэкенда URL страницы согласия и подписанный
 * state, кладём state в httpOnly-cookie и уводим браузер к провайдеру.
 * Cookie — защита от CSRF: на возврате `state` из query должен совпасть с ним.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await ctx.params
  const provider = parseProvider(raw)
  if (!provider) {
    return NextResponse.redirect(new URL('/login?error=Неизвестный+сервис+входа', req.url))
  }

  const mode = parseMode(req.nextUrl.searchParams.get('mode'))
  // Привязка возможна только из кабинета: без сессии уводим на вход.
  if (mode === 'link' && !req.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    const { url, state } = await backendPublicGet<{ url: string; state: string }>(
      `/v1/auth/oauth/${provider}/url?mode=${mode}`,
    )
    if (!isAllowedAuthorizeUrl(provider, url)) {
      throw new Error('Некорректный адрес страницы согласия')
    }
    const res = NextResponse.redirect(url)
    res.cookies.set(OAUTH_STATE_COOKIE, packState(mode, state), {
      ...secureCookie,
      maxAge: STATE_MAX_AGE,
    })
    return res
  } catch (e) {
    const dest = mode === 'link' ? '/admin/settings' : '/login'
    const target = new URL(dest, req.url)
    target.searchParams.set('error', safeErrorParam((e as Error).message))
    return NextResponse.redirect(target)
  }
}
