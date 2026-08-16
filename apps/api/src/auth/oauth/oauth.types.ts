/** Провайдеры внешнего входа. Список закрытый — строка из запроса всегда сверяется с ним. */
export const OAUTH_PROVIDERS = ['google', 'yandex'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(v: string): v is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(v);
}

/** Нормализованный профиль — то общее, что нам нужно от любого провайдера. */
export interface OAuthProfile {
  provider: OAuthProvider;
  /** Стабильный идентификатор у провайдера (google `sub`, yandex `id`). */
  providerUserId: string;
  email: string | null;
  /** Провайдер подтвердил владение почтой. Без этого почту нельзя использовать
   *  для автоматической склейки с существующим аккаунтом. */
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface OAuthProviderAdapter {
  readonly provider: OAuthProvider;
  readonly displayName: string;
  /** URL страницы согласия провайдера. */
  authorizeUrl(cfg: OAuthClientConfig, redirectUri: string, state: string): string;
  /** code → нормализованный профиль (обмен кода на токен + запрос userinfo). */
  fetchProfile(cfg: OAuthClientConfig, code: string, redirectUri: string): Promise<OAuthProfile>;
}

/** Ошибка обмена/запроса к провайдеру. Наружу отдаём без тела ответа провайдера. */
export class OAuthExchangeError extends Error {
  constructor(
    message: string,
    readonly provider: OAuthProvider,
  ) {
    super(message);
    this.name = 'OAuthExchangeError';
  }
}

/** Общий helper: POST form-urlencoded с таймаутом и разбором JSON. */
export async function postForm<T>(
  url: string,
  body: Record<string, string>,
  provider: OAuthProvider,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    throw new OAuthExchangeError(`token endpoint ${res.status}`, provider);
  }
  return (await res.json()) as T;
}

export async function getJson<T>(
  url: string,
  headers: Record<string, string>,
  provider: OAuthProvider,
): Promise<T> {
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', ...headers } });
  if (!res.ok) {
    throw new OAuthExchangeError(`userinfo endpoint ${res.status}`, provider);
  }
  return (await res.json()) as T;
}

/** Провайдер не должен подвешивать наш воркер: 10 секунд и обрыв. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
