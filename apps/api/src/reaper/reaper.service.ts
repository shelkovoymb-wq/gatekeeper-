import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import { EventTopic, SubscriptionStatus } from '@gatekeeper/shared';
import { DB, type Database } from '../db/db.module.js';
import { subscriptionEvents } from '../db/schema.js';
import { EventsService } from '../events/events.service.js';
import { AccessQueueProducer } from '../access/access.queue.js';

interface TransitionRow {
  id: string;
  subscriber_id: string;
  client_id: string;
  tg_user_id: string; // bigint приходит строкой
}

/**
 * Жнец подписок. Каждые 5 минут двигает статусную машину:
 *   active (paid_until истёк, grace_days>0)  → grace  (доступ сохраняется)
 *   active (paid_until истёк, grace_days=0)  → expired → kick
 *   grace (grace_until истёк)                → expired → kick
 * Все переходы идемпотентны; kick ставится в очередь access.
 * На MVP — один инстанс; при масштабировании добавить advisory-lock/SKIP LOCKED.
 */
@Injectable()
export class ReaperService {
  private readonly logger = new Logger(ReaperService.name);
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: EventsService,
    private readonly accessQueue: AccessQueueProducer,
  ) {}

  @Cron('*/5 * * * *')
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.activeToGrace();
      await this.expireAndKick();
    } catch (e) {
      this.logger.error(`reaper error: ${String(e)}`);
    } finally {
      this.running = false;
    }
  }

  /** active + paid_until<now + grace_days>0 → grace. */
  private async activeToGrace(): Promise<void> {
    const rows = (await this.db.execute(sql`
      UPDATE subscriptions s
      SET status = ${SubscriptionStatus.Grace},
          grace_until = now() + (p.grace_days || ' days')::interval,
          updated_at = now()
      FROM plans p
      WHERE s.plan_id = p.id
        AND s.status = ${SubscriptionStatus.Active}
        AND s.paid_until < now()
        AND p.grace_days > 0
      RETURNING s.id, s.subscriber_id, s.client_id
    `)) as unknown as TransitionRow[];

    for (const r of rows) {
      await this.logEvent(r.id, 'grace');
      await this.events.emit(EventTopic.SubscriptionGrace, r.client_id, {
        subscription_id: r.id,
        subscriber_id: r.subscriber_id,
      });
    }
    if (rows.length) this.logger.log(`active→grace: ${rows.length}`);
  }

  /**
   * expired-переходы: (grace истёк) ИЛИ (active без grace-периода) → expired + kick.
   */
  private async expireAndKick(): Promise<void> {
    const rows = (await this.db.execute(sql`
      UPDATE subscriptions s
      SET status = ${SubscriptionStatus.Expired}, updated_at = now()
      FROM plans p, subscribers sub
      WHERE s.plan_id = p.id
        AND s.subscriber_id = sub.id
        AND (
          (s.status = ${SubscriptionStatus.Grace} AND s.grace_until < now())
          OR (s.status = ${SubscriptionStatus.Active} AND s.paid_until < now() AND p.grace_days = 0)
        )
      RETURNING s.id, s.subscriber_id, s.client_id, sub.tg_user_id
    `)) as unknown as TransitionRow[];

    for (const r of rows) {
      await this.logEvent(r.id, 'expired');
      await this.events.emit(EventTopic.SubscriptionExpired, r.client_id, {
        subscription_id: r.id,
        subscriber_id: r.subscriber_id,
      });
      await this.accessQueue.enqueueRevoke({
        subscriberId: r.subscriber_id,
        tgUserId: Number(r.tg_user_id),
        reason: 'expired',
      });
    }
    if (rows.length) this.logger.log(`→expired + kick queued: ${rows.length}`);
  }

  private async logEvent(subscriptionId: string, event: string): Promise<void> {
    await this.db.insert(subscriptionEvents).values({ subscriptionId, event, actor: 'system' });
  }
}
