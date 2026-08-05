import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = 'gk_session'

/** Небезопасное чтение роли из JWT только для маршрутизации UX.
 *  Реальную авторизацию обеспечивает бэкенд (guard проверяет подпись). */
function roleFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    )
    return typeof json.role === 'string' ? json.role : null
  } catch {
    return null
  }
}

// Защищаем кабинет клиента (/admin/*) и панель владельца (/owner/*).
// Публично: '/' (лендинг), /login, /register, /api/auth/*, статика.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const hasSession = Boolean(token)
  const role = token ? roleFromToken(token) : null
  const home = role === 'owner' ? '/owner/overview' : '/admin/stats'

  const isAuthPage = pathname === '/login' || pathname === '/register'
  const isProtected = pathname.startsWith('/admin') || pathname.startsWith('/owner')

  if (isAuthPage && hasSession) {
    return NextResponse.redirect(new URL(home, req.url))
  }
  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  // Корень → домашняя страница по роли.
  if (pathname === '/' && hasSession) {
    return NextResponse.redirect(new URL(home, req.url))
  }
  // Владелец платформы не должен сидеть в клиентском кабинете и наоборот.
  if (hasSession && role === 'owner' && pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/owner/overview', req.url))
  }
  if (hasSession && role && role !== 'owner' && pathname.startsWith('/owner')) {
    return NextResponse.redirect(new URL('/admin/stats', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/admin/:path*', '/owner/:path*', '/login', '/register'],
}
