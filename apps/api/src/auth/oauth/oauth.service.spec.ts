import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env.js';
import { createFakeDb, type FakeDb } from '../../owner/fake-db.js';
import { OAuthService, statesEqual } from './oauth.service.js';

const baseEnv = {
  PUBLIC_APP_URL: 'https://app.gatekeeper.skud24.ru',
  OAUTH_REDIRECT_BASE_URL: undefined,
  OAUTH_ALLOW_SIGNUP: true,
  GOOGLE_OAUTH_CLIENT_ID: 'google-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-secret',
  YANDEX_OAUTH_CLIENT_ID: 'yandex-id',
  YANDEX_OAUTH_CLIENT_SECRET: 'yandex-secret',
} as unknown as Env;

const jwt = new JwtService({ secret: 'x'.repeat(48) });

/** Ответы Google: сначала token endpoint, потом userinfo. */
function mockGoogle(profile: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = String(url);
    if (href.includes('/token')) return jsonResponse({ access_token: 'at-1' });
    if (href.includes('userinfo')) return jsonResponse(profile);
    throw new Error(`unexpected fetch: ${href}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function makeService(env: Env = baseEnv) {
  const { db, fake } = createFakeDb();
  return { svc: new OAuthService(db, env, jwt), fake };
}

describe('OAuthService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('listProviders', () => {
    it('провайдер включён только когда заданы обе половины пары ключей', () => {
      const { svc } = makeService({
        ...baseEnv,
        YANDEX_OAUTH_CLIENT_SECRET: undefined,
      } as unknown as Env);
      expect(svc.listProviders()).toEqual([
        { provider: 'google', displayName: 'Google', enabled: true },
        { provider: 'yandex', displayName: 'Яндекс', enabled: false },
      ]);
    });

    it('без ключей запрос URL отклоняется, а не уходит к провайдеру', async () => {
      const { svc } = makeService({
        ...baseEnv,
        GOOGLE_OAUTH_CLIENT_ID: undefined,
      } as unknown as Env);
      await expect(svc.buildAuthorizeUrl('google', 'login')).rejects.toThrow(/не настроен/);
    });
  });

  describe('parseProvider', () => {
    it('принимает только известные провайдеры', () => {
      const { svc } = makeService();
      expect(svc.parseProvider('google')).toBe('google');
      expect(svc.parseProvider('yandex')).toBe('yandex');
      for (const bad of ['facebook', 'GOOGLE', '../google', '']) {
        expect(() => svc.parseProvider(bad)).toThrow(/неизвестный провайдер/);
      }
    });
  });

  describe('buildAuthorizeUrl', () => {
    it('redirect_uri берётся из env, а не из запроса (нет открытого редиректа)', async () => {
      const { svc } = makeService();
      const { url, state } = await svc.buildAuthorizeUrl('google', 'login');
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://app.gatekeeper.skud24.ru/api/auth/oauth/google/callback',
      );
      expect(parsed.searchParams.get('client_id')).toBe('google-id');
      expect(parsed.searchParams.get('state')).toBe(state);
      expect(parsed.searchParams.get('prompt')).toBe('select_account');
      // client_secret не должен попадать в браузерный редирект.
      expect(url).not.toContain('google-secret');
    });

    it('для Яндекса формирует свой authorize-URL с force_confirm', async () => {
      const { svc } = makeService();
      const { url } = await svc.buildAuthorizeUrl('yandex', 'login');
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe('https://oauth.yandex.ru/authorize');
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://app.gatekeeper.skud24.ru/api/auth/oauth/yandex/callback',
      );
      expect(parsed.searchParams.get('force_confirm')).toBe('yes');
      expect(url).not.toContain('yandex-secret');
    });

    it('OAUTH_REDIRECT_BASE_URL перекрывает PUBLIC_APP_URL и не двоит слэш', async () => {
      const { svc } = makeService({
        ...baseEnv,
        OAUTH_REDIRECT_BASE_URL: 'https://cabinet.example.com/',
      } as unknown as Env);
      const { url } = await svc.buildAuthorizeUrl('google', 'login');
      expect(new URL(url).searchParams.get('redirect_uri')).toBe(
        'https://cabinet.example.com/api/auth/oauth/google/callback',
      );
    });
  });

  describe('verifyState', () => {
    it('принимает свой свежий state', async () => {
      const { svc } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'login');
      await expect(svc.verifyState('google', state, 'login')).resolves.toBeUndefined();
    });

    it('отвергает пустой, подделанный и чужой по провайдеру/режиму state', async () => {
      const { svc } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'login');

      await expect(svc.verifyState('google', '', 'login')).rejects.toThrow(/state/);
      await expect(svc.verifyState('google', `${state}tampered`, 'login')).rejects.toThrow(/state/);
      // Подписан чужим секретом.
      const foreign = await new JwtService({ secret: 'y'.repeat(48) }).signAsync({
        typ: 'oauth_state',
        p: 'google',
        n: 'n',
        m: 'login',
      });
      await expect(svc.verifyState('google', foreign, 'login')).rejects.toThrow(/state/);
      // Тот же state, но подставлен в другой провайдер / другой режим.
      await expect(svc.verifyState('yandex', state, 'login')).rejects.toThrow(/не соответствует/);
      await expect(svc.verifyState('google', state, 'link')).rejects.toThrow(/не соответствует/);
    });

    it('не принимает access-токен сессии вместо state', async () => {
      const { svc } = makeService();
      const access = await jwt.signAsync({ sub: 'user-1', typ: 'access', role: 'client_admin' });
      await expect(svc.verifyState('google', access, 'login')).rejects.toThrow(/не соответствует/);
    });
  });

  describe('loginWithCode', () => {
    it('без валидного state к провайдеру даже не ходим', async () => {
      const fetchMock = mockGoogle({ sub: '1' });
      const { svc } = makeService();
      await expect(svc.loginWithCode('google', 'code', 'garbage')).rejects.toThrow(/state/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('узнаёт уже привязанный аккаунт и не создаёт новый', async () => {
      mockGoogle({ sub: 'g-1', email: 'user@example.com', email_verified: true, name: 'U' });
      const { svc, fake } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'login');

      fake.queue(
        [{ userId: 'user-1', clientId: 'c-1', role: 'client_admin', email: 'user@example.com', totpEnabled: true }],
        [], // touchIdentity
      );
      const res = await svc.loginWithCode('google', 'code', state);
      expect(res).toMatchObject({ userId: 'user-1', created: false, totpEnabled: true });
      expect(fake.calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('склеивает с существующим аккаунтом ТОЛЬКО при подтверждённой провайдером почте', async () => {
      mockGoogle({ sub: 'g-2', email: 'victim@example.com', email_verified: true });
      const { svc, fake } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'login');

      fake.queue(
        [], // нет привязки
        [{ userId: 'victim', clientId: 'c-9', role: 'client_admin', email: 'victim@example.com', totpEnabled: false }],
        [], // insertIdentity
      );
      const res = await svc.loginWithCode('google', 'code', state);
      expect(res).toMatchObject({ userId: 'victim', created: false });
    });

    it('НЕ склеивает по неподтверждённой почте — иначе это захват чужого аккаунта', async () => {
      mockGoogle({ sub: 'g-3', email: 'victim@example.com', email_verified: false });
      const { svc, fake } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'login');

      // Только «нет привязки»; поиск по email не должен выполняться вовсе —
      // дальше идёт создание нового аккаунта.
      fake.queue(
        [], // нет привязки
        [{ id: 'plan-free' }], // platform_plans free
        [{ id: 'client-new' }], // insert clients
        [{ id: 'user-new' }], // insert client_users
        [], // insertIdentity
      );
      const res = await svc.loginWithCode('google', 'code', state);
      expect(res).toMatchObject({ userId: 'user-new', created: true });
      expect(res.userId).not.toBe('victim');
    });

    it('новый аккаунт создаётся без пароля (вход только через провайдера)', async () => {
      mockGoogle({ sub: 'g-4', email: 'new@example.com', email_verified: true, name: 'Новый Клуб' });
      const { svc, fake } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'login');

      fake.queue([], [], [{ id: 'plan-free' }], [{ id: 'client-new' }], [{ id: 'user-new' }], []);
      await svc.loginWithCode('google', 'code', state);

      // client + user + identity создаются одной транзакцией: упавший insert
      // пользователя не должен оставлять висячий clients.
      expect(fake.calls.some((c) => c.method === 'transaction')).toBe(true)

      const clientValues = fake.argsOf('values', 0) as [Record<string, unknown>];
      expect(clientValues[0]).toMatchObject({ name: 'Новый Клуб', planStatus: 'trialing' });
      const userValues = fake.argsOf('values', 1) as [Record<string, unknown>];
      expect(userValues[0]).toMatchObject({
        email: 'new@example.com',
        role: 'client_admin',
        passwordHash: null,
      });
    });

    it('при OAUTH_ALLOW_SIGNUP=false незнакомый аккаунт не регистрируется', async () => {
      mockGoogle({ sub: 'g-5', email: 'stranger@example.com', email_verified: true });
      const { svc, fake } = makeService({ ...baseEnv, OAUTH_ALLOW_SIGNUP: false } as unknown as Env);
      const { state } = await svc.buildAuthorizeUrl('google', 'login');

      fake.queue([], []);
      await expect(svc.loginWithCode('google', 'code', state)).rejects.toThrow(/отключена/);
    });

    it('ошибку провайдера отдаёт без деталей ответа', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }) as unknown as Response),
      );
      const { svc } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'login');
      await expect(svc.loginWithCode('google', 'code', state)).rejects.toThrow(
        /не удалось подтвердить вход/,
      );
    });

    it('пустой code отклоняется до обращения к провайдеру', async () => {
      const fetchMock = mockGoogle({ sub: 'g-6' });
      const { svc } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'login');
      await expect(svc.loginWithCode('google', '', state)).rejects.toThrow(/code/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('linkToUser', () => {
    it('не даёт привязать аккаунт провайдера, уже занятый другим пользователем', async () => {
      mockGoogle({ sub: 'g-7', email: 'a@example.com', email_verified: true });
      const { svc, fake } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'link');

      fake.queue([{ userId: 'someone-else' }]);
      await expect(svc.linkToUser('google', 'me', 'code', state)).rejects.toThrow(/уже привязан/);
    });

    it('повторная привязка того же аккаунта идемпотентна', async () => {
      mockGoogle({ sub: 'g-8', email: 'a@example.com', email_verified: true });
      const { svc, fake } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'link');

      fake.queue([{ userId: 'me' }]);
      await expect(svc.linkToUser('google', 'me', 'code', state)).resolves.toMatchObject({
        provider: 'google',
      });
      expect(fake.calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('state с mode=login не годится для привязки', async () => {
      const fetchMock = mockGoogle({ sub: 'g-9' });
      const { svc } = makeService();
      const { state } = await svc.buildAuthorizeUrl('google', 'login');
      await expect(svc.linkToUser('google', 'me', 'code', state)).rejects.toThrow(/не соответствует/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('unlink', () => {
    it('не даёт отвязать единственный способ входа', async () => {
      const { svc, fake } = makeService();
      fake.queue([{ passwordHash: null }], [{ provider: 'google' }]);
      await expect(svc.unlink('user-1', 'google')).rejects.toThrow(/единственный способ входа/);
    });

    it('разрешает отвязку, если остаётся пароль', async () => {
      const { svc, fake } = makeService();
      fake.queue([{ passwordHash: 'scrypt$aa$bb' }], [{ provider: 'google' }], []);
      await expect(svc.unlink('user-1', 'google')).resolves.toEqual({ ok: true });
    });

    it('разрешает отвязку, если остаётся другой провайдер', async () => {
      const { svc, fake } = makeService();
      fake.queue([{ passwordHash: null }], [{ provider: 'google' }, { provider: 'yandex' }], []);
      await expect(svc.unlink('user-1', 'google')).resolves.toEqual({ ok: true });
    });

    it('отвязка непривязанного провайдера — no-op, без обращения к delete', async () => {
      const { svc, fake } = makeService();
      fake.queue([{ passwordHash: 'scrypt$aa$bb' }], [{ provider: 'yandex' }]);
      await expect(svc.unlink('user-1', 'google')).resolves.toEqual({ ok: true });
      expect(fake.calls.some((c) => c.method === 'delete')).toBe(false);
    });
  });
});

describe('statesEqual', () => {
  it('сравнивает строки и не падает на разной длине', () => {
    expect(statesEqual('abc', 'abc')).toBe(true);
    expect(statesEqual('abc', 'abd')).toBe(false);
    expect(statesEqual('abc', 'abcd')).toBe(false);
    expect(statesEqual('', '')).toBe(false);
    expect(statesEqual('', 'abc')).toBe(false);
  });
});
