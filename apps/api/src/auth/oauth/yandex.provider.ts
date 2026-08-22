/**
 * Яндекс OAuth 2.0 + Яндекс.Паспорт (login.yandex.ru/info).
 * Docs: https://yandex.ru/dev/id/doc/ru/codes/code-url
 *       https://yandex.ru/dev/id/doc/ru/user-information
 */
import {
  getJson,
  postForm,
  type OAuthClientConfig,
  type OAuthProfile,
  type OAuthProviderAdapter,
} from './oauth.types.js';

const AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const TOKEN_URL = 'https://oauth.yandex.ru/token';
const USERINFO_URL = 'https://login.yandex.ru/info?format=json';

interface YandexTokenResponse {
  access_token?: string;
}

interface YandexUserInfo {
  id?: string;
  login?: string;
  default_email?: string;
  emails?: string[];
  display_name?: string;
  real_name?: string;
  is_avatar_empty?: boolean;
  default_avatar_id?: string;
}

export const yandexProvider: OAuthProviderAdapter = {
  provider: 'yandex',
  displayName: 'Яндекс',

  authorizeUrl(cfg: OAuthClientConfig, redirectUri: string, state: string): string {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      state,
      // Аналог prompt=select_account у Google: не переиспользовать молча
      // ранее выданное разрешение на чужой машине.
      force_confirm: 'yes',
    });
    return `${AUTHORIZE_URL}?${q.toString()}`;
  },

  async fetchProfile(
    cfg: OAuthClientConfig,
    code: string,
    redirectUri: string,
  ): Promise<OAuthProfile> {
    const token = await postForm<YandexTokenResponse>(
      TOKEN_URL,
      {
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
      },
      'yandex',
    );
    if (!token.access_token) throw new Error('yandex: no access_token in response');

    // Паспорт требует именно схему «OAuth», а не «Bearer».
    const info = await getJson<YandexUserInfo>(
      USERINFO_URL,
      { Authorization: `OAuth ${token.access_token}` },
      'yandex',
    );
    if (!info.id) throw new Error('yandex: userinfo without id');

    const email = info.default_email ?? info.emails?.[0] ?? null;
    return {
      provider: 'yandex',
      providerUserId: String(info.id),
      email: email ? email.trim().toLowerCase() : null,
      // Почта в Паспорте всегда подтверждена владельцем аккаунта — отдельного
      // флага у API нет, поэтому считаем подтверждённой только адрес из
      // default_email (привязанный к аккаунту), но не произвольный из списка.
      emailVerified: Boolean(info.default_email),
      displayName: info.display_name ?? info.real_name ?? info.login ?? null,
      avatarUrl:
        info.default_avatar_id && info.is_avatar_empty !== true
          ? `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`
          : null,
    };
  },
};
