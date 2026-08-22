/**
 * Вход и привязка аккаунта через внешних провайдеров (Google, Яндекс).
 *
 * Схема потока (redirect обрабатывает BFF на Next.js, не сам API):
 *   браузер → BFF /api/auth/oauth/:provider/start
 *           → API GET /v1/auth/oauth/:provider/url   (даёт URL + подписанный state)
 *           → провайдер → BFF /api/auth/oauth/:provider/callback?code&state
 *           → API POST /v1/auth/oauth/:provider/callback {code, state}
 * Секреты провайдеров живут только в API и в браузер не попадают.
 */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { DB, type Database } from '../../db/db.module.js';
import { clients, clientUsers, platformPlans, userIdentities } from '../../db/schema.js';
import { googleProvider } from './google.provider.js';
import { yandexProvider } from './yandex.provider.js';
import {
  isOAuthProvider,
  OAUTH_PROVIDERS,
  type OAuthClientConfig,
  type OAuthProfile,
  type OAuthProvider,
  type OAuthProviderAdapter,
} from './oauth.types.js';

const ADAPTERS: Record<OAuthProvider, OAuthProviderAdapter> = {
  google: googleProvider,
  yandex: yandexProvider,
};

/** Полезная нагрузка подписанного state — второй рубеж поверх cookie в BFF. */
interface OAuthStatePayload {
  typ: 'oauth_state';
  p: OAuthProvider;
  n: string;
  m: 'login' | 'link';
}

export interface ResolvedIdentity {
  userId: string;
  clientId: string | null;
  role: string;
  email: string | null;
  totpEnabled: boolean;
  /** Аккаунт создан прямо сейчас — BFF ведёт такого пользователя в онбординг. */
  created: boolean;
}

