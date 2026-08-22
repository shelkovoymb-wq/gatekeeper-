import { NextRequest, NextResponse } from 'next/server'
import {
  backendAuth,
  BackendError,
  secureCookie,
  SESSION_COOKIE,
  type BackendSession,
} from '@/lib/cabinet'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  try {
    const data = (await backendAuth('/v1/auth/register', body)) as BackendSession
    const res = NextResponse.json({ success: true, user: data.user })
    res.cookies.set(SESSION_COOKIE, data.token, { ...secureCookie, maxAge: 60 * 60 * 24 * 7 })
    return res
  } catch (e) {
    const status = e instanceof BackendError ? e.status : 400
    return NextResponse.json({ success: false, error: (e as Error).message }, { status })
  }
}
