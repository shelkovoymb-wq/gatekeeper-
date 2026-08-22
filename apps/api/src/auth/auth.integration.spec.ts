/**
 * Интеграционные тесты аутентификации на ЖИВОЙ базе: проверяют то, чего не
 * видно на моках, — что колонки 2FA реально есть в схеме, что jsonb с
 * резервными кодами читается обратно массивом, что уникальные индексы на
 * user_identities работают.
 *
 * Запуск (миграции должны быть применены):
 *   TEST_DATABASE_URL=postgres://gatekeeper:gatekeeper@localhost:5432/gatekeeper \
 *     pnpm --filter @gatekeeper/api test
 * Без TEST_DATABASE_URL блок пропускается, чтобы обычный прогон не требовал БД.
 */
import { Test, type TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { CryptoModule } from '../common/crypto.module.js';
import { ConfigModule } from '../config/config.module.js';
import { DB, DbModule, type Database } from '../db/db.module.js';
import { clientUsers, userIdentities } from '../db/schema.js';
import { AuthModule } from './auth.module.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OAuthService } from './oauth/oauth.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { totp, TOTP_PERIOD_SEC } from './totp.js';
import { isTwoFactorChallenge } from './auth.types.js';

const DB_URL = process.env.TEST_DATABASE_URL;

/** Минимальный набор env, который требует zod-схема конфигурации. */
function applyTestEnv(url: string) {
  process.env.DATABASE_URL = url;
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.PUBLIC_API_URL ??= 'https://api.test.local';
  process.env.PUBLIC_APP_URL ??= 'https://app.test.local';
  process.env.SECRET_ENCRYPTION_KEY ??= Buffer.alloc(32, 3).toString('base64');
  process.env.JWT_SECRET ??= 'j'.repeat(48);
  process.env.GOOGLE_OAUTH_CLIENT_ID ??= 'test-google-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET ??= 'test-google-secret';
}

/** Заглушка ExecutionContext: guard читает только заголовки запроса. */
function ctxWithToken(token: string): ExecutionContext {
  const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe.skipIf(!DB_URL)('auth (интеграция с Postgres)', () => {
  let moduleRef: TestingModule;
  let auth: AuthService;
  let twoFactor: TwoFactorService;
  let oauth: OAuthService;
  let guard: JwtAuthGuard;
  let db: Database;
  const createdUserIds: string[] = [];

  const email = () => `test-${randomUUID()}@example.com`;

  beforeAll(async () => {
    applyTestEnv(DB_URL as string);
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DbModule, CryptoModule, AuthModule],
    }).compile();
    auth = moduleRef.get(AuthService);
    twoFactor = moduleRef.get(TwoFactorService);
    oauth = moduleRef.get(OAuthService);
    guard = moduleRef.get(JwtAuthGuard);
    db = moduleRef.get(DB);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await db.delete(userIdentities).where(eq(userIdentities.userId, id));
      await db.delete(clientUsers).where(eq(clientUsers.id, id));
    }
    await moduleRef?.close();
  });

  async function newAccount(password = 'super-secret-1') {
    const res = await auth.register({ email: email(), password, companyName: 'Тестовый клуб' });
    if (isTwoFactorChallenge(res)) throw new Error('register не должен требовать 2FA');
    createdUserIds.push(res.user.id);
    return res;
  }

  it('регистрация выдаёт рабочую сессию, а /me видит её без 2FA', async () => {
    const res = await newAccount();
    expect(res.token).toBeTruthy();
    await expect(guard.canActivate(ctxWithToken(res.token))).resolves.toBe(true);

    const me = await auth.me({
      userId: res.user.id,
      clientId: res.user.clientId,
      role: res.user.role,
      email: res.user.email,
    });
    expect(me).toMatchObject({ twoFactorEnabled: false, hasPassword: true, identities: [] });
  });

  it('полный цикл: включение 2FA → вход отдаёт челлендж → код открывает сессию', async () => {
    const account = await newAccount();
    const userEmail = account.user.email as string;

    const setup = await twoFactor.beginSetup(account.user.id);
    expect(setup.otpauthUrl).toContain('otpauth://totp/');

    // Пока код не подтверждён — вход остаётся однофакторным.
    const beforeConfirm = await auth.login(userEmail, 'super-secret-1');
    expect(isTwoFactorChallenge(beforeConfirm)).toBe(false);

    const { backupCodes } = await twoFactor.confirmSetup(account.user.id, totp(setup.secret));
    expect(backupCodes).toHaveLength(10);

    const challenged = await auth.login(userEmail, 'super-secret-1');
    if (!isTwoFactorChallenge(challenged)) throw new Error('ожидался челлендж 2FA');
    expect(challenged.methods).toEqual(['totp', 'backup_code']);

    // Челлендж-токен НЕ должен открывать кабинет.
    await expect(guard.canActivate(ctxWithToken(challenged.challengeToken))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const userId = await auth.consumeChallenge(challenged.challengeToken);
    // Код текущего окна уже израсходован на confirmSetup — берём следующий:
    // повтор одного и того же кода не проходит по построению (см. тест ниже).
    await twoFactor.verifyLogin(userId, totp(setup.secret, Date.now() + TOTP_PERIOD_SEC * 1000));
    const session = await auth.issueSessionFor(userId);
    await expect(guard.canActivate(ctxWithToken(session.token))).resolves.toBe(true);
  });

  it('один и тот же TOTP-код не проходит дважды', async () => {
    const account = await newAccount();
    const setup = await twoFactor.beginSetup(account.user.id);
    await twoFactor.confirmSetup(account.user.id, totp(setup.secret));

    const code = totp(setup.secret);
    // confirmSetup уже записал шаг этого окна, поэтому тот же код отвергается.
    await expect(twoFactor.verifyLogin(account.user.id, code)).rejects.toThrow(/неверный код/);
  });

  it('резервный код срабатывает ровно один раз и исчезает из базы', async () => {
    const account = await newAccount();
    const setup = await twoFactor.beginSetup(account.user.id);
    const { backupCodes } = await twoFactor.confirmSetup(account.user.id, totp(setup.secret));

    await expect(twoFactor.verifyLogin(account.user.id, backupCodes[0])).resolves.toBeUndefined();
    expect((await twoFactor.status(account.user.id)).backupCodesLeft).toBe(9);
    await expect(twoFactor.verifyLogin(account.user.id, backupCodes[0])).rejects.toThrow();
  });

  it('секрет в базе лежит зашифрованным', async () => {
    const account = await newAccount();
    const setup = await twoFactor.beginSetup(account.user.id);
    const [row] = await db
      .select({ enc: clientUsers.totpSecretEnc })
      .from(clientUsers)
      .where(eq(clientUsers.id, account.user.id));
    expect(row.enc).toBeTruthy();
    expect(row.enc).not.toContain(setup.secret);
  });

  it('выключение 2FA стирает секрет и резервные коды', async () => {
    const account = await newAccount();
    const setup = await twoFactor.beginSetup(account.user.id);
    await twoFactor.confirmSetup(account.user.id, totp(setup.secret));

    await twoFactor.disable(account.user.id, { password: 'super-secret-1' });
    const [row] = await db
      .select({
        enc: clientUsers.totpSecretEnc,
        enabled: clientUsers.totpEnabled,
        codes: clientUsers.totpBackupCodes,
      })
      .from(clientUsers)
      .where(eq(clientUsers.id, account.user.id));
    expect(row).toMatchObject({ enc: null, enabled: false, codes: [] });
  });

  it('внешний аккаунт нельзя привязать к двум пользователям (уникальный индекс)', async () => {
    const a = await newAccount();
    const b = await newAccount();
    const providerUserId = `g-${randomUUID()}`;

    await db
      .insert(userIdentities)
      .values({ userId: a.user.id, provider: 'google', providerUserId });
    await expect(
      db.insert(userIdentities).values({ userId: b.user.id, provider: 'google', providerUserId }),
    ).rejects.toThrow();

    expect(await oauth.listIdentities(a.user.id)).toHaveLength(1);
  });

  it('нельзя отвязать единственный способ входа у аккаунта без пароля', async () => {
    const a = await newAccount();
    await db.update(clientUsers).set({ passwordHash: null }).where(eq(clientUsers.id, a.user.id));
    await db
      .insert(userIdentities)
      .values({ userId: a.user.id, provider: 'yandex', providerUserId: `y-${randomUUID()}` });

    await expect(oauth.unlink(a.user.id, 'yandex')).rejects.toThrow(/единственный способ входа/);

    // Пароль установлен — теперь отвязка разрешена.
    await auth.changePassword(a.user.id, '', 'another-secret-1');
    await expect(oauth.unlink(a.user.id, 'yandex')).resolves.toEqual({ ok: true });
    expect(await oauth.listIdentities(a.user.id)).toHaveLength(0);
  });

  it('вход по паролю невозможен, пока пароль не задан (OAuth-аккаунт)', async () => {
    const a = await newAccount();
    const userEmail = a.user.email as string;
    await db.update(clientUsers).set({ passwordHash: null }).where(eq(clientUsers.id, a.user.id));
    await expect(auth.login(userEmail, 'super-secret-1')).rejects.toThrow(/неверный email или пароль/);
  });
});
