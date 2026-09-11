import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { channels, directMembers, plans, subscribers } from '../db/schema.js';
import { periodMonth, summarizeDirect, type DirectRow } from './direct-billing.js';

/**
 * Учёт участников, которых клиент завёл в канал сам, минуя платформу.
 *
 * Платформа таким входам не мешает: клиент вправе брать деньги напрямую. Но
 * видит их все и берёт с них ту же комиссию, что и с платежей, прошедших через
 * неё, — иначе «мимо платформы» превращается в способ не платить вовсе.
 */
@Injectable()
export class DirectMembersService {
  private readonly logger = new Logger(DirectMembersService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Цена тарифа канала — база начисления, когда клиент участника не оформил.
   *
   * Из всех активных тарифов, открывающих канал, берём САМЫЙ ДЕШЁВЫЙ: клиент
   * промолчал, и считать по самому дорогому было бы наказанием, а не счётом.
   */
  private fallbackPriceSql() {
    return sql<string>`coalesce((
      select min(${plans.price})
      from ${plans}
      join plan_channels pc on pc.plan_id = ${plans.id}
      where pc.channel_id = ${directMembers.channelId} and ${plans.isActive} = true
    ), 0)`;
  }

  /**
   * Зафиксировать вход без подписки. Идемпотентно в пределах месяца: повторное
   * добавление того же человека счёт не задваивает, а в следующем месяце это
   * уже вторая продажа и новая строка.
   */
  async record(input: {
    clientId: string;
    channelId: string;
    subscriberId: string;
    now?: Date;
  }): Promise<void> {
    const period = periodMonth(input.now);
    await this.db
      .insert(directMembers)
      .values({
        clientId: input.clientId,
        channelId: input.channelId,
        subscriberId: input.subscriberId,
        periodMonth: period,
        status: 'pending',
      })
      .onConflictDoNothing({
        target: [directMembers.channelId, directMembers.subscriberId, directMembers.periodMonth],
      });
    this.logger.log(
      `прямое добавление: канал ${input.channelId}, подписчик ${input.subscriberId}, период ${period}`,
    );
  }

  /**
   * Участник вышел или был удалён. Строку не убираем: в канале он побывал,
   * деньги клиент получил, период закрывается с ним.
   */
  async markLeft(channelId: string, subscriberId: string, now = new Date()): Promise<void> {
    await this.db
      .update(directMembers)
      .set({ leftAt: now, updatedAt: now })
      .where(
        and(
          eq(directMembers.channelId, channelId),
          eq(directMembers.subscriberId, subscriberId),
          eq(directMembers.periodMonth, periodMonth(now)),
        ),
      );
  }

  /** Список для кабинета клиента: кто, куда, когда и что с ним делать. */
  async list(clientId: string, limit = 200) {
    const rows = await this.db
      .select({
        id: directMembers.id,
        status: directMembers.status,
        periodMonth: directMembers.periodMonth,
        detectedAt: directMembers.detectedAt,
        leftAt: directMembers.leftAt,
        declaredAmount: directMembers.declaredAmount,
        currency: directMembers.currency,
        note: directMembers.note,
        dismissReason: directMembers.dismissReason,
        billedAt: directMembers.billedAt,
        billedBase: directMembers.billedBase,
        planId: directMembers.planId,
        channelId: directMembers.channelId,
        channelTitle: channels.title,
        tgUserId: subscribers.tgUserId,
        username: subscribers.username,
        firstName: subscribers.firstName,
        fallbackPrice: this.fallbackPriceSql(),
      })
      .from(directMembers)
      .innerJoin(channels, eq(channels.id, directMembers.channelId))
      .innerJoin(subscribers, eq(subscribers.id, directMembers.subscriberId))
      .where(eq(directMembers.clientId, clientId))
      .orderBy(sql`${directMembers.detectedAt} desc`)
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      declaredAmount: r.declaredAmount === null ? null : Number(r.declaredAmount),
      billedBase: r.billedBase === null ? null : Number(r.billedBase),
      fallbackPrice: Number(r.fallbackPrice),
    }));
  }

  /** Сколько строк ждёт оформления — этим числом кабинет зовёт клиента разобраться. */
  async pendingCount(clientId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(directMembers)
      .where(and(eq(directMembers.clientId, clientId), eq(directMembers.status, 'pending')));
    return Number(row?.n ?? 0);
  }

  private async owned(clientId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(directMembers)
      .where(and(eq(directMembers.id, id), eq(directMembers.clientId, clientId)))
      .limit(1);
    if (!row) throw new NotFoundException('запись не найдена');
    return row;
  }

  /**
   * Клиент оформляет участника: указывает тариф и сколько получил напрямую.
   * Сумма — со слов клиента, и в счёте она помечена именно так.
   */
  async declare(
    clientId: string,
    id: string,
    input: { planId?: string | null; amount?: number | null; note?: string | null },
  ) {
    const row = await this.owned(clientId, id);
    if (row.billedAt) {
      throw new BadRequestException('запись уже вошла в выставленный счёт');
    }

    if (input.planId) {
      const [plan] = await this.db
        .select({ id: plans.id })
        .from(plans)
        .where(and(eq(plans.id, input.planId), eq(plans.clientId, clientId)))
        .limit(1);
      if (!plan) throw new BadRequestException('тариф не найден');
    }

    if (input.amount !== undefined && input.amount !== null) {
      if (!Number.isFinite(input.amount) || input.amount < 0) {
        throw new BadRequestException('сумма должна быть числом не меньше нуля');
      }
    }

    await this.db
      .update(directMembers)
      .set({
        status: 'declared',
        planId: input.planId ?? row.planId,
        declaredAmount: input.amount === undefined || input.amount === null
          ? row.declaredAmount
          : String(input.amount),
        note: input.note ?? row.note,
        dismissReason: null,
        updatedAt: new Date(),
      })
      .where(eq(directMembers.id, id));

    return { id, status: 'declared' as const };
  }

  /**
   * «Это не продажа»: свой сотрудник, соведущий, гость. В счёт не идёт, но
   * строка остаётся — владельцу платформы видно, что и почему не начислено.
   */
  async dismiss(clientId: string, id: string, reason: string) {
    const row = await this.owned(clientId, id);
    if (row.billedAt) {
      throw new BadRequestException('запись уже вошла в выставленный счёт');
    }
    if (!reason?.trim()) throw new BadRequestException('нужна причина');

    await this.db
      .update(directMembers)
      .set({
        status: 'dismissed',
        dismissReason: reason.trim().slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(directMembers.id, id));

    return { id, status: 'dismissed' as const };
  }

  /** Строки периода для месячного счёта. Период — [start, end) по дате обнаружения. */
  async forPeriod(clientId: string, start: string, end: string) {
    const rows = await this.db
      .select({
        id: directMembers.id,
        status: directMembers.status,
        declaredAmount: directMembers.declaredAmount,
        fallbackPrice: this.fallbackPriceSql(),
      })
      .from(directMembers)
      .where(
        sql`${directMembers.clientId} = ${clientId}
            and ${directMembers.detectedAt} >= ${start}
            and ${directMembers.detectedAt} < ${end}`,
      );
    return rows;
  }

  /** Итог по периоду — им биллинг добавляет строку в счёт. */
  async summaryForPeriod(clientId: string, start: string, end: string, pct: number) {
    const rows = await this.forPeriod(clientId, start, end);
    return {
      ...summarizeDirect(rows as DirectRow[], pct),
      ids: rows.map((r) => r.id),
    };
  }

  /**
   * Пометить строки вошедшими в счёт. После этого клиент их не правит: спор
   * идёт уже по счёту, а не молчаливой правкой задним числом.
   */
  async stampBilled(ids: string[], invoiceId: string, now = new Date()): Promise<void> {
    if (!ids.length) return;
    await this.db
      .update(directMembers)
      .set({
        billedInvoiceId: invoiceId,
        billedAt: now,
        billedBase: sql`case
          when ${directMembers.status} = 'dismissed' then 0
          when ${directMembers.declaredAmount} is not null then ${directMembers.declaredAmount}
          else ${this.fallbackPriceSql()}
        end`,
        updatedAt: now,
      })
      .where(inArray(directMembers.id, ids));
  }

  /** Сводка по всем клиентам — контроль на стороне владельца платформы. */
  async listAll(limit = 200) {
    return this.db
      .select({
        id: directMembers.id,
        clientId: directMembers.clientId,
        status: directMembers.status,
        periodMonth: directMembers.periodMonth,
        detectedAt: directMembers.detectedAt,
        declaredAmount: directMembers.declaredAmount,
        billedAt: directMembers.billedAt,
        billedBase: directMembers.billedBase,
        channelTitle: channels.title,
        tgUserId: subscribers.tgUserId,
        username: subscribers.username,
      })
      .from(directMembers)
      .innerJoin(channels, eq(channels.id, directMembers.channelId))
      .innerJoin(subscribers, eq(subscribers.id, directMembers.subscriberId))
      .orderBy(sql`${directMembers.detectedAt} desc`)
      .limit(limit);
  }
}