@Injectable()
export class OAuthService {
  private readonly log = new Logger(OAuthService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  /** Провайдеры, у которых заданы обе половины пары ключей. */
  listProviders(): { provider: OAuthProvider; displayName: string; enabled: boolean }[] {
    return OAUTH_PROVIDERS.map((p) => ({
      provider: p,
      displayName: ADAPTERS[p].displayName,
      enabled: this.clientConfig(p) !== null,
    }));
  }

  isEnabled(provider: OAuthProvider): boolean {
    return this.clientConfig(provider) !== null;
  }

  parseProvider(raw: string): OAuthProvider {
    if (!isOAuthProvider(raw)) throw new BadRequestException('неизвестный провайдер');
    return raw;
  }

  /** URL страницы согласия + подписанный state, который BFF кладёт в cookie. */
  async buildAuthorizeUrl(
    provider: OAuthProvider,
    mode: 'login' | 'link',
  ): Promise<{ url: string; state: string }> {
    const cfg = this.requireConfig(provider);
    const state = await this.jwt.signAsync(
      { typ: 'oauth_state', p: provider, n: randomUUID(), m: mode } satisfies OAuthStatePayload,
      { expiresIn: '10m' },
    );
    return { url: ADAPTERS[provider].authorizeUrl(cfg, this.redirectUri(provider), state), state };
  }

  /** Проверка state: подпись, срок, совпадение провайдера и режима. */
  async verifyState(provider: OAuthProvider, state: string, mode: 'login' | 'link'): Promise<void> {
    if (!state) throw new UnauthorizedException('отсутствует state');
    let payload: OAuthStatePayload;
    try {
      payload = await this.jwt.verifyAsync<OAuthStatePayload>(state);
    } catch {
      throw new UnauthorizedException('state недействителен или истёк');
    }
    if (payload.typ !== 'oauth_state' || payload.p !== provider || payload.m !== mode) {
      throw new UnauthorizedException('state не соответствует запросу');
    }
  }

  /**
   * Вход/регистрация по коду авторизации.
   * Возвращает пользователя; 2FA (если включена) проверяет вызывающий.
   */
  async loginWithCode(provider: OAuthProvider, code: string, state: string): Promise<ResolvedIdentity> {
    await this.verifyState(provider, state, 'login');
    const profile = await this.fetchProfile(provider, code);

    const linked = await this.findByIdentity(profile);
    if (linked) {
      await this.touchIdentity(profile);
      return { ...linked, created: false };
    }

    // Есть аккаунт с такой же ПОДТВЕРЖДЁННОЙ почтой — привязываем к нему.
    // Без подтверждения почты провайдером это был бы захват чужого аккаунта.
    if (profile.email && profile.emailVerified) {
      const existing = await this.findByEmail(profile.email);
      if (existing) {
        await this.insertIdentity(existing.userId, profile);
        return { ...existing, created: false };
      }
    }

    if (!this.env.OAUTH_ALLOW_SIGNUP) {
      throw new ForbiddenException(
        'регистрация через внешние сервисы отключена — войдите по паролю и привяжите аккаунт в настройках',
      );
    }
    if (!profile.email) {
      throw new BadRequestException(
        'провайдер не передал email — разрешите доступ к почте или зарегистрируйтесь по паролю',
      );
    }
    const created = await this.createUserFromProfile(profile);
    return { ...created, created: true };
  }

  /** Привязка провайдера к уже авторизованному пользователю. */
  async linkToUser(
    provider: OAuthProvider,
    userId: string,
    code: string,
    state: string,
  ): Promise<{ provider: OAuthProvider; email: string | null }> {
    await this.verifyState(provider, state, 'link');
    const profile = await this.fetchProfile(provider, code);

    const [taken] = await this.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.provider, profile.provider),
          eq(userIdentities.providerUserId, profile.providerUserId),
        ),
      )
      .limit(1);
    if (taken && taken.userId !== userId) {
      throw new BadRequestException('этот аккаунт уже привязан к другому пользователю');
    }
    if (!taken) await this.insertIdentity(userId, profile);
    return { provider: profile.provider, email: profile.email };
  }

  async listIdentities(userId: string) {
    return this.db
      .select({
        provider: userIdentities.provider,
        email: userIdentities.email,
        displayName: userIdentities.displayName,
        createdAt: userIdentities.createdAt,
        lastLoginAt: userIdentities.lastLoginAt,
      })
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId));
  }

  /**
   * Отвязка. Запрещаем убирать последний способ входа — иначе пользователь
   * запрёт сам себя (у OAuth-аккаунтов пароля нет вовсе).
   */
  async unlink(userId: string, provider: OAuthProvider): Promise<{ ok: true }> {
    const [user] = await this.db
      .select({ passwordHash: clientUsers.passwordHash })
      .from(clientUsers)
      .where(eq(clientUsers.id, userId))
      .limit(1);
    if (!user) throw new UnauthorizedException('пользователь не найден');

    const identities = await this.db
      .select({ provider: userIdentities.provider })
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId));

    const hasThis = identities.some((i) => i.provider === provider);
    if (!hasThis) return { ok: true };
    if (!user.passwordHash && identities.length <= 1) {
      throw new BadRequestException(
        'это единственный способ входа — сначала задайте пароль или привяжите другой сервис',
      );
    }

    await this.db
      .delete(userIdentities)
      .where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, provider)));
    return { ok: true };
  }

  // ─── внутреннее ───────────────────────────────────────────────────────────

  private async fetchProfile(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
    if (!code || typeof code !== 'string') throw new BadRequestException('отсутствует code');
    const cfg = this.requireConfig(provider);
    try {
      return await ADAPTERS[provider].fetchProfile(cfg, code, this.redirectUri(provider));
    } catch (e) {
      // Ответ провайдера может содержать наши же client_secret/токены — в лог
      // и тем более наружу отдаём только тип ошибки.
      this.log.warn(`oauth ${provider}: обмен кода не удался: ${(e as Error).message}`);
      throw new ServiceUnavailableException('не удалось подтвердить вход через провайдера');
    }
  }

  private clientConfig(provider: OAuthProvider): OAuthClientConfig | null {
    const id =
      provider === 'google' ? this.env.GOOGLE_OAUTH_CLIENT_ID : this.env.YANDEX_OAUTH_CLIENT_ID;
    const secret =
      provider === 'google'
        ? this.env.GOOGLE_OAUTH_CLIENT_SECRET
        : this.env.YANDEX_OAUTH_CLIENT_SECRET;
    if (!id || !secret) return null;
    return { clientId: id, clientSecret: secret };
  }

  private requireConfig(provider: OAuthProvider): OAuthClientConfig {
    const cfg = this.clientConfig(provider);
    if (!cfg) throw new ServiceUnavailableException(`вход через ${provider} не настроен`);
    return cfg;
  }

  /** redirect_uri считаем сами из env — значение из запроса приняли бы открытый редирект. */
  private redirectUri(provider: OAuthProvider): string {
    const base = (this.env.OAUTH_REDIRECT_BASE_URL ?? this.env.PUBLIC_APP_URL).replace(/\/+$/, '');
    return `${base}/api/auth/oauth/${provider}/callback`;
  }

  private async findByIdentity(profile: OAuthProfile): Promise<Omit<ResolvedIdentity, 'created'> | null> {
    const [row] = await this.db
      .select({
        userId: clientUsers.id,
        clientId: clientUsers.clientId,
        role: clientUsers.role,
        email: clientUsers.email,
        totpEnabled: clientUsers.totpEnabled,
      })
      .from(userIdentities)
      .innerJoin(clientUsers, eq(clientUsers.id, userIdentities.userId))
      .where(
        and(
          eq(userIdentities.provider, profile.provider),
          eq(userIdentities.providerUserId, profile.providerUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async findByEmail(email: string): Promise<Omit<ResolvedIdentity, 'created'> | null> {
    const [row] = await this.db
      .select({
        userId: clientUsers.id,
        clientId: clientUsers.clientId,
        role: clientUsers.role,
        email: clientUsers.email,
        totpEnabled: clientUsers.totpEnabled,
      })
      .from(clientUsers)
      .where(eq(clientUsers.email, email))
      .limit(1);
    return row ?? null;
  }

  private async insertIdentity(userId: string, profile: OAuthProfile): Promise<void> {
    await this.db
      .insert(userIdentities)
      .values({
        userId,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        lastLoginAt: new Date(),
      })
      .onConflictDoNothing();
  }

  private async touchIdentity(profile: OAuthProfile): Promise<void> {
    await this.db
      .update(userIdentities)
      .set({ lastLoginAt: new Date(), email: profile.email, displayName: profile.displayName })
      .where(
        and(
          eq(userIdentities.provider, profile.provider),
          eq(userIdentities.providerUserId, profile.providerUserId),
        ),
      );
  }

  /**
   * Создание аккаунта при первом входе через провайдера.
   *
   * Всё в одной транзакции: два параллельных первых входа одного человека —
   * реальный сценарий (двойной клик, ретрай браузера), и на уникальном индексе
   * по email второй запрос упадёт. Без транзакции после него оставался бы
   * висячий `clients` без пользователя.
   */
  private async createUserFromProfile(
    profile: OAuthProfile,
  ): Promise<Omit<ResolvedIdentity, 'created'>> {
    const companyName = profile.displayName?.trim() || profile.email?.split('@')[0] || 'Мой проект';

    return this.db.transaction(async (tx) => {
      const [free] = await tx
        .select({ id: platformPlans.id })
        .from(platformPlans)
        .where(eq(platformPlans.code, 'free'))
        .limit(1);
      if (!free) throw new Error('platform_plans not seeded');

      const [client] = await tx
        .insert(clients)
        .values({ name: companyName, platformPlanId: free.id, planStatus: 'trialing' })
        .returning({ id: clients.id });

      // passwordHash = NULL: пароля у такого аккаунта нет, вход только через
      // провайдера, пока пользователь не задаст пароль в кабинете.
      const [user] = await tx
        .insert(clientUsers)
        .values({
          clientId: client.id,
          role: 'client_admin',
          email: profile.email,
          passwordHash: null,
        })
        .returning({ id: clientUsers.id });

      await tx
        .insert(userIdentities)
        .values({
          userId: user.id,
          provider: profile.provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          lastLoginAt: new Date(),
        })
        .onConflictDoNothing();

      return {
        userId: user.id,
        clientId: client.id,
        role: 'client_admin',
        email: profile.email,
        totpEnabled: false,
      };
    });
  }
}

/** Сравнение state из cookie и из query — используется BFF-слоем и тестами. */
export function statesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a ?? '', 'utf8');
  const bb = Buffer.from(b ?? '', 'utf8');
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
