/**
 * Двухфакторная аутентификация: TOTP-приложение (Google Authenticator,
 * Яндекс.Ключ, 1Password…) + одноразовые резервные коды.
 *
 * Секрет хранится зашифрованным (SecretBox, AES-256-GCM) — дамп БД без
 * SECRET_ENCRYPTION_KEY не даёт возможности генерировать чужие коды.
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SECRET_BOX } from '../common/crypto.module.js';
import type { SecretBox } from '../common/crypto.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/db.module.js';
import { clientUsers } from '../db/schema.js';
import {
  BACKUP_CODES_COUNT,
  findBackupCode,
  generateBackupCodes,
  hashBackupCodes,
} from './backup-codes.js';
import { verifyPassword } from './password.js';
import { buildOtpauthUrl, generateTotpSecret, verifyTotp } from './totp.js';

/** Сколько неудачных попыток второго фактора допускаем до временной блокировки. */
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60_000;

export interface TwoFactorStatus {
  enabled: boolean;
  pendingSetup: boolean;
  backupCodesLeft: number;
  confirmedAt: Date | null;
}

interface UserRow {
  id: string;
  email: string | null;
  passwordHash: string | null;
  totpSecretEnc: string | null;
  totpEnabled: boolean;
  totpConfirmedAt: Date | null;
  totpBackupCodes: unknown;
  totpLastStep: number | null;
}

