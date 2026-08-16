// Модуль изоморфный: его тянут и route handlers, и клиентские компоненты
// (за списком провайдеров и подписями кнопок). Ничего из node:* здесь быть не
// должно — серверная часть живёт в `oauth-server.ts`.

/** Закрытый список — строка из URL никогда не идёт к бэкенду как есть. */
export const OAUTH_PROVIDERS = ['google', 'yandex'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

export const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  yandex: 'Яндекс',
}

export function parseProvider(raw: string): OAuthProvider | null {
  return (OAUTH_PROVIDERS as readonly string[]).includes(raw) ? (raw as OAuthProvider) : null
}

/**
 * Куда вообще разрешено редиректить браузер на старте потока. URL приходит от
 * нашего же бэкенда, но это единственное место, где мы уводим пользователя на
 * внешний хост, — сверяем явно, чтобы никакая ошибка конфигурации не
 * превратилась в открытый редирект.
 */
const AUTHORIZE_HOSTS: Record<OAuthProvider, string> = {
  google: 'accounts.google.com',
  yandex: 'oauth.yandex.ru',
}

export function isAllowedAuthorizeUrl(provider: OAuthProvider, url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === AUTHORIZE_HOSTS[provider]
  } catch {
    return false
  }
}

export type OAuthMode = 'login' | 'link'

export function parseMode(raw: string | null | undefined): OAuthMode {
  return raw === 'link' ? 'link' : 'login'
}

/**
 * В cookie кладём режим и state вместе: на возврате от провайдера иначе
 * непонятно, вход это был или привязка к уже существующему аккаунту.
 * Разделитель `:` безопасен — state это JWT (base64url + точки).
 */
export function packState(mode: OAuthMode, state: string): string {
  return `${mode}:${state}`
}

export function unpackState(raw: string | undefined): { mode: OAuthMode; state: string } | null {
  if (!raw) return null
  const sep = raw.indexOf(':')
  if (sep <= 0) return null
  const mode = raw.slice(0, sep)
  const state = raw.slice(sep + 1)
  if ((mode !== 'login' && mode !== 'link') || !state) return null
  return { mode, state }
}

/**
 * Текст ошибки в query-параметре редиректа. Обрезаем и выкидываем перевод
 * строки: значение попадает в заголовок Location, а длинные/переносные
 * строки там ни к чему.
 */
export function safeErrorParam(message: string): string {
  return message.replace(/[\r\n]+/g, ' ').slice(0, 200)
}
