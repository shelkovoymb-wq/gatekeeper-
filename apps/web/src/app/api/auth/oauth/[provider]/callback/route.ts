import { NextRequest, NextResponse } from 'next/server'
import {
  backendAuth,
  BackendError,
  cabinetSend,
  homeForRole,
  isTwoFactorChallenge,
  OAUTH_STATE_COOKIE,
  secureCookie,
  SESSION_COOKIE,
  TWO_FACTOR_COOKIE,
  type BackendSession,
  type BackendTwoFactorChallenge,
} from '@/lib/cabinet'
import { parseProvider, safeErrorParam, unpackState } from '@/lib/oauth'
import { statesEqual } from '@/lib/oauth-server'

const CHALLENGE_MAX_AGE = 5 * 60

/**
 * Возврат от Google/Яндекса. Обрабатываем здесь, а не в API, чтобы токен
 * сессии сразу лёг в httpOnly-cookie и ни секунды не пожил в адресной строке.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await ctx.params
  const provider = parseProvider(raw)
  const cookieState = unpackState(req.cookies.get(OAUTH_STATE_COOKIE)?.value)
  const mode = cookieState?.mode ?? 'login'
  const failDest = mode === 'link' ? '/admin/settings' : '/login'

  if (!provider) return fail(req, failDest, 'Неизвестный сервис входа')

  // Пользователь нажал «Отмена» на странице согласия — это не ошибка.
  const providerError = req.nextUrl.searchParams.get('error')
  if (providerError) {
    return fail(req, failDest, providerError === 'access_denied' ? 'Вход отменён' : 'Сервис входа отклонил запрос')
  }

  const code = req.nextUrl.searchParams.get('code') ?? ''
  const state = req.nextUrl.searchParams.get('state') ?? ''
  if (!code) return fail(req, failDest, 'Сервис входа не передал код авторизации')

  // CSRF: state из редиректа обязан совпасть с тем, что мы положили в cookie.
  if (!cookieState || !statesEqual(cookieState.state, state)) {
    return fail(req, failDest, 'Проверка безопасности не пройдена — начните вход заново')
  }

  try {
    const res =
      mode === 'link'
        ? await handleLink(req, provider, code, state)
        : await handleLogin(req, provider, code, state)
    // state одноразовый: гасим сразу, повторно тот же редирект не сработает.
    res.cookies.set(OAUTH_STATE_COOKIE, '', { ...secureCookie, maxAge: 0 })
    return res
  } catch (e) {
    const message = e instanceof BackendError ? e.message : 'Не удалось завершить вход'
    return fail(req, failDest, message)
  }
}

async function handleLogin(
  req: NextRequest,
  provider: string,
  code: string,
  state: string,
): Promise<NextResponse> {
  const data = (await backendAuth(`/v1/auth/oauth/${provider}/callback`, { code, state })) as
    | (BackendSession & { created?: boolean })
    | BackendTwoFactorChallenge

  // 2FA обязательна и при входе через провайдера.
  if (isTwoFactorChallenge(data)) {
    const res = NextResponse.redirect(new URL('/login?2fa=1', req.url))
    res.cookies.set(TWO_FACTOR_COOKIE, data.challengeToken, {
      ...secureCookie,
      maxAge: CHALLENGE_MAX_AGE,
    })
    return res
  }

  // Новичка ведём сразу в настройки — там подключение бота и платежей.
  const dest = data.created ? '/admin/settings?welcome=1' : homeForRole(data.user?.role)
  const res = NextResponse.redirect(new URL(dest, req.url))
  res.cookies.set(SESSION_COOKIE, data.token, { ...secureCookie, maxAge: 60 * 60 * 24 * 7 })
  res.cookies.set(TWO_FACTOR_COOKIE, '', { ...secureCookie, maxAge: 0 })
  return res
}

async function handleLink(
  req: NextRequest,
  provider: string,
  code: string,
  state: string,
): Promise<NextResponse> {
  await cabinetSend('POST', `/v1/auth/oauth/${provider}/link`, { code, state })
  const target = new URL('/admin/settings', req.url)
  target.searchParams.set('linked', provider)
  return NextResponse.redirect(target)
}

/** Ошибку показываем на нашей же странице — только внутренние адреса. */
function fail(req: NextRequest, dest: string, message: string): NextResponse {
  const target = new URL(dest, req.url)
  target.searchParams.set('error', safeErrorParam(message))
  const res = NextResponse.redirect(target)
  res.cookies.set(OAUTH_STATE_COOKIE, '', { ...secureCookie, maxAge: 0 })
  return res
}