@Injectable()
export class TwoFactorService {
  /**
   * Счётчик неудачных попыток на пользователя. In-memory: API — модульный
   * монолит в один процесс, а глобальный throttler уже режет по IP. При
   * горизонтальном масштабировании счётчик нужно перенести в Redis
   * (иначе лимит станет «на реплику»).
   */
  private readonly attempts = new Map<string, { count: number; firstAt: number }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(SECRET_BOX) private readonly secretBox: SecretBox,
  ) {}

  async status(userId: string): Promise<TwoFactorStatus> {
    const user = await this.requireUser(userId);
    return {
      enabled: user.totpEnabled,
      pendingSetup: !user.totpEnabled && Boolean(user.totpSecretEnc),
      backupCodesLeft: this.backupCodes(user).length,
      confirmedAt: user.totpConfirmedAt,
    };
  }

  /**
   * Шаг 1: выдаём секрет и otpauth-URL для QR.
   * Секрет пишем сразу, но `totp_enabled` не трогаем — пока код не подтверждён,
   * вход остаётся однофакторным и «полунастроенная» 2FA никого не запирает.
   */
  async beginSetup(userId: string): Promise<{ secret: string; otpauthUrl: string; issuer: string }> {
    const user = await this.requireUser(userId);
    if (user.totpEnabled) throw new ConflictException('двухфакторная защита уже включена');

    const secret = generateTotpSecret();
    await this.db
      .update(clientUsers)
      .set({ totpSecretEnc: this.secretBox.encrypt(secret), totpLastStep: null })
      .where(eq(clientUsers.id, userId));

    return {
      secret,
      otpauthUrl: buildOtpauthUrl({
        secret,
        accountName: user.email ?? userId,
        issuer: this.env.TOTP_ISSUER,
      }),
      issuer: this.env.TOTP_ISSUER,
    };
  }

  /** Шаг 2: подтверждение кодом из приложения → включение + резервные коды. */
  async confirmSetup(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.requireUser(userId);
    if (user.totpEnabled) throw new ConflictException('двухфакторная защита уже включена');
    if (!user.totpSecretEnc) throw new BadRequestException('сначала запросите секрет (setup)');

    const step = verifyTotp(this.secretBox.decrypt(user.totpSecretEnc), String(code ?? ''));
    if (step === null) {
      this.registerFailure(userId);
      throw new UnauthorizedException('код неверен');
    }
    this.clearFailures(userId);

    const backupCodes = generateBackupCodes(BACKUP_CODES_COUNT);
    await this.db
      .update(clientUsers)
      .set({
        totpEnabled: true,
        totpConfirmedAt: new Date(),
        totpBackupCodes: hashBackupCodes(backupCodes),
        totpLastStep: step,
      })
      .where(eq(clientUsers.id, userId));

    return { backupCodes };
  }

  /**
   * Выключение. Требуем подтверждение личности здесь и сейчас: пароль (если он
   * есть) или действующий код. Без этого угнанная сессия снимала бы 2FA молча.
   */
  async disable(userId: string, input: { password?: string; code?: string }): Promise<{ ok: true }> {
    const user = await this.requireUser(userId);
    if (!user.totpEnabled && !user.totpSecretEnc) return { ok: true };

    const confirmed = user.passwordHash
      ? await verifyPassword(String(input.password ?? ''), user.passwordHash)
      : await this.checkSecondFactor(user, String(input.code ?? ''));
    if (!confirmed) {
      this.registerFailure(userId);
      throw new UnauthorizedException(
        user.passwordHash ? 'пароль неверен' : 'код неверен',
      );
    }
    this.clearFailures(userId);

    await this.db
      .update(clientUsers)
      .set({
        totpEnabled: false,
        totpSecretEnc: null,
        totpConfirmedAt: null,
        totpBackupCodes: [],
        totpLastStep: null,
      })
      .where(eq(clientUsers.id, userId));
    return { ok: true };
  }

  /** Перевыпуск резервных кодов: старые становятся недействительны немедленно. */
  async regenerateBackupCodes(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.requireUser(userId);
    if (!user.totpEnabled) throw new BadRequestException('двухфакторная защита не включена');

    const ok = await this.checkSecondFactor(user, String(code ?? ''), { allowBackupCode: false });
    if (!ok) {
      this.registerFailure(userId);
      throw new UnauthorizedException('код неверен');
    }
    this.clearFailures(userId);

    const backupCodes = generateBackupCodes(BACKUP_CODES_COUNT);
    await this.db
      .update(clientUsers)
      .set({ totpBackupCodes: hashBackupCodes(backupCodes) })
      .where(eq(clientUsers.id, userId));
    return { backupCodes };
  }

  /**
   * Проверка второго фактора при входе. Принимает и TOTP, и резервный код.
   * Бросает 401 при неудаче и 429 при исчерпании попыток.
   */
  async verifyLogin(userId: string, code: string): Promise<void> {
    this.assertNotLocked(userId);
    const user = await this.requireUser(userId);
    if (!user.totpEnabled) throw new BadRequestException('двухфакторная защита не включена');

    const ok = await this.checkSecondFactor(user, String(code ?? ''));
    if (!ok) {
      this.registerFailure(userId);
      throw new UnauthorizedException('неверный код подтверждения');
    }
    this.clearFailures(userId);
  }

  // ─── внутреннее ───────────────────────────────────────────────────────────

  /**
   * Единая проверка «второго фактора»: сначала TOTP, затем — резервный код.
   * Успешный TOTP-шаг запоминается: тот же код повторно не пройдёт, даже если
   * его перехватили внутри 30-секундного окна.
   */
  private async checkSecondFactor(
    user: UserRow,
    code: string,
    opts: { allowBackupCode?: boolean } = {},
  ): Promise<boolean> {
    const allowBackupCode = opts.allowBackupCode !== false;

    if (user.totpSecretEnc) {
      const step = verifyTotp(this.secretBox.decrypt(user.totpSecretEnc), code);
      if (step !== null) {
        if (user.totpLastStep !== null && step <= user.totpLastStep) return false;
        await this.db
          .update(clientUsers)
          .set({ totpLastStep: step })
          .where(eq(clientUsers.id, user.id));
        return true;
      }
    }

    if (!allowBackupCode) return false;
    const hashes = this.backupCodes(user);
    if (hashes.length === 0) return false;
    const idx = findBackupCode(hashes, code);
    if (idx === -1) return false;

    // Резервный код одноразовый — выжигаем сразу после совпадения.
    const rest = hashes.filter((_, i) => i !== idx);
    await this.db
      .update(clientUsers)
      .set({ totpBackupCodes: rest })
      .where(eq(clientUsers.id, user.id));
    return true;
  }

  private backupCodes(user: UserRow): string[] {
    const raw = user.totpBackupCodes;
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === 'string');
  }

  private async requireUser(userId: string): Promise<UserRow> {
    const [user] = await this.db
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        passwordHash: clientUsers.passwordHash,
        totpSecretEnc: clientUsers.totpSecretEnc,
        totpEnabled: clientUsers.totpEnabled,
        totpConfirmedAt: clientUsers.totpConfirmedAt,
        totpBackupCodes: clientUsers.totpBackupCodes,
        totpLastStep: clientUsers.totpLastStep,
      })
      .from(clientUsers)
      .where(eq(clientUsers.id, userId))
      .limit(1);
    if (!user) throw new UnauthorizedException('пользователь не найден');
    return user as UserRow;
  }

  private assertNotLocked(userId: string): void {
    const rec = this.attempts.get(userId);
    if (!rec) return;
    if (Date.now() - rec.firstAt > ATTEMPT_WINDOW_MS) {
      this.attempts.delete(userId);
      return;
    }
    if (rec.count >= MAX_ATTEMPTS) {
      throw new UnauthorizedException('слишком много неверных кодов — попробуйте позже');
    }
  }

  private registerFailure(userId: string): void {
    const now = Date.now();
    const rec = this.attempts.get(userId);
    if (!rec || now - rec.firstAt > ATTEMPT_WINDOW_MS) {
      this.attempts.set(userId, { count: 1, firstAt: now });
      return;
    }
    rec.count += 1;
  }

  private clearFailures(userId: string): void {
    this.attempts.delete(userId);
  }
}
