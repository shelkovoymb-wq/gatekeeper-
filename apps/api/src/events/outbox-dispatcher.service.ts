import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { outboxEvents } from '../db/schema.js';

const MAX_ATTEMPTS = 5;
const BATCH = 50;

/**
 * Доставляет новые события из outbox в n8n (POST N8N_EVENTS_WEBHOOK_URL).
 * 2xx → delivered; иначе attempts++, при исчерпании — failed.
 * Один инстанс на MVP; при масштабировании — SELECT ... FOR UPDATE SKIP LOCKED.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async dispatch(): Promise<void> {
    if (this.running) return;
    if (!this.env.N8N_EVENTS_WEBHOOK_URL) return;
    this.running = true;
    try {
      const rows = await this.db
        .select()
        .from(outboxEvents)
        .where(and(eq(outboxEvents.status, 'new'), lt(outboxEvents.attempts, MAX_ATTEMPTS)))
        .orderBy(asc(outboxEvents.id))
        .limit(BATCH);

      for (const ev of rows) {
        const ok = await this.post(ev.topic, ev.clientId, ev.payload, ev.id);
        if (ok) {
          await this.db
            .update(outboxEvents)
            .set({ status: 'delivered' })
            .where(eq(outboxEvents.id, ev.id));
        } else {
          const attempts = ev.attempts + 1;
          await this.db
            .update(outboxEvents)
            .set({ attempts, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'new' })
            .where(eq(outboxEvents.id, ev.id));
        }
      }
    } catch (e) {
      this.logger.error(`outbox dispatch error: ${String(e)}`);
    } finally {
      this.running = false;
    }
  }

  private async post(
    topic: string,
    clientId: string | null,
    payload: unknown,
    eventId: number,
  ): Promise<boolean> {
    try {
      const res = await fetch(this.env.N8N_EVENTS_WEBHOOK_URL as string, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.env.N8N_SERVICE_TOKEN
            ? { authorization: `Bearer ${this.env.N8N_SERVICE_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ event_id: eventId, topic, client_id: clientId, payload }),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok;
    } catch (e) {
      this.logger.warn(`event ${eventId} (${topic}) delivery failed: ${String(e)}`);
      return false;
    }
  }

  /** Диагностика: сколько событий зависло в failed. */
  async failedCount(): Promise<number> {
    const r = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(outboxEvents)
      .where(eq(outboxEvents.status, 'failed'));
    return Number(r[0]?.n ?? 0);
  }
}
