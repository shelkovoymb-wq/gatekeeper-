import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull } from 'drizzle-orm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/db.module.js';
import { clients, clientUsers, platformPlans, userIdentities } from '../db/schema.js';
import { hashPassword, verifyPassword } from './password.js';
import type {
  AuthContext,
  JwtPayload,
  TwoFactorChallenge,
  TwoFactorChallengePayload,
} from './auth.types.js';

interface RegisterInput {
  email: string;
  password: string;
  companyName: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string | null;
    role: string;
    clientId: string | null;
    companyName: string | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    // Явный @Inject, а не вывод по типу: vitest транспилирует через esbuild,
    // который не эмитит design:paramtypes — без этого DI падает в тестах.
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    const companyName = input.companyName.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('некорректный email');
    }
    if (password.length < 8) {
      throw new BadRequestException('пароль должен быть не короче 8 символов');
    }
    if (!companyName) {
      throw new BadRequestException('укажите название проекта');
    }

    const [existing] = await this.db
      .select({ id: clientUsers.id })
      .from(clientUsers)
      .where(eq(clientUsers.email, email))
      .limit(1);
    if (existing) throw new ConflictException('пользователь с таким email уже существует');

    const [free] = await this.db
      .select({ id: platformPlans.id })
      .from(platformPlans)
      .where(eq(platformPlans.code, 'free'))
      .limit(1);
    if (!free) throw new Error('platform_plans not seeded');

    const [client] = await this.db
      .insert(clients)
      .values({ name: companyName, platformPlanId: free.id, planStatus: 'trialing' })
      .returning({ id: clients.id });

    const passwordHash = await hashPassword(password);
    const [user] = await this.db
      .insert(clientUsers)
      .values({ clientId: client.id, role: 'client_admin', email, passwordHash })
      .returning({ id: clientUsers.id });

    return this.buildResult({
      userId: user.id,
      clientId: client.id,
      role: 'client_admin',
      email,
      companyName,
    });
  }

  /**
   * Вход по паролю. Если у пользователя включена 2FA, полноценная сессия
   * НЕ выдаётся: возвращается короткоживущий challenge-токен, который
   * обменивается на сессию в `/v1/auth/2fa/verify`.
   */
  async login(email0: string, password: string): Promise<AuthResult | TwoFactorChallenge> {
    const email = String(email0 ?? '')
      .trim()
      .toLowerCase();
    const [user] = await this.db
      .select({
        id: clientUsers.id,
        clientId: clientUsers.clientId,
        role: clientUsers.role,
        email: clientUsers.email,
        passwordHash: clientUsers.passwordHash,
        totpEnabled: clientUsers.totpEnabled,
        totpBackupCodes: clientUsers.totpBackupCodes,
      })
      .from(clientUsers)
      .where(eq(clientUsers.email, email))
      .limit(1);
    if (!user || !user.passwordHash) {
      // Аккаунт, заведённый через Google/Яндекс, пароля не имеет — сообщение
      // намеренно то же, чтобы по ответу нельзя было перечислять аккаунты.
      throw new UnauthorizedException('неверный email или пароль');
    }
    const ok = await verifyPassword(String(password ?? ''), user.passwordHash);
    if (!ok) throw new UnauthorizedException('неверный email или пароль');

    if (user.totpEnabled) {
      return this.buildChallenge(user.id, user.totpBackupCodes);
    }

    const companyName = await this.companyName(user.clientId);
    return this.buildResult({
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
      email: user.email,
      companyName,
    });
  }

  /** Промежуточный токен «пароль верен, ждём второй фактор». */
  async buildChallenge(userId: string, backupCodes?: unknown): Promise<TwoFactorChallenge> {
    const payload: TwoFactorChallengePayload = { sub: userId, typ: '2fa' };
    const challengeToken = await this.jwt.signAsync(payload, {
      expiresIn: this.env.TWO_FACTOR_CHALLENGE_TTL,
    });
    const hasBackup = Array.isArray(backupCodes) && backupCodes.length > 0;
    return {
      twoFactorRequired: true,
      challengeToken,
      methods: hasBackup ? ['totp', 'backup_code'] : ['totp'],
    };
  }

  /** Разбор challenge-токена. Access-токен здесь не принимается. */
  async consumeChallenge(challengeToken: string): Promise<string> {
    if (!challengeToken) throw new UnauthorizedException('нет токена подтверждения');
    let payload: TwoFactorChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<TwoFactorChallengePayload>(challengeToken);
    } catch {
      throw new UnauthorizedException('срок подтверждения истёк — войдите заново');
    }
    if (payload.typ !== '2fa' || !payload.sub) {
      throw new UnauthorizedException('неверный токен подтверждения');
    }
    return payload.sub;
  }

  /** Сессия для уже установленной личности (после 2FA или входа через OAuth). */
  async issueSessionFor(userId: string): Promise<AuthResult> {
    const [user] = await this.db
      .select({
        id: clientUsers.id,
        clientId: clientUsers.clientId,
        role: clientUsers.role,
        email: clientUsers.email,
      })
      .from(clientUsers)
      .where(eq(clientUsers.id, userId))
      .limit(1);
    if (!user) throw new UnauthorizedException('пользователь не найден');
    const companyName = await this.companyName(user.clientId);
    return this.buildResult({
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
      email: user.email,
      companyName,
    });
  }

  async me(auth: AuthContext) {
    const companyName = await this.companyName(auth.clientId);
    const [user] = await this.db
      .select({
        totpEnabled: clientUsers.totpEnabled,
        passwordHash: clientUsers.passwordHash,
      })
      .from(clientUsers)
      .where(eq(clientUsers.id, auth.userId))
      .limit(1);
    const identities = await this.db
      .select({ provider: userIdentities.provider })
      .from(userIdentities)
      .where(eq(userIdentities.userId, auth.userId));

    return {
      id: auth.userId,
      email: auth.email,
      role: auth.role,
      clientId: auth.clientId,
      companyName,
      twoFactorEnabled: user?.totpEnabled ?? false,
      hasPassword: Boolean(user?.passwordHash),
      identities: identities.map((i) => i.provider),
    };
  }

  /**
   * Смена собственного пароля: проверяем текущий, сохраняем новый.
   * У аккаунта, созданного через Google/Яндекс, пароля ещё нет — тогда это
   * первичная установка пароля, и `currentPassword` не требуется (личность уже
   * подтверждена JWT-сессией).
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('новый пароль должен быть не короче 8 символов');
    }
    const [user] = await this.db
      .select({ id: clientUsers.id, passwordHash: clientUsers.passwordHash })
      .from(clientUsers)
      .where(eq(clientUsers.id, userId))
      .limit(1);
    if (!user) throw new UnauthorizedException('пользователь не найден');
    if (user.passwordHash) {
      const ok = await verifyPassword(String(currentPassword ?? ''), user.passwordHash);
      if (!ok) throw new UnauthorizedException('текущий пароль неверен');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.db
      .update(clientUsers)
      .set({ passwordHash })
      .where(eq(clientUsers.id, userId));
    return { ok: true };
  }

  private async companyName(clientId: string | null): Promise<string | null> {
    if (!clientId) return 'Платформа';
    const [c] = await this.db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    return c?.name ?? null;
  }

  private async buildResult(u: {
    userId: string;
    clientId: string | null;
    role: string;
    email: string | null;
    companyName: string | null;
  }): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: u.userId,
      cid: u.clientId,
      role: u.role,
      email: u.email,
      typ: 'access',
    };
    const token = await this.jwt.signAsync(payload);
    return {
      token,
      user: {
        id: u.userId,
        email: u.email,
        role: u.role,
        clientId: u.clientId,
        companyName: u.companyName,
      },
    };
  }

  /** Утилита для сидов: гарантирует наличие владельца платформы (clientId=null). */
  async ensureOwner(email: string, password: string): Promise<void> {
    const e = email.trim().toLowerCase();
    const [existing] = await this.db
      .select({ id: clientUsers.id })
      .from(clientUsers)
      .where(and(eq(clientUsers.email, e), isNull(clientUsers.clientId)))
      .limit(1);
    if (existing) return;
    const passwordHash = await hashPassword(password);
    await this.db
      .insert(clientUsers)
      .values({ clientId: null, role: 'owner', email: e, passwordHash });
  }
}
