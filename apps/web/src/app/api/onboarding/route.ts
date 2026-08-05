import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/cabinet'

// Публичный чат на главной странице: пробрасывает диалог на бэкенд без обязательной
// авторизации. Если в ходе диалога происходит регистрация — бэкенд возвращает token,
// который мы сохраняем в httpOnly-cookie сессии кабинета и вырезаем из ответа браузеру.
const BACKEND_URL = process.env.BACKEND_URL || 'http://api:3000'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const jar = await cookies()
  const existingToken = jar.get(SESSION_COOKIE)?.value

  try {
    const res = await fetch(`${BACKEND_URL}/v1/public/onboarding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(existingToken ? { Authorization: `Bearer ${existingToken}` } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const data = (await res.json().catch(() => ({}))) as {
      reply?: string
      mode?: string
      stateChanged?: boolean
      token?: string
    }
    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'Ошибка связи с ассистентом' }, { status: 502 })
    }

    // token в браузер не отдаём — только используем его, чтобы завести httpOnly-cookie сессии.
    const { token, ...safeData } = data
    const out = NextResponse.json({ success: true, data: { ...safeData, registered: Boolean(token) } })
    if (token) {
      out.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      })
    }
    return out
  } catch {
    return NextResponse.json({ success: false, error: 'Ошибка связи с сервером' }, { status: 502 })
  }
}
