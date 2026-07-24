// Серверный клиент к реальному бэкенду Gatekeeper. Используется только в
// route handlers (сервер-сайд) — токен не попадает в браузер.
const BACKEND_URL = process.env.BACKEND_URL || 'http://api:3000'
const TOKEN = process.env.GATEKEEPER_API_TOKEN || ''

export async function backendGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`backend GET ${path} → ${res.status}`)
  }
  return (await res.json()) as T
}

export async function backendPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`backend POST ${path} → ${res.status}`)
  }
  return (await res.json()) as T
}
