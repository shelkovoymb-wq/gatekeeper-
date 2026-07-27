import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = 'gk_session'

// Защищаем кабинет (/admin/*) и корень. Публично: /login, /register, /api/auth/*, статика.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value)
  const isAuthPage = pathname === '/login' || pathname === '/register'
  const isProtected = pathname === '/' || pathname.startsWith('/admin')

  if (isAuthPage && hasSession) {
    return NextResponse.redirect(new URL('/admin/stats', req.url))
  }
  if (isProtected && !hasSession) {
    const url = new URL('/login', req.url)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/admin/:path*', '/login', '/register'],
}
