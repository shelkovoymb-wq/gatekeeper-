import { cookies } from 'next/headers'

// Серверный клиент к кабинетным эндпоинтам бэкенда (/v1/cabinet, /v1/auth).
// JWT берётся из httpOnly-cookie сессии — в браузер токен не отдаём.
const BACKEND_URL = process.env.BACKEND_URL || 'http://api:3000'
export const SESSION_COOKIE = 'gk_session'

async function sessionToken(): Promise<string> {
  const c = await cookies()
  return c.get(SESSION_COOKIE)?.value || ''
}

export class BackendError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : null) || `Ошибка ${res.status}`
    throw new BackendError(res.status, msg)
  }
  return body
}

export async function cabinetGet<T = unknown>(path: string): Promise<T> {
  const token = await sessionToken()
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  return (await parse(res)) as T
}

export async function cabinetSend<T = unknown>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await sessionToken()
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  return (await parse(res)) as T
}

/**
 * Проброс multipart-загрузки на бэкенд как есть.
 *
 * Тело пересылается байт в байт вместе с исходным Content-Type: пересобирать
 * FormData здесь нельзя — потеряется граница multipart, а вместе с ней и файл.
 */
export async function cabinetUpload<T = unknown>(
  path: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<T> {
  const token = await sessionToken()
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body,
    cache: 'no-store',
  })
  return (await parse(res)) as T
}

// Публичные (без токена) вызовы auth-эндпоинтов бэкенда.
export async function backendAuth<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  return (await parse(res)) as T
}
