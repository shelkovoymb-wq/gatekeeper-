import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { addons, clientAddons, clients, paymentEvents } from '../db/schema.js';
import { extendedExpiry, hasAddonAccess, daysLeft, type AddonStatus } from './addon-access.js';

/** Событие шлюза в журнал. Пишется ВСЕГДА, даже когда клиент не найден. */
export interface GatewayEvent {
  eventKey: string;
  eventType: string;
  clientId?: string | null;
  addonCode?: string | null;
  amount?: number | null;
  currency?: string | null;
  signature?: string | null;
  rawPayload: unknown;
}

/** Нарушение UNIQUE в Postgres — по этому коду узнаём повтор доставки. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class AddonsService {
  private readonly logger = new Logger(AddonsService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Каталог включённых опций с ценой. */
  async catalogue() {
    const rows = await this.db.select().from(addons).where(eq(addons.isActive, true));
    return rows.map((a) => ({
      code: a.code,
      name: a.name,
      description: a.description,
      priceMonth: Number(a.priceMonth),
      currency: a.currency,
      periodDays: a.periodDays,
    }));
  }

  /**
   * Состояние опции у клиента: есть ли доступ, до какого числа и куда платить.
   * Это то, что показывает кабинет — и на этом же основан гейт.
   */
  async statusFor(clientId: string, code: string) {
    const [row] = await this.db
      .select({
        status: clientAddons.status,
        expiresAt: clientAddons.expiresAt,
        name: addons.name,
        description: addons.description,
        priceMonth: addons.priceMonth,
        currency: addons.currency,
        periodDays: addons.periodDays,
        paymentUrl: addons.paymentUrl,
      })
      .from(addons)
      .leftJoin(
        clientAddons,
        and(eq(clientAddons.addonCode, addons.code), eq(clientAddons.clientId, clientId)),
      )
      .where(eq(addons.code, code))
      .limit(1);

    if (!row) throw new NotFoundException('опция не найдена');

    const status = (row.status ?? 'expired') as AddonStatus;
    return {
      code,
      name: row.name,
      description: row.description,
      priceMonth: Number(row.priceMonth),
      currency: row.currency,
      periodDays: row.periodDays,
      status,
      expiresAt: row.expiresAt,
      daysLeft: daysLeft(row.expiresAt),
      hasAccess: hasAddonAccess(status, row.expiresAt),
      // order_num — единственная надёжная ниточка «этот платёж → этот клиент и
      // эта опция»: email и телефон у людей меняются и дублируются, а по сумме
      // продукт определять нельзя.
      paymentUrl: row.paymentUrl
        ? `${row.paymentUrl}${row.paymentUrl.includes('?') ? '&' : '?'}order_num=${clientId}:${code}`
        : null,
    };
  }

  /** Гейт: бросает 403, если опция не оплачена. */
  async assertAccess(clientId: string, code: string): Promise<void> {
    const [row] = await this.db
      .select({ status: clientAddons.status, expiresAt: clientAddons.expiresAt })
      .from(clientAddons)
      .where(and(eq(clientAddons.clientId, clientId), eq(clientAddons.addonCode, code)))
      .limit(1);

    if (!hasAddonAccess(row?.status, row?.expiresAt)) {
      throw new ForbiddenException(`опция «${code}» не подключена`);
    }
  }

  /**
   * Записать событие шлюза. Возвращает false, если такое событие уже было —
   * это повтор доставки, и обрабатывать его повторно нельзя.
   *
   * Замок именно на UNIQUE-индексе в базе, а не на проверке «не было ли такого
   * события минуту назад»: шлюзы ретраят часами, и проверка по времени их не
   * ловит.
   */
  async recordEvent(event: GatewayEvent): Promise<boolean> {
    try {
      await this.db.insert(paymentEvents).values({
        eventKey: event.eventKey,
        clientId: event.clientId ?? null,
        addonCode: event.addonCode ?? null,
        eventType: event.eventType,
        amount: event.amount != null ? String(event.amount) : null,
        currency: event.currency ?? null,
        signature: event.signature ?? null,
        rawPayload: (event.rawPayload ?? {}) as Record<string, unknown>,
      });
      return true;
    } catch (e) {
      if ((e as { code?: string })?.code === UNIQUE_VIOLATION) {
        this.logger.log(`повтор доставки: ${event.eventKey}`);
        return false;
      }
      throw e;
    }
  }

  /** Удалить событие: апдейт подписки не прошёл, замок держать нельзя. */
  async dropEvent(eventKey: string): Promise<void> {
    await this.db.delete(paymentEvents).where(eq(paymentEvents.eventKey, eventKey));
  }

  /** Найти клиента по order_num из ссылки оплаты. */
  async findClient(orderNum: string | null | undefined): Promise<string | null> {
    if (!orderNum) return null;
    const [row] = await this.db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, orderNum))
      .limit(1);
    return row?.id ?? null;
  }

  /**
   * Успешная оплата: продлить подписку.
   * Новый срок — max(текущий, now + период): активация не срезает оплаченное вперёд.
   */
  async activate(
    clientId: string,
    code: string,
    opts: { gatewaySubscriptionId?: string | null; email?: string | null; phone?: string | null } = {},
  ) {
    const [addon] = await this.db.select().from(addons).where(eq(addons.code, code)).limit(1);
    if (!addon) throw new NotFoundException('опция не найдена');

    const [existing] = await this.db
      .select({ expiresAt: clientAddons.expiresAt })
      .from(clientAddons)
      .where(and(eq(clientAddons.clientId, clientId), eq(clientAddons.addonCode, code)))
      .limit(1);

    const expiresAt = extendedExpiry(existing?.expiresAt, addon.periodDays);
    const now = new Date();

    await this.db
      .insert(clientAddons)
      .values({
        clientId,
        addonCode: code,
        status: 'active',
        expiresAt,
        gatewaySubscriptionId: opts.gatewaySubscriptionId ?? null,
        billingEmail: opts.email ?? null,
        billingPhone: opts.phone ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [clientAddons.clientId, clientAddons.addonCode],
        set: {
          status: 'active',
          expiresAt,
          gatewaySubscriptionId: opts.gatewaySubscriptionId ?? null,
          updatedAt: now,
        },
      });

    this.logger.log(`опция ${code} активна у ${clientId} до ${expiresAt.toISOString()}`);
    return { status: 'active' as const, expiresAt };
  }

  /**
   * Закрывающее событие: отмена, провал списания, деактивация.
   * Оплаченный вперёд период НЕ отбираем — статус меняем, срок не трогаем.
   */
  async markClosing(clientId: string, code: string, status: AddonStatus) {
    const [existing] = await this.db
      .select({ expiresAt: clientAddons.expiresAt })
      .from(clientAddons)
      .where(and(eq(clientAddons.clientId, clientId), eq(clientAddons.addonCode, code)))
      .limit(1);

    if (!existing) return { status: 'expired' as const, expiresAt: null };

    await this.db
      .update(clientAddons)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(clientAddons.clientId, clientId), eq(clientAddons.addonCode, code)));

    return { status, expiresAt: existing.expiresAt };
  }

  /** Ручная выдача владельцем: подарок, бартер, свои. */
  async grantFree(clientId: string, code: string) {
    const now = new Date();
    await this.db
      .insert(clientAddons)
      .values({ clientId, addonCode: code, status: 'free', updatedAt: now })
      .onConflictDoUpdate({
        target: [clientAddons.clientId, clientAddons.addonCode],
        set: { status: 'free', updatedAt: now },
      });
    return { status: 'free' as const };
  }

  /** Отключить опцию клиенту. */
  async revoke(clientId: string, code: string) {
    await this.db
      .update(clientAddons)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(eq(clientAddons.clientId, clientId), eq(clientAddons.addonCode, code)));
    return { status: 'expired' as const };
  }

  /**
   * Настройка опции владельцем: цена, период, ссылка на форму оплаты.
   * Цена лежит в данных, а не в коде — поднять её не должно требовать сборки.
   */
  async configure(
    code: string,
    input: {
      name?: string;
      description?: string | null;
      priceMonth?: number;
      currency?: string;
      periodDays?: number;
      paymentUrl?: string | null;
      isActive?: boolean;
    },
  ) {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.priceMonth !== undefined) patch.priceMonth = String(input.priceMonth);
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.periodDays !== undefined) patch.periodDays = input.periodDays;
    if (input.paymentUrl !== undefined) patch.paymentUrl = input.paymentUrl;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (!Object.keys(patch).length) throw new NotFoundException('нечего менять');

    const [row] = await this.db
      .update(addons)
      .set(patch)
      .where(eq(addons.code, code))
      .returning();
    if (!row) throw new NotFoundException('опция не найдена');
    return { code: row.code, name: row.name, priceMonth: Number(row.priceMonth), paymentUrl: row.paymentUrl };
  }

  /** Кто и что подключил — для кабинета владельца. */
  async listSubscriptions() {
    return this.db
      .select({
        clientId: clientAddons.clientId,
        clientName: clients.name,
        addonCode: clientAddons.addonCode,
        status: clientAddons.status,
        expiresAt: clientAddons.expiresAt,
        updatedAt: clientAddons.updatedAt,
      })
      .from(clientAddons)
      .innerJoin(clients, eq(clients.id, clientAddons.clientId))
      .orderBy(sql`${clientAddons.updatedAt} desc`);
  }

  /** Журнал событий шлюза — им разбирается жалоба «я оплатил, доступа нет». */
  async recentEvents(limit = 100) {
    return this.db
      .select()
      .from(paymentEvents)
      .orderBy(sql`${paymentEvents.createdAt} desc`)
      .limit(limit);
  }
}
