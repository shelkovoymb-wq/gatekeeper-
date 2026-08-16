import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { SECRET_BOX } from '../common/crypto.module.js';
import type { SecretBox } from '../common/crypto.js';
import { paymentConfigs } from '../db/schema.js';

/**
 * Учётные данные платёжного шлюза для конкретного клиента.
 *
 * Источник истины — то, что клиент ввёл в кабинете: кабинет шифрует значения
 * в `payment_configs.credentials_enc` (AES-256-GCM), здесь мы их расшифровываем.
 *
 * Переменные окружения оставлены как запасной путь для ручной настройки на
 * хосте. Имя строится как `<PREFIX>_<CLIENT_ID>`, где clientId — UUID, поэтому
 * в имени будут дефисы; в shell такое имя не задать, но docker-compose
 * `environment:` его принимает. Полагаться на этот путь не стоит — он нужен
 * лишь чтобы не сломать окружения, где ключи уже прописаны так.
 */
@Injectable()
export class ProviderCredentials {
  private readonly logger = new Logger(ProviderCredentials.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
  ) {}

  /** Ключи провайдера для клиента. Пустой объект — не настроено. */
  async get(clientId: string, provider: string): Promise<Record<string, string>> {
    const [row] = await this.db
      .select({ credentialsEnc: paymentConfigs.credentialsEnc })
      .from(paymentConfigs)
      .where(
        and(
          eq(paymentConfigs.clientId, clientId),
          eq(paymentConfigs.provider, provider),
          eq(paymentConfigs.isActive, true),
        ),
      )
      .limit(1);

    if (!row?.credentialsEnc) return {};

    try {
      const parsed = JSON.parse(this.box.decrypt(row.credentialsEnc)) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== null && v !== undefined && v !== '') out[k] = String(v);
      }
      return out;
    } catch (error) {
      // Битый конверт или сменившийся SECRET_ENCRYPTION_KEY: не роняем платёж
      // молча — пишем в лог и отдаём пустой набор, дальше провайдер сам решит.
      this.logger.error(
        `Не удалось расшифровать ключи ${provider} для клиента ${clientId}: ${(error as Error).message}`,
      );
      return {};
    }
  }

  /**
   * Значение поля: сперва из кабинета, затем из окружения.
   * `envPrefix` — например `YOOKASSA_SHOP_ID`.
   */
  pick(
    creds: Record<string, string>,
    field: string,
    envPrefix: string,
    clientId: string,
  ): string | undefined {
    return creds[field] || process.env[`${envPrefix}_${clientId.toUpperCase()}`] || undefined;
  }
}
