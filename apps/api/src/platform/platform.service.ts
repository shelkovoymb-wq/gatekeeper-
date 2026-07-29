import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import {
  bots,
  channels,
  clients,
  payments,
  platformPlans,
  subscriptions,
} from '../db/schema.js';

/**
 * Сервис владельца платформы (role=owner, clientId=null).
 *
 * Считает по всем клиентам: оборот (succeeded-платежи), комиссию платформы
 * (оборот × commission_pct тарифа клиента), выручку платформы от подписок
 * клиентов (price_month активных планов).
 */
@Injectable()
export class PlatformService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Сводка по всей платформе. */
  async overview() {
    const [clientsN] = await this.db.select({ n: sql<number>`count(*)` }).from(clients);
    const [activeN] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(clients)
      .where(sql`${clients.planStatus} in ('active','trialing')`);
    const [chN] = await this.db.select({ n: sql<number>`count(*)` }).from(channels);
    const [botsN] = await this.db.select({ n: sql<number>`count(*)` }).from(bots);
    const [subsN] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(subscriptions)
      .where(sql`${subscriptions.status} in ('active','trial','grace')`);

    // Оборот и комиссия одним проходом: join платежей к клиенту и его плану.
    const [agg] = await this.db
      .select({
        turnover: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        commission: sql<string>`coalesce(sum(${payments.amount} * ${platformPlans.commissionPct} / 100), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(payments)
      .innerJoin(clients, eq(clients.id, payments.clientId))
      .innerJoin(platformPlans, eq(platformPlans.id, clients.platformPlanId))
      .where(eq(payments.status, 'succeeded'));

    // Потенциальная месячная выручка платформы от подписок клиентов.
    const [mrr] = await this.db
      .select({
        s: sql<string>`coalesce(sum(${platformPlans.priceMonth}), 0)`,
      })
      .from(clients)
      .innerJoin(platformPlans, eq(platformPlans.id, clients.platformPlanId))
      .where(sql`${clients.planStatus} in ('active','trialing')`);

    return {
      totalClients: Number(clientsN?.n ?? 0),
      activeClients: Number(activeN?.n ?? 0),
      totalChannels: Number(chN?.n ?? 0),
      totalBots: Number(botsN?.n ?? 0),
      activeSubscriptions: Number(subsN?.n ?? 0),
      clientsTurnover: Number(agg?.turnover ?? 0),
      platformCommission: Number(agg?.commission ?? 0),
      paymentsCount: Number(agg?.count ?? 0),
      platformMrr: Number(mrr?.s ?? 0),
    };
  }

  /** Список всех клиентов с планом, оборотом и начисленной комиссией. */
  async listClients() {
    const rows = await this.db
      .select({
        id: clients.id,
        name: clients.name,
        planCode: platformPlans.code,
        planName: platformPlans.name,
        commissionPct: platformPlans.commissionPct,
        priceMonth: platformPlans.priceMonth,
        planStatus: clients.planStatus,
        planPaidUntil: clients.planPaidUntil,
        createdAt: clients.createdAt,
      })
      .from(clients)
      .innerJoin(platformPlans, eq(platformPlans.id, clients.platformPlanId))
      .orderBy(sql`${clients.createdAt} desc`);

    const result = [];
    for (const c of rows) {
      const [chN] = await this.db
        .select({ n: sql<number>`count(*)` })
        .from(channels)
        .where(eq(channels.clientId, c.id));
      const [subsN] = await this.db
        .select({ n: sql<number>`count(*)` })
        .from(subscriptions)
        .where(sql`${subscriptions.clientId} = ${c.id} and ${subscriptions.status} in ('active','trial','grace')`);
      const [agg] = await this.db
        .select({
          turnover: sql<string>`coalesce(sum(${payments.amount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(payments)
        .where(sql`${payments.clientId} = ${c.id} and ${payments.status} = 'succeeded'`);

      const turnover = Number(agg?.turnover ?? 0);
      const pct = Number(c.commissionPct ?? 0);
      result.push({
        id: c.id,
        name: c.name,
        planCode: c.planCode,
        planName: c.planName,
        planStatus: c.planStatus,
        commissionPct: pct,
        priceMonth: Number(c.priceMonth ?? 0),
        planPaidUntil: c.planPaidUntil?.toISOString?.() ?? null,
        channels: Number(chN?.n ?? 0),
        activeSubscriptions: Number(subsN?.n ?? 0),
        turnover,
        commission: Math.round(((turnover * pct) / 100) * 100) / 100,
        paymentsCount: Number(agg?.count ?? 0),
        createdAt: c.createdAt?.toISOString?.() ?? String(c.createdAt),
      });
    }
    return result;
  }

  /** Платформенные тарифы (для клиентов), которые продаёт владелец. */
  async listPlatformPlans() {
    const rows = await this.db
      .select()
      .from(platformPlans)
      .orderBy(sql`${platformPlans.priceMonth} asc`);
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      priceMonth: Number(p.priceMonth ?? 0),
      currency: p.currency,
      commissionPct: Number(p.commissionPct ?? 0),
      isActive: p.isActive,
      limits: p.limits ?? {},
      features: p.features ?? {},
    }));
  }
}
