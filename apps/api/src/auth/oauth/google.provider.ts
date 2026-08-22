/**
 * Google OAuth 2.0 / OpenID Connect.
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server
 */
import {
  getJson,
  postForm,
  type OAuthClientConfig,
  type OAuthProfile,
  type OAuthProviderAdapter,
} from './oauth.types.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

interface GoogleTokenResponse {
  access_token?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export const googleProvider: OAuthProviderAdapter = {
  provider: 'google',
  displayName: 'Google',

  authorizeUrl(cfg: OAuthClientConfig, redirectUri: string, state: string): string {
    const q = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      // Всегда показываем выбор аккаунта: иначе Google молча логинит
      // «последнего» и с чужого компьютера уйти из аккаунта невозможно.
      prompt: 'select_account',
    });
    return `${AUTHORIZE_URL}?${q.toString()}`;
  },

  async fetchProfile(
    cfg: OAuthClientConfig,
    code: string,
    redirectUri: string,
  ): Promise<OAuthProfile> {
    const token = await postForm<GoogleTokenResponse>(
      TOKEN_URL,
      {
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      'google',
    );
    if (!token.access_token) throw new Error('google: no access_token in response');

    const info = await getJson<GoogleUserInfo>(
      USERINFO_URL,
      { Authorization: `Bearer ${token.access_token}` },
      'google',
    );
    if (!info.sub) throw new Error('google: userinfo without sub');

    return {
      provider: 'google',
      providerUserId: String(info.sub),
      email: info.email ? info.email.trim().toLowerCase() : null,
      emailVerified: info.email_verified === true,
      displayName: info.name ?? null,
      avatarUrl: info.picture ?? null,
    };
  },
};
